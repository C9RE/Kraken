// Voyage settings — per-world gameplay/difficulty knobs.
//
// Lives in WorldDescription.json under each save profile. The on-disk shape
// (verified against a real Windrose dedicated server save):
//
//   {
//     "Version": 1,
//     "WorldDescription": {
//       "islandId": "<32-hex>",
//       "WorldName": "Portal",
//       "CreationTime": 6.39e+17,
//       "WorldPresetType": "Easy" | "Medium" | "Hard" | "Custom",
//       "WorldSettings": {
//         "BoolParameters":  { "{\"TagName\": \"WDS.Parameter.Coop.SharedQuests\"}": true, ... },
//         "FloatParameters": { "{\"TagName\": \"WDS.Parameter.MobHealthMultiplier\"}": 1, ... },
//         "TagParameters":   { "{\"TagName\": \"WDS.Parameter.CombatDifficulty\"}":
//                                { "TagName": "WDS.Parameter.CombatDifficulty.Normal" } }
//       }
//     }
//   }
//
// Things that will trip you up writing this back:
//   - Keys are STRINGS containing JSON  ("{\"TagName\": \"X\"}"). Don't try to
//     "fix" them; the game parses them that way.
//   - Editing any value in a non-Custom preset flips WorldPresetType to Custom
//     on next load (game-side behaviour, not ours). The hub honours this by
//     setting WorldPresetType = Custom whenever the user touches a slider.
//   - The container MUST be stopped before writing — the game holds the file
//     and will overwrite our changes on its next world flush.

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { get_ship } from './fleet.js';

// Where save profiles live, relative to a ship's `data/`. Two RocksDB layouts
// have been seen in the wild — `RocksDB` (older) and `RocksDB_v2` (newer);
// we walk both.
const PROFILE_ROOTS = ['R5/Saved/SaveProfiles/Default'];
const ROCKSDB_DIRS = ['RocksDB_v2', 'RocksDB'];

// Public knob keys we surface in the UI. The actual JSON keys are the
// quoted-JSON form of these tag names.
export const FLOAT_KNOBS = /** @type {const} */ ([
	{ tag: 'WDS.Parameter.MobHealthMultiplier',              label: 'enemy hp',            min: 0.2, max: 5.0, step: 0.05 },
	{ tag: 'WDS.Parameter.MobDamageMultiplier',              label: 'enemy damage',        min: 0.2, max: 5.0, step: 0.05 },
	{ tag: 'WDS.Parameter.ShipsHealthMultiplier',            label: 'ship hp',             min: 0.4, max: 5.0, step: 0.05 },
	{ tag: 'WDS.Parameter.ShipsDamageMultiplier',            label: 'ship damage',         min: 0.2, max: 2.5, step: 0.05 },
	{ tag: 'WDS.Parameter.BoardingDifficultyMultiplier',     label: 'boarding difficulty', min: 0.2, max: 5.0, step: 0.05 },
	{ tag: 'WDS.Parameter.Coop.StatsCorrectionModifier',     label: 'coop enemy scaling',  min: 0.0, max: 2.0, step: 0.05 },
	{ tag: 'WDS.Parameter.Coop.ShipStatsCorrectionModifier', label: 'coop ship scaling',   min: 0.0, max: 2.0, step: 0.05 },
]);

export const BOOL_KNOBS = /** @type {const} */ ([
	{ tag: 'WDS.Parameter.Coop.SharedQuests', label: 'shared quests' },
	{ tag: 'WDS.Parameter.EasyExplore',       label: 'easy explore'  },
]);

