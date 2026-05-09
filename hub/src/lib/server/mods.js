// UE4SS mod management for a Windrose ship.
//
// Layout the dedicated server expects (resolved relative to the ship's
// `data/` directory, which is mounted at /data inside the container):
//
//   data/R5/Binaries/Win64/ue4ss/Mods/
//   ├── mods.txt              one "ModName : 0|1" line per mod
//   ├── mods.json             optional newer UE4SS index
//   ├── <ModName>/            one directory per mod
//   │   ├── enabled.txt       (UE4SS also accepts this — we keep mods.txt as truth)
//   │   ├── Scripts/main.lua  for Lua mods
//   │   └── dlls/main.dll     for native mods
//   └── ...
//
// On upload we accept:
//   - .zip       — unpacked into Mods/<inferred-name>/
//   - .lua       — placed at Mods/<inferred-name>/Scripts/main.lua
//   - .dll       — placed at Mods/<inferred-name>/dlls/main.dll

import { readFile, writeFile, mkdir, readdir, stat, rm, rename, unlink } from 'fs/promises';
import { spawn } from 'child_process';
import { join, basename, extname, resolve as path_resolve } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

import { get_ship } from './fleet.js';

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,63}$/;

// UE4SS' built-in mods that ship with the loader. We surface them but flag
// them so the UI can show a "delete" warning.
const BUILTIN = new Set([
	'BPML_GenericFunctions', 'BPModLoaderMod', 'CheatManagerEnablerMod',
	'ConsoleCommandsMod', 'ConsoleEnablerMod', 'Keybinds', 'LineTraceMod',
	'shared', 'SplitScreenMod',
]);

/** @param {{path: string}} ship */
function mods_dir(ship) {
	return join(ship.path, 'data', 'R5', 'Binaries', 'Win64', 'ue4ss', 'Mods');
}

// ─── mods.txt parsing ───────────────────────────────────────────────────────

/**
 * @param {string} path
 * @returns {Promise<{lines: string[], enabled: Map<string, boolean>}>}
 */
async function read_mods_txt(path) {
	let raw = '';
	try { raw = await readFile(path, 'utf-8'); }
	catch { return { lines: [], enabled: new Map() }; }
	const lines = raw.split('\n');
	const enabled = new Map();
	for (const line of lines) {
		const m = line.match(/^\s*([^;:\s][^:]*?)\s*:\s*([01])\s*$/);
		if (m) enabled.set(m[1].trim(), m[2] === '1');
	}
	return { lines, enabled };
}

/**
 * Set or insert a mod's enabled state in mods.txt, preserving comments and
 * line order. New mods are appended near the end (before trailing blank lines).
 *
 * @param {string} path
 * @param {string} name
 * @param {boolean} on
 */
async function set_mod_enabled(path, name, on) {
	const { lines } = await read_mods_txt(path);
	let found = false;
	const out = lines.map(line => {
		const m = line.match(/^(\s*)([^;:\s][^:]*?)(\s*):(\s*)([01])(\s*)$/);
		if (m && m[2].trim() === name) {
			found = true;
			return `${m[1]}${m[2]}${m[3]}:${m[4]}${on ? 1 : 0}${m[6]}`;
		}
		return line;
	});
	if (!found) {
		// Append before trailing blank lines, after the last non-comment entry.
		while (out.length && out[out.length - 1].trim() === '') out.pop();
		out.push(`${name} : ${on ? 1 : 0}`);
	}
	await writeFile(path, out.join('\n').replace(/\n+$/, '') + '\n');
}

/** @param {string} path @param {string} name */
async function remove_mod_from_txt(path, name) {
	const { lines } = await read_mods_txt(path);
	const out = lines.filter(line => {
		const m = line.match(/^\s*([^;:\s][^:]*?)\s*:\s*[01]\s*$/);
		return !(m && m[1].trim() === name);
	});
	await writeFile(path, out.join('\n').replace(/\n+$/, '') + '\n');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * @param {string} ship_id
 * @returns {Promise<{ ok: boolean, ue4ss_present: boolean, mods_dir: string, mods: Array<{ name: string, enabled: boolean, builtin: boolean, has_lua: boolean, has_dll: boolean, size: number, mtime: number }> } | { ok: false, error: string }>}
 */
export async function list_mods(ship_id) {
	const ship = await get_ship(ship_id);
	if (!ship) return { ok: false, error: 'no such ship' };
	const dir = mods_dir(ship);

	if (!existsSync(dir)) {
		return { ok: true, ue4ss_present: false, mods_dir: dir, mods: [] };
	}

	const { enabled } = await read_mods_txt(join(dir, 'mods.txt'));
	const entries = await readdir(dir, { withFileTypes: true });
	const mods = [];
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const name = e.name;
		const sub = join(dir, name);
		let size = 0, mtime = 0;
		try {
			const s = await stat(sub);
			mtime = Math.floor(s.mtimeMs / 1000);
			size = await dir_size(sub);
		} catch {}
		mods.push({
			name,
			enabled: enabled.get(name) ?? false,
			builtin: BUILTIN.has(name),
			has_lua: existsSync(join(sub, 'Scripts', 'main.lua')) || existsSync(join(sub, 'scripts', 'main.lua')),
			has_dll: existsSync(join(sub, 'dlls', 'main.dll')) || existsSync(join(sub, 'Dlls', 'main.dll')),
			size,
			mtime,
		});
	}
	mods.sort((a, b) => a.name.localeCompare(b.name));
	return { ok: true, ue4ss_present: true, mods_dir: dir, mods };
}

