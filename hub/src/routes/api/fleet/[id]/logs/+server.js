import { json } from '@sveltejs/kit';
import { ship_logs } from '$lib/server/fleet.js';

export async function GET({ params, url }) {
	try {
		const lines = parseInt(url.searchParams.get('lines') || '200') || 200;
		const logs = await ship_logs(params.id, lines);
		return json({ ok: true, logs });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e), logs: '' }, { status: 500 });
	}
}
