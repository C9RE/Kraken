import { json } from '@sveltejs/kit';
import { toggle_mod, delete_mod } from '$lib/server/mods.js';

export async function POST({ params, request }) {
	try {
		const name = decodeURIComponent(params.name);
		const body = await request.json().catch(() => ({}));
		const action = body.action;
		const kind = body.kind; // 'ue4ss' | 'logic-pak' | 'asset-pak'

		if (action === 'enable' || action === 'disable') {
			const on = action === 'enable';
			const result = await toggle_mod(params.id, name, kind, on);
			return json(result);
		}

		if (action === 'delete') {
			const result = await delete_mod(params.id, name, kind);
			return json(result);
		}

		return json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
