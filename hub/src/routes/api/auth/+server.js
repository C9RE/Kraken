import { json } from '@sveltejs/kit';
import { COOKIE_NAME, get_public_state, login, rate_state } from '$lib/server/auth.js';

export async function GET({ locals, getClientAddress }) {
	const state = await get_public_state();
	return json({
		...state,
		authed: !!locals.authed,
		rate: rate_state(getClientAddress()),
	});
}

export async function POST({ request, cookies, getClientAddress }) {
	const body = await request.json().catch(() => ({}));
	if (typeof body.pin !== 'string') {
		return json({ ok: false, error: 'pin required' }, { status: 400 });
	}
	const ip = getClientAddress();
	try {
		const cookie = await login(body.pin, ip);
		cookies.set(COOKIE_NAME, cookie, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			// Allow plain HTTP since the hub is meant for LAN/Tailscale; ops can
			// terminate TLS at a reverse proxy.
			secure: false,
			maxAge: 60 * 60 * 24 * 7,
		});
		return json({ ok: true });
	} catch (e) {
		const status = (/** @type {any} */(e))?.locked ? 429 : 401;
		return json({
			ok: false,
			error: String(e?.message || e),
			retry_after_ms: (/** @type {any} */(e))?.retry_after_ms || 0,
		}, { status });
	}
}

export async function DELETE({ cookies }) {
	cookies.delete(COOKIE_NAME, { path: '/' });
	return json({ ok: true });
}
