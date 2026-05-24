import { json } from '@sveltejs/kit';
import { get_status, apply_update, read_version } from '$lib/server/system.js';

export async function GET() {
	const status = await get_status();
	const version = await read_version();
	return json({ ...status, version });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	if (body.action !== 'update') {
		return json({ ok: false, error: `unknown action: ${body.action}` }, { status: 400 });
	}
	try {
		const result = await apply_update({ confirm_discard: body.confirm_discard === true });
		return json(result, { status: result.ok ? 200 : 400 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
	}
}
