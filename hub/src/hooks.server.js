import { redirect, json } from '@sveltejs/kit';
import { COOKIE_NAME, load as load_auth, check_cookie } from '$lib/server/auth.js';

const PUBLIC_PATHS = new Set(['/login']);
const PUBLIC_PREFIXES = ['/api/auth', '/_app/', '/favicon'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const auth = await load_auth();
	event.locals.auth = { enabled: auth.enabled };

	if (!auth.enabled) {
		event.locals.authed = true;
		return resolve(event);
	}

	const path = event.url.pathname;
	const cookie = event.cookies.get(COOKIE_NAME);
	const authed = await check_cookie(cookie);
	event.locals.authed = authed;

	const is_public = PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some(p => path.startsWith(p));
	if (authed || is_public) return resolve(event);

	if (path.startsWith('/api/')) {
		return json({ ok: false, error: 'unauthorised' }, { status: 401 });
	}
	throw redirect(303, `/login?next=${encodeURIComponent(path)}`);
}
