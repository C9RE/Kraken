// System / self-update for the hub itself.
//
// The hub runs from a checkout of github.com/C9RE/Kraken (or any fork). It can
// pull the latest commits, reinstall deps, rebuild, and restart - so users
// don't have to ssh in and re-clone every time we ship a fix.
//
// Restart strategy:
// 1. If running under systemd (KRAKEN_SYSTEMD_UNIT is set), exit cleanly and
//    let systemd's Restart=always bring us back.
// 2. Otherwise spawn a detached shell that waits, kills the parent, and
//    re-execs `bun run start` from the same cwd. Falls back to a manual-
//    restart message if neither path works.

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Where the hub's checkout lives on disk. The user runs `bun run start` from
// the hub directory, so process.cwd() is the right default. Override with
// KRAKEN_HUB_DIR if you're starting it from somewhere else (eg systemd).
const HUB_DIR = resolve(process.env.KRAKEN_HUB_DIR || process.cwd());
const REPO_DIR = resolve(HUB_DIR, '..');

// Track whatever branch the working copy is checked out to, unless overridden.
// Resolved lazily on first use so we read it from the actual repo.
const REMOTE = process.env.KRAKEN_GIT_REMOTE || 'origin';
const BRANCH_OVERRIDE = process.env.KRAKEN_GIT_BRANCH || '';

// Optional systemd unit name. When set, "Apply update" exits cleanly so
// systemd restarts us with the new build.
const SYSTEMD_UNIT = process.env.KRAKEN_SYSTEMD_UNIT || '';

const STARTED_AT = Math.floor(Date.now() / 1000);

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string, timeout?: number}} [opts]
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, code: number}>}
 */
function run(cmd, args, opts = {}) {
	return new Promise(resolve => {
		const proc = spawn(cmd, args, { cwd: opts.cwd || REPO_DIR });
		let stdout = '', stderr = '';
		proc.stdout.on('data', d => stdout += d.toString());
		proc.stderr.on('data', d => stderr += d.toString());
		proc.on('close', code => resolve({
			ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? -1,
		}));
		const t = setTimeout(() => proc.kill(), opts.timeout || 120_000);
		proc.on('close', () => clearTimeout(t));
	});
}

async function git(args, opts) { return run('git', args, opts); }

/** Read a single line of `git ...` output. */
async function git_line(args) {
	const r = await git(args, { timeout: 10_000 });
	return r.ok ? r.stdout.trim() : '';
}

/**
 * Snapshot the local repo state plus what's available on the remote.
 *
 * @returns {Promise<{
 *   ok: boolean, error?: string,
 *   repo_dir: string, hub_dir: string,
 *   branch: string, remote: string, remote_url: string,
 *   current_sha: string, current_short: string, current_subject: string, current_date: string,
 *   remote_sha: string, remote_short: string, remote_subject: string, remote_date: string,
 *   ahead: number, behind: number, dirty: boolean,
 *   update_available: boolean,
 *   systemd_unit: string, started_at: number, uptime_seconds: number,
 *   pid: number, node_version: string,
 * }>}
 */
