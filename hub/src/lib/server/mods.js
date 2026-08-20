// Mod management for a Windrose ship.
//
// UE4SS 3.x maintains TWO registries side-by-side, and we treat them as a
// single transaction:
//
// data/R5/Binaries/Win64/ue4ss/Mods/mods.json   ← authoritative for 3.x
// /mods.txt      ← legacy mirror, CRLF, with a
// pinned `Keybinds : 1` block
// the loader requires last
//
// In addition to UE4SS Lua / DLL mods we also handle Unreal pak mods:
//
// data/R5/Content/Paks/LogicMods/<Name>.pak     ← blueprint logic mods
// /~mods/<Name>.pak  ← asset replacement (with
// optional .ucas/.utoc siblings)
//
// References:
// - https://github.com/UE4SS-RE/RE-UE4SS  (UE4SS itself)
// - https://www.nexusmods.com/windrose/mods/43  (Windrose UE4SS build)
// - https://github.com/HumanGenome/WindrosePlus
// - https://winternode.com/help/games/windrose/setup/how-to-add-mods
// - https://hypeserv.com/en/blog/how-to-install-mods-on-a-windrose-server

import { readFile, writeFile, readdir, stat, mkdir, rm, rename, copyFile, unlink } from 'fs/promises';
import { join, resolve as path_resolve, dirname, basename, extname } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { get_ship } from './fleet.js';
import { get_dir_size, cross_cp, cross_unzip } from './utils.js';

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,63}$/;

// UE4SS' built-in mods that ship with the loader. Surfaced but flagged so the
// UI can warn before deletion. Source: contents of ue4ss/Mods/ on a fresh
// install (BPModLoaderMod, ConsoleEnablerMod, etc.).
const BUILTIN = new Set([
	'BPML_GenericFunctions', 'BPModLoaderMod', 'CheatManagerEnablerMod',
	'ConsoleCommandsMod', 'ConsoleEnablerMod', 'Keybinds', 'LineTraceMod',
	'shared', 'SplitScreenMod',
]);

// `Keybinds : 1` MUST stay pinned at the bottom of mods.txt under its own
// comment. UE4SS will throw or behave incorrectly if it's moved. We treat the
// entire trailing comment+entry block as a single pinned tail.
// Match the entire trailing block - any number of CRLF/LF blank lines, the
// comment line, and the Keybinds entry. Anchoring on `\r?\n` (rather than just
// `\n`) ensures we consume the full CRLF; a bare `\n` anchor would leave an
// orphan `\r` behind that lands in the body's last line on the next write.
const KEYBINDS_TAIL_RE = /(?:\r?\n)+;\s*Built-in keybinds[^\r\n]*\r?\n\s*Keybinds\s*:\s*[01]\s*\r?\n?$/i;

const PAK_SIBLINGS = ['.pak', '.ucas', '.utoc'];

// Path helpers 

/** @param {{path: string}} ship */
function ue4ss_mods_dir(ship) {
	return join(ship.path, 'data', 'R5', 'Binaries', 'Win64', 'ue4ss', 'Mods');
}

/** @param {{path: string}} ship */
function logic_mods_dir(ship) {
	return join(ship.path, 'data', 'R5', 'Content', 'Paks', 'LogicMods');
}

/** @param {{path: string}} ship */
function asset_mods_dir(ship) {
	return join(ship.path, 'data', 'R5', 'Content', 'Paks', '~mods');
}

/** @param {{path: string}} ship - WindrosePlus runtime artefact directory */
function windrose_plus_marker(ship) {
	return join(ship.path, 'data', 'windrose_plus_data');
}

// mods.txt - CRLF-preserving parser/writer 

/**
 * Parse mods.txt while preserving the verbatim file structure so we can write
 * it back later without losing comments, CRLF, or the trailing Keybinds block.
 *
 * @param {string} path
 * @returns {Promise<{
 *   raw: string, eol: '\r\n' | '\n', present: boolean,
 *   lines: string[], enabled: Map<string, boolean>,
 *   keybinds_tail: string | null,
 * }>}
 */
