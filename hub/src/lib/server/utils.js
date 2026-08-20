// Cross-platform server utility helpers for Kraken Hub (Linux + Windows)
// Provides pure JavaScript or cross-platform implementations for folder size,
// directory copying, archiving, and zip extraction.

import { readdir, stat, cp, rm } from 'fs/promises';
import { join, resolve as path_resolve } from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

export const IS_WINDOWS = process.platform === 'win32';

/**
 * Pure JavaScript recursive directory size calculator.
 * Works identically and asynchronously on Linux, Windows, and macOS without subprocesses.
 * @param {string} dir
 * @returns {Promise<number>} Size in bytes
 */
export async function get_dir_size(dir) {
	let total = 0;
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				total += await get_dir_size(full);
			} else if (entry.isFile()) {
				const s = await stat(full).catch(() => null);
				if (s) total += s.size;
			}
		}
	} catch {
		// Ignore unreadable files or missing folders
	}
	return total;
}

/**
 * Cross-platform directory recursive copy.
 * Uses built-in node:fs/promises cp.
 * @param {string} src
 * @param {string} dest
 */
export async function cross_cp(src, dest) {
	await cp(src, dest, { recursive: true, force: true });
}

/**
 * Cross-platform archive extractor.
 * Windows 10/11 includes `tar.exe` which natively unpacks .zip, .tar, .tar.gz archives.
 * Linux uses `unzip` or `tar`.
 * @param {string} zip_path
 * @param {string} dest_dir
 */
export async function cross_unzip(zip_path, dest_dir) {
	if (IS_WINDOWS) {
		// Try Windows built-in tar.exe first (fastest and handles zips natively)
		const tar_res = await new Promise(resolve => {
			const p = spawn('tar.exe', ['-xf', zip_path, '-C', dest_dir]);
			let err = '';
			p.stderr.on('data', d => err += d.toString());
			p.on('close', code => resolve({ ok: code === 0, err }));
			setTimeout(() => p.kill(), 60_000);
		});
		if (tar_res.ok) return;

		// Fallback to PowerShell Expand-Archive
		return new Promise((resolve, reject) => {
			const ps = spawn('powershell.exe', [
				'-NoProfile', '-NonInteractive', '-Command',
				`Expand-Archive -LiteralPath "${zip_path}" -DestinationPath "${dest_dir}" -Force`
			]);
			let err = '';
			ps.stderr.on('data', d => err += d.toString());
			ps.on('close', code => code === 0 ? resolve(undefined) : reject(new Error(`PowerShell unzip failed: ${err}`)));
			setTimeout(() => ps.kill(), 90_000);
		});
	}

	// Linux / Unix: use unzip
	return new Promise((resolve, reject) => {
		const p = spawn('unzip', ['-q', '-o', zip_path, '-d', dest_dir]);
		let err = '';
		p.stderr.on('data', d => err += d.toString());
		p.on('close', code => code === 0 ? resolve(undefined) : reject(new Error(`unzip exited ${code}: ${err.trim()}`)));
		setTimeout(() => p.kill(), 60_000);
	});
}
