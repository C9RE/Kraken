import { json } from '@sveltejs/kit';
import { IS_DEMO, reset_demo_fleet } from '$lib/server/fleet.js';

/** @type {import('./$types').RequestHandler} */
export async function POST() {
	if (!IS_DEMO) {
		return json({ ok: false, error: 'Reset is only allowed in Demo mode' }, { status: 403 });
	}
	try {
		await reset_demo_fleet();
		return json({ ok: true });
	} catch (e) {
		return json({ ok: false, error: String(e) }, { status: 500 });
	}
}