async function read_mods_txt(path) {
	let raw = '';
	let present = false;
	try { raw = await readFile(path, 'utf-8'); present = true; }
	catch { return { raw: '', eol: '\r\n', present: false, lines: [], enabled: new Map(), keybinds_tail: null }; }

	const eol = raw.includes('\r\n') ? '\r\n' : '\n';

	// Capture and strip the pinned Keybinds tail so we can append safely.
	// We strip leading newlines from what we keep so the writer can choose its
	// own blank-line separator at re-attach time, instead of carrying through
	// an arbitrary count of preserved line-breaks.
	let keybinds_tail = null;
	const m = raw.match(KEYBINDS_TAIL_RE);
	if (m) {
		keybinds_tail = m[0].replace(/^[\r\n]+/, '');
		raw = raw.slice(0, raw.length - m[0].length);
	}

	const lines = raw.split(/\r?\n/);
	const enabled = new Map();
	for (const line of lines) {
		const m2 = line.match(/^\s*([^;:\s][^:]*?)\s*:\s*([01])\s*$/);
		if (m2) enabled.set(m2[1].trim(), m2[2] === '1');
	}
	return { raw, eol, present: true, lines, enabled, keybinds_tail };
}

/**
 * Set or insert a mod's enabled state in mods.txt. New mods land BEFORE the
 * pinned Keybinds tail. Preserves comments and order. If the file doesn't yet
 * exist we materialise it with a sane default skeleton.
 *
 * @param {string} path
 * @param {string} name
 * @param {boolean} on
 */
async function set_mod_enabled_txt(path, name, on) {
	let { eol, lines, present, keybinds_tail } = await read_mods_txt(path);
	if (!present) {
		// Match the in-the-wild UE4SS skeleton - empty body, then the pinned tail.
		eol = '\r\n';
		lines = [];
		keybinds_tail = `; Built-in keybinds, do not move up!${eol}Keybinds : 1${eol}`;
	}

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
		// Trim trailing blank lines so the inserted entry doesn't sit in a void.
		while (out.length && out[out.length - 1].trim() === '') out.pop();
		out.push(`${name} : ${on ? 1 : 0}`);
	}

	let body = out.join(eol);
	if (body && !body.endsWith(eol)) body += eol;
	// One blank line between body and the pinned Keybinds tail, mirroring the
	// in-the-wild UE4SS layout.
	const final = keybinds_tail ? `${body}${eol}${keybinds_tail}` : body;
	await writeFile(path, final);
}

/** @param {string} path @param {string} name */
async function remove_mod_from_txt(path, name) {
	const state = await read_mods_txt(path);
	if (!state.present) return;
	const out = state.lines.filter(line => {
		const m = line.match(/^\s*([^;:\s][^:]*?)\s*:\s*[01]\s*$/);
		return !(m && m[1].trim() === name);
	});
	while (out.length && out[out.length - 1].trim() === '') out.pop();
	let body = out.join(state.eol);
	if (body && !body.endsWith(state.eol)) body += state.eol;
	const final = state.keybinds_tail ? `${body}${state.eol}${state.keybinds_tail}` : body;
	await writeFile(path, final);
}

// mods.json - authoritative for UE4SS 3.x 

/** @param {string} path @returns {Promise<Array<{mod_name: string, mod_enabled: boolean}>>} */
async function read_mods_json(path) {
	try {
		const raw = await readFile(path, 'utf-8');
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter(e => e && typeof e.mod_name === 'string');
	} catch { /* missing or malformed - start fresh */ }
	return [];
}

/** @param {string} path @param {Array<{mod_name: string, mod_enabled: boolean}>} entries */
async function write_mods_json(path, entries) {
	await writeFile(path, JSON.stringify(entries, null, 4) + '\n');
}

/** @param {string} path @param {string} name @param {boolean} on */
async function set_mod_enabled_json(path, name, on) {
	const entries = await read_mods_json(path);
	const idx = entries.findIndex(e => e.mod_name === name);
	if (idx >= 0) entries[idx] = { mod_name: name, mod_enabled: on };
	else entries.push({ mod_name: name, mod_enabled: on });
	await write_mods_json(path, entries);
}

/** @param {string} path @param {string} name */
async function remove_mod_from_json(path, name) {
	const entries = await read_mods_json(path);
	await write_mods_json(path, entries.filter(e => e.mod_name !== name));
}