// Built-in difficulty presets — values lifted from Windrose's own preset table
// so "Medium" puts every multiplier back to 1.0.
export const PRESETS = {
	Easy: {
		combat: 'Easy',
		floats: {
			'WDS.Parameter.MobHealthMultiplier':              0.7,
			'WDS.Parameter.MobDamageMultiplier':              0.7,
			'WDS.Parameter.ShipsHealthMultiplier':            1.5,
			'WDS.Parameter.ShipsDamageMultiplier':            1.3,
			'WDS.Parameter.BoardingDifficultyMultiplier':     0.5,
			'WDS.Parameter.Coop.StatsCorrectionModifier':     0.0,
			'WDS.Parameter.Coop.ShipStatsCorrectionModifier': 0.0,
		},
		bools: {
			'WDS.Parameter.Coop.SharedQuests': true,
			'WDS.Parameter.EasyExplore':       true,
		},
	},
	Medium: {
		combat: 'Normal',
		floats: {
			'WDS.Parameter.MobHealthMultiplier':              1.0,
			'WDS.Parameter.MobDamageMultiplier':              1.0,
			'WDS.Parameter.ShipsHealthMultiplier':            1.0,
			'WDS.Parameter.ShipsDamageMultiplier':            1.0,
			'WDS.Parameter.BoardingDifficultyMultiplier':     1.0,
			'WDS.Parameter.Coop.StatsCorrectionModifier':     1.0,
			'WDS.Parameter.Coop.ShipStatsCorrectionModifier': 1.0,
		},
		bools: {
			'WDS.Parameter.Coop.SharedQuests': true,
			'WDS.Parameter.EasyExplore':       false,
		},
	},
	Hard: {
		combat: 'Hard',
		floats: {
			'WDS.Parameter.MobHealthMultiplier':              1.5,
			'WDS.Parameter.MobDamageMultiplier':              1.5,
			'WDS.Parameter.ShipsHealthMultiplier':            0.7,
			'WDS.Parameter.ShipsDamageMultiplier':            0.8,
			'WDS.Parameter.BoardingDifficultyMultiplier':     1.5,
			'WDS.Parameter.Coop.StatsCorrectionModifier':     1.5,
			'WDS.Parameter.Coop.ShipStatsCorrectionModifier': 1.5,
		},
		bools: {
			'WDS.Parameter.Coop.SharedQuests': false,
			'WDS.Parameter.EasyExplore':       false,
		},
	},
};

// ─── Tag-key helpers (the "{\"TagName\":\"X\"}" wrapping) ───────────────────

const tag_key = (tag) => `{"TagName": "${tag}"}`;
function find_tag_value(obj, tag) {
	if (!obj) return undefined;
	const direct = obj[tag_key(tag)];
	if (direct !== undefined) return direct;
	// Tolerate whitespace variation Windrose has used: `{ "TagName" : "..." }`
	for (const [k, v] of Object.entries(obj)) {
		try {
			const parsed = JSON.parse(k);
			if (parsed?.TagName === tag) return v;
		} catch {}
	}
	return undefined;
}
function set_tag_value(obj, tag, value) {
	const key = tag_key(tag);
	for (const k of Object.keys(obj)) {
		try {
			const parsed = JSON.parse(k);
			if (parsed?.TagName === tag) { delete obj[k]; }
		} catch {}
	}
	obj[key] = value;
}

// ─── Walk worlds ────────────────────────────────────────────────────────────

/** @param {string} ship_path */
async function locate_world_files(ship_path) {
	const out = [];
	for (const profile of PROFILE_ROOTS) {
		for (const rocksdb of ROCKSDB_DIRS) {
			const root = join(ship_path, 'data', profile, rocksdb);
			if (!existsSync(root)) continue;
			let versions;
			try { versions = await readdir(root); } catch { continue; }
			for (const v of versions) {
				const worlds_dir = join(root, v, 'Worlds');
				if (!existsSync(worlds_dir)) continue;
				let world_ids;
				try { world_ids = await readdir(worlds_dir); } catch { continue; }
				for (const id of world_ids) {
					const wd = join(worlds_dir, id, 'WorldDescription.json');
					if (existsSync(wd)) out.push({ profile, rocksdb, version: v, island_id: id, path: wd });
				}
			}
		}
	}
	return out;
}

/** @param {string} path */
async function read_world(path) {
	const raw = await readFile(path, 'utf-8');
	const json = JSON.parse(raw);
	const wd = json.WorldDescription || {};
	const ws = wd.WorldSettings || {};
	const flat = {
		path,
		island_id:   wd.islandId || '',
		world_name:  wd.WorldName || '',
		preset:      wd.WorldPresetType || 'Custom',
		combat:      tag_value_to_combat(find_tag_value(ws.TagParameters, 'WDS.Parameter.CombatDifficulty')),
		floats:      /** @type {Record<string, number>} */ ({}),
		bools:       /** @type {Record<string, boolean>} */ ({}),
	};
	for (const k of FLOAT_KNOBS) {
		const v = find_tag_value(ws.FloatParameters, k.tag);
		flat.floats[k.tag] = typeof v === 'number' ? v : 1.0;
	}
	for (const k of BOOL_KNOBS) {
		const v = find_tag_value(ws.BoolParameters, k.tag);
		flat.bools[k.tag] = typeof v === 'boolean' ? v : false;
	}
	return { json, flat };
}

