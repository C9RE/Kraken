// Fleet management — multiple Windrose dedicated server instances.
//
// Each "ship" is a docker-compose stack on disk:
//   $KRAKEN_FLEET_ROOT/<id>/
//     ├── docker-compose.yml      copied from the Kraken template
//     ├── .env                    generated from form data, edited via UI
//     ├── data/                   game files + saves
//     ├── steam-home/             Wine prefix + SteamCMD cache
//     └── backups/                save tarballs
//
// The hub itself only needs network reach to a Docker daemon (the host's
// /var/run/docker.sock is the simplest deployment) and write access to
// $KRAKEN_FLEET_ROOT.

import { readFile, writeFile, mkdir, readdir, stat, copyFile, rm } from 'fs/promises';
import { spawn } from 'child_process';
import { join, resolve as path_resolve } from 'path';
import { existsSync } from 'fs';

const FLEET_ROOT = process.env.KRAKEN_FLEET_ROOT
	? path_resolve(process.env.KRAKEN_FLEET_ROOT)
	: path_resolve(process.cwd(), 'fleet');
const FLEET_INDEX = join(FLEET_ROOT, 'fleet.json');

// Default template: the parent of this hub directory IS the Kraken fork,
// so docker-compose.yml is one level up. Override with KRAKEN_TEMPLATE.
const KRAKEN_TEMPLATE = process.env.KRAKEN_TEMPLATE
	? path_resolve(process.env.KRAKEN_TEMPLATE)
	: path_resolve(process.cwd(), '..');

const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;

/** @typedef {{
 *   id: string, name: string, path: string, created_at: number, notes?: string,
 * }} ShipRecord */

/** @returns {Promise<ShipRecord[]>} */
async function read_index() {
	try { return JSON.parse(await readFile(FLEET_INDEX, 'utf-8')); }
	catch { return []; }
}

/** @param {ShipRecord[]} ships */
async function write_index(ships) {
	await mkdir(FLEET_ROOT, { recursive: true });
	await writeFile(FLEET_INDEX, JSON.stringify(ships, null, 2));
}

// ─── Compose helpers ────────────────────────────────────────────────────────

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {number} [timeout_ms]
 * @returns {Promise<{ok: boolean, output: string}>}
 */
function compose(cwd, args, timeout_ms = 180_000) {
	return new Promise(resolve => {
		const proc = spawn('docker', ['compose', ...args], { cwd });
		let buf = '';
		proc.stdout.on('data', d => buf += d.toString());
		proc.stderr.on('data', d => buf += d.toString());
		proc.on('close', code => resolve({ ok: code === 0, output: buf.trim() }));
		setTimeout(() => proc.kill(), timeout_ms);
	});
}

/** @param {string} container */
function container_state(container) {
	return new Promise(resolve => {
		const proc = spawn('docker', [
			'inspect', '--format',
			'{{.State.Status}}|{{.State.Health.Status}}|{{.State.StartedAt}}',
			container,
		]);
		let buf = '';
		proc.stdout.on('data', d => buf += d.toString());
		proc.on('close', code => {
			if (code !== 0) return resolve({ status: 'absent', health: '', started_at: 0 });
			const [status, health, started_at] = buf.trim().split('|');
			const ts = started_at && started_at !== '0001-01-01T00:00:00Z'
				? Math.floor(new Date(started_at).getTime() / 1000) : 0;
			resolve({ status, health, started_at: ts });
		});
		setTimeout(() => proc.kill(), 5000);
	});
}

// ─── .env parse / write (preserve order + comments) ─────────────────────────

/** @param {string} path @returns {Promise<Record<string, string>>} */
export async function read_env(path) {
	try {
		const raw = await readFile(path, 'utf-8');
		/** @type {Record<string, string>} */
		const out = {};
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m) out[m[1]] = m[2];
		}
		return out;
	} catch { return {}; }
}

/** @param {string} path @param {Record<string,string>} updates */
async function write_env(path, updates) {
	let lines = [];
	try { lines = (await readFile(path, 'utf-8')).split('\n'); }
	catch { /* fresh file */ }

	const seen = new Set();
	const next = lines.map(line => {
		const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
		if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
			seen.add(m[1]);
			return `${m[1]}=${updates[m[1]]}`;
		}
		return line;
	});
	for (const [k, v] of Object.entries(updates)) {
		if (!seen.has(k)) next.push(`${k}=${v}`);
	}
	await writeFile(path, next.join('\n').replace(/\n+$/, '') + '\n');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function list_ships() {
	const ships = await read_index();
	const out = [];
	for (const s of ships) {
		const env = await read_env(join(s.path, '.env'));
		const container = env.CONTAINER_NAME || s.id;
		const state = await container_state(container);
		out.push({
			...s,
			container,
			image_tag: env.IMAGE_TAG || '',
			invite_code: env.INVITE_CODE || '',
			port: parseInt(env.PORT || '7777'),
			max_players: parseInt(env.MAX_PLAYERS || '8'),
			server_name: env.SERVER_NAME || s.name,
			active: state.status === 'running',
			health: state.health,
			started_at: state.started_at,
		});
	}
	return out;
}