// enabled.txt sentinel for native (DLL) mods 

/** @param {string} mod_dir @param {boolean} on */
async function set_dll_enabled_sentinel(mod_dir, on) {
	const has_dll = existsSync(join(mod_dir, 'dlls', 'main.dll')) || existsSync(join(mod_dir, 'Dlls', 'main.dll'));
	if (!has_dll) return;
	const sentinel = join(mod_dir, 'enabled.txt');
	if (on) {
		try { await writeFile(sentinel, ''); } catch {}
	} else {
		try { await unlink(sentinel); } catch {}
	}
}

// Public API 

/**
 * @param {string} ship_id
 */
export async function list_mods(ship_id) {
	const ship = await get_ship(ship_id);
	if (!ship) return { ok: false, error: 'no such ship' };

	const ue4ss_dir = ue4ss_mods_dir(ship);
	const logic_dir = logic_mods_dir(ship);
	const asset_dir = asset_mods_dir(ship);

	const ue4ss_present = existsSync(ue4ss_dir);
	const windrose_plus = existsSync(windrose_plus_marker(ship));

	/** @type {Array<{ kind: 'ue4ss' | 'logic-pak' | 'asset-pak', name: string, enabled: boolean, builtin: boolean, has_lua: boolean, has_dll: boolean, size: number, mtime: number, file?: string }>} */
	const mods = [];

	// UE4SS mods (folders under ue4ss/Mods/)
	if (ue4ss_present) {
		const json_entries = await read_mods_json(join(ue4ss_dir, 'mods.json'));
		const json_enabled = new Map(json_entries.map(e => [e.mod_name, !!e.mod_enabled]));
		const { enabled: txt_enabled } = await read_mods_txt(join(ue4ss_dir, 'mods.txt'));

		const entries = await readdir(ue4ss_dir, { withFileTypes: true }).catch(() => []);
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			const sub = join(ue4ss_dir, e.name);
			let size = 0, mtime = 0;
			try {
				const s = await stat(sub);
				mtime = Math.floor(s.mtimeMs / 1000);
				size = await dir_size(sub);
			} catch {}
			mods.push({
				kind: 'ue4ss',
				name: e.name,
				// json takes precedence; fall back to txt
				enabled: json_enabled.get(e.name) ?? txt_enabled.get(e.name) ?? false,
				builtin: BUILTIN.has(e.name),
				has_lua: existsSync(join(sub, 'Scripts', 'main.lua')) || existsSync(join(sub, 'scripts', 'main.lua')),
				has_dll: existsSync(join(sub, 'dlls', 'main.dll')) || existsSync(join(sub, 'Dlls', 'main.dll')),
				size, mtime,
			});
		}
	}

	// Pak mods - LogicMods/ and ~mods/ are flat directories of .pak files.
	for (const [kind, dir] of /** @type {const} */ ([['logic-pak', logic_dir], ['asset-pak', asset_dir]])) {
		if (!existsSync(dir)) continue;
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		const seen = new Set();
		for (const e of entries) {
			if (!e.isFile()) continue;
			if (extname(e.name).toLowerCase() !== '.pak') continue;
			const stem = basename(e.name, '.pak');
			if (seen.has(stem)) continue;
			seen.add(stem);
			let size = 0, mtime = 0;
			try {
				for (const ext of PAK_SIBLINGS) {
					const p = join(dir, stem + ext);
					if (existsSync(p)) {
						const s = await stat(p);
						size += s.size;
						mtime = Math.max(mtime, Math.floor(s.mtimeMs / 1000));
					}
				}
			} catch {}
			mods.push({
				kind, name: stem, enabled: true, builtin: false,
				has_lua: false, has_dll: false, size, mtime, file: e.name,
			});
		}
	}

	mods.sort((a, b) => a.name.localeCompare(b.name));
	return {
		ok: true,
		ue4ss_present, windrose_plus,
		ue4ss_dir, logic_dir, asset_dir,
		ship_active: !!ship.active,
		mods,
	};
}

/** @param {string} dir */
async function dir_size(dir) {
	return get_dir_size(dir);
}