function tag_value_to_combat(tagvalue) {
	const tag = tagvalue?.TagName || '';
	if (tag.endsWith('.Easy'))   return 'Easy';
	if (tag.endsWith('.Hard'))   return 'Hard';
	return 'Normal';
}
function combat_to_tag_value(combat) {
	const safe = combat === 'Easy' || combat === 'Hard' ? combat : 'Normal';
	return { TagName: `WDS.Parameter.CombatDifficulty.${safe}` };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** @param {string} ship_id */
export async function list_worlds(ship_id) {
	const ship = await get_ship(ship_id);
	if (!ship) return { ok: false, error: 'no such ship' };

	const files = await locate_world_files(ship.path);
	const worlds = [];
	for (const f of files) {
		try {
			const { flat } = await read_world(f.path);
			const s = await stat(f.path);
			worlds.push({
				...flat,
				rocksdb: f.rocksdb,
				rocksdb_version: f.version,
				mtime: Math.floor(s.mtimeMs / 1000),
			});
		} catch (e) {
			worlds.push({ path: f.path, error: String(e?.message || e) });
		}
	}
	return {
		ok: true,
		ship_active: !!ship.active,
		worlds,
		// surface defaults so the client doesn't need its own copy
		float_knobs: FLOAT_KNOBS,
		bool_knobs:  BOOL_KNOBS,
		presets:     PRESETS,
	};
}

/**
 * Patch a world's settings. Caller passes `island_id` (or `path`) to identify
 * which world to write. The hub refuses to write while the ship is running
 * unless `force: true` — the game holds the file and will clobber our edits.
 *
 * @param {string} ship_id
 * @param {{
 *   island_id?: string, path?: string, force?: boolean,
 *   preset?: 'Easy'|'Medium'|'Hard'|'Custom',
 *   combat?: 'Easy'|'Normal'|'Hard',
 *   floats?: Record<string, number>,
 *   bools?:  Record<string, boolean>,
 * }} input
 */
export async function update_world(ship_id, input) {
	const ship = await get_ship(ship_id);
	if (!ship) throw new Error('no such ship');
	if (ship.active && !input.force) {
		throw new Error('ship is running — stop it first or pass {force:true} (the game will overwrite your edits otherwise)');
	}

	const files = await locate_world_files(ship.path);
	if (files.length === 0) throw new Error('no worlds found — start the ship at least once so it lays down a save');

	const target = input.path
		? files.find(f => f.path === input.path)
		: input.island_id
			? files.find(f => f.island_id === input.island_id)
			// All RocksDB layouts share the same world data on disk; if the user
			// doesn't pick, write to every matching file so the running game
			// reads the same values regardless of which it loaded.
			: null;

	const targets = target ? [target] : files;
	const results = [];

	for (const f of targets) {
		const raw = await readFile(f.path, 'utf-8');
		const json = JSON.parse(raw);
		const wd = json.WorldDescription || (json.WorldDescription = {});
		const ws = wd.WorldSettings || (wd.WorldSettings = {});
		const floats = ws.FloatParameters || (ws.FloatParameters = {});
		const bools  = ws.BoolParameters  || (ws.BoolParameters  = {});
		const tags   = ws.TagParameters   || (ws.TagParameters   = {});

		// Touching any value flips the preset to Custom — that's how the game
		// itself behaves. The user can still pick a preset explicitly.
		let touched = false;

		if (input.combat) {
			set_tag_value(tags, 'WDS.Parameter.CombatDifficulty', combat_to_tag_value(input.combat));
			touched = true;
		}
		if (input.floats) {
			for (const [k, v] of Object.entries(input.floats)) {
				if (typeof v !== 'number' || !Number.isFinite(v)) continue;
				set_tag_value(floats, k, v);
				touched = true;
			}
		}
		if (input.bools) {
			for (const [k, v] of Object.entries(input.bools)) {
				if (typeof v !== 'boolean') continue;
				set_tag_value(bools, k, v);
				touched = true;
			}
		}

		if (input.preset) {
			wd.WorldPresetType = input.preset;
		} else if (touched) {
			wd.WorldPresetType = 'Custom';
		}

		await writeFile(f.path, JSON.stringify(json, null, 4));
		results.push({ path: f.path, island_id: f.island_id, ok: true });
	}

	return { ok: true, written: results };
}

/**
 * Convenience: apply a built-in preset to all worlds on a ship.
 * @param {string} ship_id
 * @param {'Easy'|'Medium'|'Hard'} preset
 * @param {{ force?: boolean, island_id?: string }} opts
 */
export async function apply_preset(ship_id, preset, opts = {}) {
	const p = PRESETS[preset];
	if (!p) throw new Error(`unknown preset: ${preset}`);
	return update_world(ship_id, {
		island_id: opts.island_id,
		force: opts.force,
		preset, combat: p.combat,
		floats: p.floats, bools: p.bools,
	});
}
