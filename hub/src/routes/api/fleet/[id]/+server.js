import { json } from '@sveltejs/kit';
import {
	get_ship,
	list_ship_backups,
	ship_compose_action,
	refit_ship,
	backup_ship,
	update_ship_env,
	scuttle_ship,
} from '$lib/server/fleet.js';

export async function GET({ params }) {
	try {
		const ship = await get_ship(params.id);
		if (!ship) {
			return json({ ok: false, error: `no such ship: ${params.id}` }, { status: 404 });
		}
		const backups = await list_ship_backups(params.id);
		return json({ ok: true, ship, backups });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
	}
}

export async function POST({ params, request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const action = body.action;

		if (action === 'start' || action === 'stop' || action === 'restart' || action === 'pull') {
			const result = await ship_compose_action(params.id, action);
			return json(result, { status: result.ok ? 200 : 500 });
		}

		if (action === 'refit') {
			const result = await refit_ship(params.id);
			return json(result, { status: result.ok ? 200 : 500 });
		}

		if (action === 'backup') {
			const result = await backup_ship(params.id);
			return json(result, { status: result.ok ? 200 : 500 });
		}

		if (action === 'update_env') {
			if (!body.env || typeof body.env !== 'object') {
				return json({ ok: false, error: 'env object required' }, { status: 400 });
			}
			const result = await update_ship_env(params.id, body.env);
			return json(result);
		}

		if (action === 'scuttle') {
			const result = await scuttle_ship(params.id, { purge: body.purge === true });
			return json(result);
		}

		return json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