/** @param {string} ship_id @param {string} name @param {'ue4ss'|'logic-pak'|'asset-pak'} kind @param {boolean} on */
export async function toggle_mod(ship_id, name, kind, on) {
	if (!NAME_RE.test(name)) throw new Error('invalid mod name');
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');

	if (kind !== 'ue4ss') {
		// .pak mods aren't toggleable - UE4SS / Unreal loads anything in the
		// directory unconditionally. Surface this clearly.
		throw new Error('pak mods cannot be disabled - remove the file to disable');
	}

	const dir = ue4ss_mods_dir(ship);
	const target = path_resolve(join(dir, name));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
	if (!existsSync(target)) throw new Error('mod not installed');

	await set_mod_enabled_txt(join(dir, 'mods.txt'), name, on);
	await set_mod_enabled_json(join(dir, 'mods.json'), name, on);
	await set_dll_enabled_sentinel(target, on);
	return { ok: true };
}

/** @param {string} ship_id @param {string} name @param {'ue4ss'|'logic-pak'|'asset-pak'} kind */
export async function delete_mod(ship_id, name, kind) {
	if (!NAME_RE.test(name)) throw new Error('invalid mod name');
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');

	if (kind === 'ue4ss') {
		const dir = ue4ss_mods_dir(ship);
		const target = path_resolve(join(dir, name));
		if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
		if (!existsSync(target)) throw new Error('mod not installed');
		await rm(target, { recursive: true, force: true });
		await remove_mod_from_txt(join(dir, 'mods.txt'), name);
		await remove_mod_from_json(join(dir, 'mods.json'), name);
		return { ok: true };
	}

	const dir = kind === 'logic-pak' ? logic_mods_dir(ship) : asset_mods_dir(ship);
	for (const ext of PAK_SIBLINGS) {
		const p = path_resolve(join(dir, name + ext));
		if (!p.startsWith(path_resolve(dir) + '/')) continue;
		try { await unlink(p); } catch { /* sibling may not exist */ }
	}
	return { ok: true };
}

/**
 * Install a mod from an uploaded file. The hub auto-detects the mod kind by
 * extension:
 *   .lua / .dll                                    → ue4ss (folder under Mods/)
 *   .pak (+ optional .ucas / .utoc bundle)          → asset-pak in ~mods/
 *   .zip                                            → introspected: if it
 *                                                     contains .pak files at
 *                                                     top level, treated as a
 *                                                     pak bundle; else as a
 *                                                     UE4SS mod folder
 *
 * The caller can override target via `kind` ('ue4ss' | 'logic-pak' | 'asset-pak').
 *
 * @param {string} ship_id
 * @param {{
 *   filename: string, name?: string, enable?: boolean, kind?: 'ue4ss'|'logic-pak'|'asset-pak',
 *   bytes: ArrayBuffer | Uint8Array | Buffer,
 * }} input
 */
export async function install_mod(ship_id, input) {
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');

	const ext = extname(input.filename).toLowerCase();
	const stem = basename(input.filename, ext)
		.replace(/[^A-Za-z0-9_.-]+/g, '_')
		.replace(/^_+|_+$/g, '');
	const fallback_name = NAME_RE.test(stem) ? stem : 'UnnamedMod';
	const name = (input.name && NAME_RE.test(input.name)) ? input.name : fallback_name;

	const buf = input.bytes instanceof Buffer ? input.bytes
		: Buffer.from(input.bytes instanceof ArrayBuffer ? input.bytes : input.bytes.buffer);

	// Direct-extension installs 
	if (ext === '.lua' || ext === '.dll') {
		return install_ue4ss_loose(ship, name, ext, buf, input.enable !== false);
	}
	if (ext === '.pak' || ext === '.ucas' || ext === '.utoc') {
		const kind = input.kind === 'logic-pak' ? 'logic-pak' : 'asset-pak';
		return install_pak_single(ship, name, ext, buf, kind);
	}

	// Zip - introspect to choose target 
	if (ext === '.zip') {
		return install_zip(ship, name, buf, input.kind, input.enable !== false);
	}

	throw new Error(`unsupported file type: ${ext} (use .zip, .lua, .dll, .pak/.ucas/.utoc)`);
}

