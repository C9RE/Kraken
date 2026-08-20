import { json } from '@sveltejs/kit';
import { list_ships, create_ship } from '$lib/server/fleet.js';

export async function GET() {
	try {
		const ships = await list_ships();
		return json({ ok: true, ships });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e), ships: [] }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const record = await create_ship(body);
		return json({ ok: true, ship: record });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