/** @param {string} id */
export async function get_ship(id) {
	const ships = await read_index();
	const ship = ships.find(s => s.id === id);
	if (!ship) return null;
	const env = await read_env(join(ship.path, '.env'));
	const container = env.CONTAINER_NAME || ship.id;
	const state = await container_state(container);

	let storage_bytes = 0;
	try {
		const buf = await new Promise((resolve, reject) => {
			const p = spawn('du', ['-sb', join(ship.path, 'data')]);
			let b = '';
			p.stdout.on('data', d => b += d.toString());
			p.on('close', code => code === 0 ? resolve(b) : reject());
			setTimeout(() => p.kill(), 5000);
		});
		storage_bytes = parseInt(String(buf).split('\t')[0]) || 0;
	} catch { /* ignore */ }

	return {
		...ship, container, env,
		active: state.status === 'running',
		health: state.health,
		started_at: state.started_at,
		storage_bytes,
	};
}

/**
 * Create a new ship: copy compose template + write .env, register in index.
 * Does not start it. Caller posts { action: 'start' } afterward.
 *
 * @param {{
 *   id: string, name: string, invite_code?: string, server_note?: string,
 *   max_players?: number, port?: number, queryport?: number,
 *   server_password?: string, image_tag?: string, hostname?: string,
 * }} input
 */
export async function create_ship(input) {
	if (!ID_RE.test(input.id)) throw new Error('id must match /^[a-z][a-z0-9-]{1,30}$/');
	if (!input.name) throw new Error('name required');

	const ships = await read_index();
	if (ships.find(s => s.id === input.id)) throw new Error(`ship "${input.id}" already exists`);

	const path = join(FLEET_ROOT, input.id);
	if (existsSync(path)) throw new Error(`directory ${path} already present — refusing to overwrite`);

	await mkdir(path, { recursive: true });
	for (const sub of ['data', 'steam-home', 'backups']) {
		await mkdir(join(path, sub), { recursive: true });
	}

	const compose_src = join(KRAKEN_TEMPLATE, 'docker-compose.yml');
	if (!existsSync(compose_src)) {
		throw new Error(`template not found: ${compose_src} (set KRAKEN_TEMPLATE env)`);
	}
	await copyFile(compose_src, join(path, 'docker-compose.yml'));

	// Pick ports that don't collide with any existing ship. Each ship runs
	// with `network_mode: host`, so a clash means the new server fails to bind.
	const used = new Set();
	for (const s of ships) {
		const e = await read_env(join(s.path, '.env'));
		const p = parseInt(e.PORT || ''), q = parseInt(e.QUERYPORT || '');
		if (Number.isFinite(p)) used.add(p);
		if (Number.isFinite(q)) used.add(q);
	}
	let auto_port = 7777;
	while (used.has(auto_port) || used.has(auto_port + 1)) auto_port += 10;
	const port = input.port ?? auto_port;
	const queryport = input.queryport ?? port + 1;
	if (input.port && (used.has(port) || used.has(queryport))) {
		throw new Error(`port ${used.has(port) ? port : queryport} is already used by another ship`);
	}

	const env = {
		CONTAINER_NAME: `windrose-${input.id}`,
		HOSTNAME: input.hostname || 'localhost',
		IMAGE_REPOSITORY: 'ghcr.io/uberdudepl/windrose-dedicated-server-docker',
		IMAGE_TAG: input.image_tag || 'v1.6.2',
		PUID: '1000', PGID: '1000',
		STEAM_LOGIN: 'anonymous', STEAM_PASS: '',
		WINDROSE_APP_ID: '4129620',
		UPDATE_ON_START: 'true',
		GENERATE_SETTINGS: 'true',
		INVITE_CODE: input.invite_code || '',
		SERVER_NAME: input.name,
		SERVER_NOTE: input.server_note || '',
		SERVER_PASSWORD: input.server_password || '',
		MAX_PLAYERS: String(input.max_players ?? 4),
		P2P_PROXY_ADDRESS: '127.0.0.1',
		PORT: String(port),
		QUERYPORT: String(queryport),
		MULTIHOME: '0.0.0.0',
	};
	await write_env(join(path, '.env'), env);

	const record = {
		id: input.id, name: input.name, path,
		created_at: Math.floor(Date.now() / 1000),
	};
	await write_index([...ships, record]);
	return record;
}