export async function get_status() {
	if (!existsSync(`${REPO_DIR}/.git`)) {
		return {
			ok: false,
			error: `not a git checkout: ${REPO_DIR} (set KRAKEN_HUB_DIR to point at the hub directory inside a clone)`,
			repo_dir: REPO_DIR, hub_dir: HUB_DIR,
			branch: '', remote: REMOTE, remote_url: '',
			current_sha: '', current_short: '', current_subject: '', current_date: '',
			remote_sha: '', remote_short: '', remote_subject: '', remote_date: '',
			ahead: 0, behind: 0, dirty: false,
			update_available: false,
			systemd_unit: SYSTEMD_UNIT, started_at: STARTED_AT,
			uptime_seconds: Math.floor(Date.now() / 1000) - STARTED_AT,
			pid: process.pid, node_version: process.version,
		};
	}

	// Resolve the branch to track: explicit override, else whatever HEAD is on.
	const branch = BRANCH_OVERRIDE || await git_line(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
	// Refresh remote refs so ahead/behind is real.
	await git(['fetch', REMOTE, branch], { timeout: 30_000 });
	const current_sha = await git_line(['rev-parse', 'HEAD']);
	const current_short = current_sha.slice(0, 7);
	const current_subject = await git_line(['log', '-1', '--pretty=%s']);
	const current_date = await git_line(['log', '-1', '--pretty=%cI']);
	const remote_url = await git_line(['remote', 'get-url', REMOTE]);
	const remote_ref = `${REMOTE}/${branch}`;
	const remote_sha = await git_line(['rev-parse', remote_ref]);
	const remote_short = remote_sha.slice(0, 7);
	const remote_subject = remote_sha ? await git_line(['log', '-1', '--pretty=%s', remote_sha]) : '';
	const remote_date = remote_sha ? await git_line(['log', '-1', '--pretty=%cI', remote_sha]) : '';

	const ahead_r = await git_line(['rev-list', '--count', `${remote_ref}..HEAD`]);
	const behind_r = await git_line(['rev-list', '--count', `HEAD..${remote_ref}`]);
	const ahead = parseInt(ahead_r) || 0;
	const behind = parseInt(behind_r) || 0;

	// Dirty tracking is informational only - apply_update uses `reset --hard`
	// and overwrites anything in the way. We still report it so the UI can
	// warn the user about what's about to get nuked before they click apply.
	const status_r = await git(['status', '--porcelain'], { timeout: 10_000 });
	const dirty_files = status_r.ok
		? status_r.stdout.split('\n').map(l => l.trim()).filter(Boolean)
		: [];
	const dirty = dirty_files.length > 0;

	return {
		ok: true,
		repo_dir: REPO_DIR, hub_dir: HUB_DIR,
		branch, remote: REMOTE, remote_url,
		current_sha, current_short, current_subject, current_date,
		remote_sha, remote_short, remote_subject, remote_date,
		ahead, behind, dirty, dirty_files,
		update_available: behind > 0,
		systemd_unit: SYSTEMD_UNIT, started_at: STARTED_AT,
		uptime_seconds: Math.floor(Date.now() / 1000) - STARTED_AT,
		pid: process.pid, node_version: process.version,
	};
}

/**
 * Pull, install, build, restart. Returns a streamed-style log so the UI can
 * show what happened.
 *
 * Update strategy: `fetch` + `reset --hard origin/<branch>`. This always
 * succeeds even if the working tree has local edits (we get stuck otherwise
 * because there's no merge UI). If the tree IS dirty we refuse to proceed
 * unless the caller passes `confirm_discard: true`, and we log the discarded
 * files so it isn't silent. The UI shows the file list in the confirm dialog.
 *
 * Restart hand-off:
 * - If KRAKEN_SYSTEMD_UNIT is set, we exit(0) once the build is done. systemd
 *   brings us back with the new binary.
 * - Else we spawn a detached `update.sh restart` that kills our pid and
 *   re-execs `bun run start` from HUB_DIR. The HTTP response should already
 *   have been sent by then.
 * - If neither works we still return ok with a "manual restart needed" hint.
 *
 * @param {{ confirm_discard?: boolean }} [opts]
 */
export async function apply_update(opts = {}) {
	const status = await get_status();
	if (!status.ok) return { ok: false, error: status.error, log: [] };
	if (status.behind === 0) {
		return { ok: false, error: 'already up to date', log: [], status };
	}
	if (status.dirty && !opts.confirm_discard) {
		return {
			ok: false,
			error: `working tree has ${status.dirty_files.length} uncommitted change(s); pass confirm_discard to overwrite them`,
			log: [],
			status,
		};
	}

	/** @type {Array<{step: string, ok: boolean, output: string}>} */
	const log = [];

	if (status.dirty) {
		log.push({
			step: 'discard local changes',
			ok: true,
			output: status.dirty_files.slice(0, 50).join('\n')
				+ (status.dirty_files.length > 50 ? `\n... +${status.dirty_files.length - 50} more` : ''),
		});
	}

	const fetch_r = await git(['fetch', REMOTE, status.branch], { timeout: 60_000 });
	log.push({ step: 'git fetch', ok: fetch_r.ok, output: (fetch_r.stdout + '\n' + fetch_r.stderr).trim() });
	if (!fetch_r.ok) return { ok: false, error: 'git fetch failed', log };

	const reset_r = await git(['reset', '--hard', `${REMOTE}/${status.branch}`], { timeout: 30_000 });
	log.push({ step: 'git reset --hard', ok: reset_r.ok, output: (reset_r.stdout + '\n' + reset_r.stderr).trim() });
	if (!reset_r.ok) return { ok: false, error: 'git reset failed', log };

	const install = await run('bun', ['install'], { cwd: HUB_DIR, timeout: 300_000 });
	log.push({ step: 'bun install', ok: install.ok, output: (install.stdout + '\n' + install.stderr).trim() });
	if (!install.ok) return { ok: false, error: 'bun install failed', log };

	const build = await run('bun', ['run', 'build'], { cwd: HUB_DIR, timeout: 300_000 });
	log.push({ step: 'bun run build', ok: build.ok, output: (build.stdout + '\n' + build.stderr).trim() });
	if (!build.ok) return { ok: false, error: 'bun run build failed', log };

	const after = await get_status();

	// Restart. Schedule the hand-off slightly after responding so the HTTP
	// response makes it back to the client.
	if (SYSTEMD_UNIT) {
		setTimeout(() => process.exit(0), 800);
		log.push({ step: 'restart', ok: true, output: `exiting; systemd unit ${SYSTEMD_UNIT} will respawn` });
		return { ok: true, restart: 'systemd', log, status: after };
	}

	const update_sh = `${HUB_DIR}/update.sh`;
	if (existsSync(update_sh)) {
		const child = spawn('bash', [update_sh, 'restart', String(process.pid)], {
			cwd: HUB_DIR,
			detached: true, stdio: 'ignore', env: { ...process.env, KRAKEN_HUB_DIR: HUB_DIR },
		});
		child.unref();
		log.push({ step: 'restart', ok: true, output: 'detached update.sh will respawn the hub in ~3s' });
		return { ok: true, restart: 'detached', log, status: after };
	}

	log.push({
		step: 'restart',
		ok: false,
		output: 'no systemd unit and no update.sh - manual restart required (build is up to date on disk)',
	});
	return { ok: true, restart: 'manual', log, status: after };
}

/** Read package.json version for display. */
export async function read_version() {
	try {
		const raw = await readFile(`${HUB_DIR}/package.json`, 'utf-8');
		const pkg = JSON.parse(raw);
		return pkg.version || '0.0.0';
	} catch { return '0.0.0'; }
}
