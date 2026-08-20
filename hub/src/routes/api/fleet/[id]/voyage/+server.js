import { json } from '@sveltejs/kit';
import { list_worlds, update_world } from '$lib/server/voyage.js';

export async function GET({ params }) {
	try {
		const result = await list_worlds(params.id);
		return json(result, { status: result.ok ? 200 : 404 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
	}
}

export async function POST({ params, request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const result = await update_world(params.id, body);
		return json(result);
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
