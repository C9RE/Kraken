import { get_ship } from '$lib/server/fleet.js';
import { readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

export async function GET({ params }) {
	const { id, filename } = params;
	const clean_name = basename(filename);
	if (clean_name !== filename || (!filename.endsWith('.tar.gz') && !filename.endsWith('.tgz'))) {
		return new Response('Invalid backup filename', { status: 400 });
	}

	const ship = await get_ship(id);
	if (!ship) {
		return new Response('Ship not found', { status: 404 });
	}

	const filePath = join(ship.path, 'backups', clean_name);
	if (!existsSync(filePath)) {
		return new Response('Backup archive not found', { status: 404 });
	}

	try {
		const fileBuffer = await readFile(filePath);
		const fileStat = await stat(filePath);

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': 'application/gzip',
				'Content-Disposition': `attachment; filename="${clean_name}"`,
				'Content-Length': String(fileStat.size),
			},
		});
	} catch (e) {
		return new Response(`Error streaming backup: ${e?.message || e}`, { status: 500 });
	}
}