async function install_ue4ss_loose(ship, name, ext, buf, enable) {
	const dir = ue4ss_mods_dir(ship);
	await mkdir(dir, { recursive: true });
	const target = path_resolve(join(dir, name));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');

	let action;
	if (ext === '.lua') {
		await mkdir(join(target, 'Scripts'), { recursive: true });
		await writeFile(join(target, 'Scripts', 'main.lua'), buf);
		action = `placed at Mods/${name}/Scripts/main.lua`;
	} else {
		await mkdir(join(target, 'dlls'), { recursive: true });
		await writeFile(join(target, 'dlls', 'main.dll'), buf);
		action = `placed at Mods/${name}/dlls/main.dll`;
	}

	await set_mod_enabled_txt(join(dir, 'mods.txt'), name, enable);
	await set_mod_enabled_json(join(dir, 'mods.json'), name, enable);
	await set_dll_enabled_sentinel(target, enable);

	return { ok: true, kind: 'ue4ss', name, action, enabled: enable };
}

/** @param {'logic-pak' | 'asset-pak'} kind */
async function install_pak_single(ship, name, ext, buf, kind) {
	const dir = kind === 'logic-pak' ? logic_mods_dir(ship) : asset_mods_dir(ship);
	await mkdir(dir, { recursive: true });
	const target = path_resolve(join(dir, name + ext));
	if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
	await writeFile(target, buf);
	return {
		ok: true, kind, name,
		action: `placed at Content/Paks/${kind === 'logic-pak' ? 'LogicMods' : '~mods'}/${name}${ext}`,
		enabled: true,
	};
}

async function install_zip(ship, name, buf, hint_kind, enable) {
	const tmp = join(tmpdir(), `kraken-mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	await mkdir(tmp, { recursive: true });
	const zip_path = join(tmp, 'in.zip');
	await writeFile(zip_path, buf);

	await cross_unzip(zip_path, tmp);
	await unlink(zip_path).catch(() => {});

	// If single top-level dir, descend into it (typical GitHub release shape).
	let src = tmp;
	const top = (await readdir(tmp, { withFileTypes: true })).filter(e => e.name !== 'in.zip');
	if (top.length === 1 && top[0].isDirectory()) src = join(tmp, top[0].name);

	// Detect: if there's a .pak directly in src/, treat as pak bundle.
	// Otherwise treat as a UE4SS mod folder.
	const src_entries = await readdir(src, { withFileTypes: true });
	const top_paks = src_entries.filter(e => e.isFile() && extname(e.name).toLowerCase() === '.pak');

	try {
		if (top_paks.length > 0) {
			const kind = hint_kind === 'logic-pak' ? 'logic-pak' : 'asset-pak';
			const dir = kind === 'logic-pak' ? logic_mods_dir(ship) : asset_mods_dir(ship);
			await mkdir(dir, { recursive: true });
			let installed = [];
			for (const pak of top_paks) {
				const stem = basename(pak.name, '.pak');
				for (const ext of PAK_SIBLINGS) {
					const sib = join(src, stem + ext);
					if (existsSync(sib)) {
						await copyFile(sib, join(dir, stem + ext));
					}
				}
				installed.push(stem);
			}
			return {
				ok: true, kind, name: installed[0] || name,
				action: `extracted ${installed.length} pak${installed.length === 1 ? '' : 's'} → Paks/${kind === 'logic-pak' ? 'LogicMods' : '~mods'}/`,
				enabled: true, installed,
			};
		}

		// UE4SS mod folder shape.
		const dir = ue4ss_mods_dir(ship);
		await mkdir(dir, { recursive: true });
		const target = path_resolve(join(dir, name));
		if (!target.startsWith(path_resolve(dir) + '/')) throw new Error('path escape');
		if (existsSync(target)) await rm(target, { recursive: true, force: true });
		await mkdir(target, { recursive: true });
		try { await rename(src, target); }
		catch {
			await cross_cp(src, target);
		}
		await set_mod_enabled_txt(join(dir, 'mods.txt'), name, enable);
		await set_mod_enabled_json(join(dir, 'mods.json'), name, enable);
		await set_dll_enabled_sentinel(target, enable);
		return {
			ok: true, kind: 'ue4ss', name,
			action: `extracted to Mods/${name}/`,
			enabled: enable,
		};
	} finally {
		await rm(tmp, { recursive: true, force: true }).catch(() => {});
	}
}
