import { json } from '@sveltejs/kit';
import { COOKIE_NAME, configure_set_pin, configure_disable, get_public_state, mint_cookie } from '$lib/server/auth.js';

// Configuring auth (enable, change, disable) is itself gated by the
// hooks middleware when auth is already enabled. The first-time enable
// works even on an unauthed session because there's nothing to protect yet.

export async function POST({ request, cookies, locals }) {
	const body = await request.json().catch(() => ({}));
	const action = body.action;

	const state_before = await get_public_state();

	try {
		if (action === 'enable' || action === 'change') {
			// `change` requires authed AND current_pin. `enable` (no pin yet)
			// just needs a new pin.
			if (state_before.has_pin && !locals.authed) {
				return json({ ok: false, error: 'unauthorised' }, { status: 401 });
			}
			const next = await configure_set_pin({
				pin: body.pin,
				current_pin: body.current_pin,
			});
			// Mint a fresh cookie so the user stays signed in across the
			// secret rotation.
			cookies.set(COOKIE_NAME, mint_cookie(next.secret, next.session_max_age), {
				path: '/', httpOnly: true, sameSite: 'lax', secure: false,
				maxAge: next.session_max_age,
			});
			return json({ ok: true, ...await get_public_state(), authed: true });
		}

		if (action === 'disable') {
			if (!locals.authed) return json({ ok: false, error: 'unauthorised' }, { status: 401 });
			await configure_disable({ current_pin: body.current_pin });
			cookies.delete(COOKIE_NAME, { path: '/' });
			return json({ ok: true, ...await get_public_state(), authed: true });
		}

		return json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