/** @param {string} id @param {Record<string,string>} updates */
export async function update_ship_env(id, updates) {
	const ship = await get_ship(id);
	if (!ship) throw new Error(`no such ship: ${id}`);
	await write_env(join(ship.path, '.env'), updates);
	return { ok: true };
}

/** @param {string} id @param {'start'|'stop'|'restart'|'pull'} action */
export async function ship_compose_action(id, action) {
	const ship = await get_ship(id);
	if (!ship) throw new Error(`no such ship: ${id}`);
	const args = action === 'start'   ? ['up', '-d']
	          : action === 'stop'     ? ['stop']
	          : action === 'restart'  ? ['restart']
	          : action === 'pull'     ? ['pull']
	          : null;
	if (!args) throw new Error(`unknown action: ${action}`);
	return compose(ship.path, args);
}

/** docker compose pull && up -d  @param {string} id */
export async function refit_ship(id) {
	const ship = await get_ship(id);
	if (!ship) throw new Error(`no such ship: ${id}`);
	const pull = await compose(ship.path, ['pull'], 300_000);
	if (!pull.ok) return { ok: false, output: pull.output };
	const up = await compose(ship.path, ['up', '-d'], 180_000);
	return { ok: up.ok, output: pull.output + '\n' + up.output };
}

/** @param {string} id */
export async function backup_ship(id) {
	const ship = await get_ship(id);
	if (!ship) throw new Error(`no such ship: ${id}`);
	const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
	const name  = `windrose-saves-manual-${stamp}.tar.gz`;
	const archive = join(ship.path, 'backups', name);
	await mkdir(join(ship.path, 'backups'), { recursive: true });

	const result = await new Promise(resolve => {
		const proc = spawn('tar', [
			'czf', archive,
			'data/R5/Saved',
			'data/R5/ServerDescription.json',
		], { cwd: ship.path });
		let buf = '';
		proc.stderr.on('data', d => buf += d.toString());
		proc.on('close', code => resolve({ ok: code === 0, output: buf.trim() }));
		setTimeout(() => proc.kill(), 120_000);
	});
	if (!result.ok) return { ok: false, error: result.output };
	let size = 0;
	try { size = (await stat(archive)).size; } catch {}
	return { ok: true, name, size };
}

/** @param {string} id */
export async function list_ship_backups(id) {
	const ship = await get_ship(id);
	if (!ship) return [];
	const dir = join(ship.path, 'backups');
	let files;
	try { files = await readdir(dir); } catch { return []; }
	const out = [];
	for (const f of files) {
		if (!f.endsWith('.tar.gz') && !f.endsWith('.tgz')) continue;
		try {
			const s = await stat(join(dir, f));
			out.push({ name: f, size: s.size, mtime: Math.floor(s.mtimeMs / 1000) });
		} catch {}
	}
	out.sort((a, b) => b.mtime - a.mtime);
	return out;
}

/** @param {string} id @param {{ purge?: boolean }} opts */
export async function scuttle_ship(id, opts = {}) {
	const ships = await read_index();
	const ship = ships.find(s => s.id === id);
	if (!ship) throw new Error(`no such ship: ${id}`);

	await compose(ship.path, ['down'], 120_000);
	if (opts.purge && ship.path.startsWith(FLEET_ROOT + '/')) {
		await rm(ship.path, { recursive: true, force: true });
	}
	await write_index(ships.filter(s => s.id !== id));
	return { ok: true };
}

/** @param {string} id @param {number} lines */
export async function ship_logs(id, lines = 200) {
	const ship = await get_ship(id);
	if (!ship) return '';
	return new Promise(resolve => {
		const proc = spawn('docker', ['logs', '--tail', String(lines), ship.container]);
		let buf = '';
		proc.stdout.on('data', d => buf += d.toString());
		proc.stderr.on('data', d => buf += d.toString());
		proc.on('close', () => resolve(buf));
		setTimeout(() => proc.kill(), 10_000);
	});
}

export const FLEET_PATHS = { FLEET_ROOT, KRAKEN_TEMPLATE };