/** @param {string} dir */
async function dir_size(dir) {
	return new Promise(resolve => {
		const proc = spawn('du', ['-sb', dir]);
		let buf = '';
		proc.stdout.on('data', d => buf += d.toString());
		proc.on('close', () => resolve(parseInt(buf.split('\t')[0]) || 0));
		setTimeout(() => proc.kill(), 5000);
	});
}

/**
 * @param {string} ship_id
 * @param {string} name
 * @param {boolean} on
 */
export async function toggle_mod(ship_id, name, on) {
	if (!NAME_RE.test(name)) throw new Error('invalid mod name');
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');
	const dir = mods_dir(ship);
	const target = path_resolve(join(dir, name));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
	if (!existsSync(target)) throw new Error('mod not installed');
	await set_mod_enabled(join(dir, 'mods.txt'), name, on);
	return { ok: true };
}

/**
 * @param {string} ship_id
 * @param {string} name
 */
export async function delete_mod(ship_id, name) {
	if (!NAME_RE.test(name)) throw new Error('invalid mod name');
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');
	const dir = mods_dir(ship);
	const target = path_resolve(join(dir, name));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
	if (!existsSync(target)) throw new Error('mod not installed');
	await rm(target, { recursive: true, force: true });
	await remove_mod_from_txt(join(dir, 'mods.txt'), name);
	return { ok: true };
}

/**
 * Install a mod from an uploaded file. Returns the resolved mod name + a
 * description of what we did with the file.
 *
 * @param {string} ship_id
 * @param {{ filename: string, name?: string, enable?: boolean, bytes: ArrayBuffer | Uint8Array | Buffer }} input
 */
export async function install_mod(ship_id, input) {
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');
	const dir = mods_dir(ship);
	await mkdir(dir, { recursive: true });

	const ext = extname(input.filename).toLowerCase();
	const stem = basename(input.filename, ext)
		.replace(/[^A-Za-z0-9_.-]+/g, '_')
		.replace(/^_+|_+$/g, '');
	const name = (input.name && NAME_RE.test(input.name)) ? input.name
		: (NAME_RE.test(stem) ? stem : 'UnnamedMod');

	const target = path_resolve(join(dir, name));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');

	const buf = input.bytes instanceof Buffer ? input.bytes
		: Buffer.from(input.bytes instanceof ArrayBuffer ? input.bytes : input.bytes.buffer);

	let action = '';
	if (ext === '.zip') {
		action = await install_zip(buf, target);
	} else if (ext === '.lua') {
		await mkdir(join(target, 'Scripts'), { recursive: true });
		await writeFile(join(target, 'Scripts', 'main.lua'), buf);
		action = `placed at Mods/${name}/Scripts/main.lua`;
	} else if (ext === '.dll') {
		await mkdir(join(target, 'dlls'), { recursive: true });
		await writeFile(join(target, 'dlls', 'main.dll'), buf);
		action = `placed at Mods/${name}/dlls/main.dll`;
	} else {
		throw new Error(`unsupported file type: ${ext} (use .zip, .lua, .dll)`);
	}

	const enable = input.enable !== false;
	await set_mod_enabled(join(dir, 'mods.txt'), name, enable);

	return { ok: true, name, action, enabled: enable };
}

/**
 * Extract a zip into target/ — flatten one level if the archive contains a
 * single top-level dir (the common case for GitHub-released mod zips).
 *
 * @param {Buffer} buf
 * @param {string} target
 * @returns {Promise<string>}
 */
async function install_zip(buf, target) {
	const tmp = join(tmpdir(), `kraken-mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	await mkdir(tmp, { recursive: true });
	const zip_path = join(tmp, 'in.zip');
	await writeFile(zip_path, buf);

	await new Promise((resolve, reject) => {
		const p = spawn('unzip', ['-q', '-o', zip_path, '-d', tmp]);
		let err = '';
		p.stderr.on('data', d => err += d.toString());
		p.on('close', code => code === 0 ? resolve(undefined)
			: reject(new Error(`unzip exited ${code}: ${err.trim()}`)));
		setTimeout(() => p.kill(), 60_000);
	});

	await unlink(zip_path).catch(() => {});

	// If the zip extracted a single top-level dir, treat that as the mod root.
	let src = tmp;
	const top = (await readdir(tmp, { withFileTypes: true })).filter(e => e.name !== 'in.zip');
	if (top.length === 1 && top[0].isDirectory()) {
		src = join(tmp, top[0].name);
	}

	if (existsSync(target)) await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	// rename src → target if same fs, else fall back to recursive copy via cp -a
	try {
		await rename(src, target);
	} catch {
		await new Promise((resolve, reject) => {
			const p = spawn('cp', ['-a', `${src}/.`, target]);
			p.on('close', code => code === 0 ? resolve(undefined) : reject(new Error('cp failed')));
		});
	}
	await rm(tmp, { recursive: true, force: true }).catch(() => {});

	return `extracted to Mods/${basename(target)}/`;
}
