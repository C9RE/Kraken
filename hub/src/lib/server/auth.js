// Optional PIN-based auth for the hub.
//
// Off by default; flip on from /settings. When enabled, every page and
// non-/api/auth* endpoint requires a valid signed cookie issued after the
// user enters the right 6-digit PIN.
//
// Storage: $KRAKEN_FLEET_ROOT/auth.json
//   {
//     "enabled": true,
//     "pin_hash":  "<hex>",         // scrypt(pin + salt)
//     "pin_salt":  "<hex>",         // 16 bytes
//     "secret":    "<hex>",         // 32 bytes; HMAC key for cookie signing
//     "session_max_age": 86400,     // seconds
//     "updated_at": 1700000000
//   }
//
// Cookie shape: <expiry>.<hmac>  where hmac = HMAC-SHA256(secret, expiry).
// Rotating `secret` (which we do on every PIN change) invalidates every
// outstanding session. Good enough for a single-user tool on a private LAN.
//
// Rate limit: in-memory map of {ip -> [timestamps]}. After 5 failures in
// 15 minutes a 15-minute lockout kicks in.

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve as path_resolve } from 'path';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';

const FLEET_ROOT = process.env.KRAKEN_FLEET_ROOT
	? path_resolve(process.env.KRAKEN_FLEET_ROOT)
	: path_resolve(process.cwd(), 'fleet');
const AUTH_FILE = join(FLEET_ROOT, 'auth.json');

export const COOKIE_NAME = 'kraken_auth';
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7;   // 1 week
const PIN_RE = /^[0-9]{4,12}$/;             // accept 4-12 digits, 6 is the suggested

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LOCK_AT   = 5;
const FAIL_LOCK_MS   = 15 * 60 * 1000;

/** @type {Map<string, number[]>} */
const failures = new Map();

/** @typedef {{
 *   enabled: boolean,
 *   pin_hash: string|null, pin_salt: string|null,
 *   secret: string,
 *   session_max_age: number,
 *   updated_at: number,
 * }} AuthState */

// Lazy-load with cache; rewritten on every change.
/** @type {AuthState|null} */
let cached = null;

/** @returns {Promise<AuthState>} */
export async function load() {
	if (cached) return cached;
	try {
		const raw = await readFile(AUTH_FILE, 'utf-8');
		const parsed = JSON.parse(raw);
		cached = {
			enabled: !!parsed.enabled,
			pin_hash: parsed.pin_hash || null,
			pin_salt: parsed.pin_salt || null,
			secret: parsed.secret || randomBytes(32).toString('hex'),
			session_max_age: parsed.session_max_age || DEFAULT_MAX_AGE,
			updated_at: parsed.updated_at || 0,
		};
	} catch {
		cached = {
			enabled: false,
			pin_hash: null, pin_salt: null,
			secret: randomBytes(32).toString('hex'),
			session_max_age: DEFAULT_MAX_AGE,
			updated_at: 0,
		};
	}
	return cached;
}

/** @param {AuthState} state */
async function save(state) {
	await mkdir(FLEET_ROOT, { recursive: true });
	state.updated_at = Math.floor(Date.now() / 1000);
	await writeFile(AUTH_FILE, JSON.stringify(state, null, 2));
	cached = state;
}

// PIN hashing

function hash_pin(pin, salt_hex) {
	const salt = Buffer.from(salt_hex, 'hex');
	return scryptSync(pin, salt, 32).toString('hex');
}

function verify_pin(pin, state) {
	if (!state.pin_hash || !state.pin_salt) return false;
	const candidate = Buffer.from(hash_pin(pin, state.pin_salt), 'hex');
	const expected  = Buffer.from(state.pin_hash, 'hex');
	if (candidate.length !== expected.length) return false;
	return timingSafeEqual(candidate, expected);
}

// Cookie signing

/** @param {string} secret @param {number} [max_age_secs] */
export function mint_cookie(secret, max_age_secs = DEFAULT_MAX_AGE) {
	const expiry = Math.floor(Date.now() / 1000) + max_age_secs;
	const sig = createHmac('sha256', secret).update(String(expiry)).digest('hex');
	return `${expiry}.${sig}`;
}

/** @param {string|undefined} cookie @param {string} secret */
export function verify_cookie(cookie, secret) {
	if (!cookie) return false;
	const dot = cookie.indexOf('.');
	if (dot < 1) return false;
	const expiry_s = cookie.slice(0, dot);
	const sig = cookie.slice(dot + 1);
	const expiry = parseInt(expiry_s);
	if (!Number.isFinite(expiry)) return false;
	if (expiry < Math.floor(Date.now() / 1000)) return false;
	const expected = createHmac('sha256', secret).update(expiry_s).digest('hex');
	if (sig.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

// Rate limit

/** @param {string} ip */
function trim_window(ip) {
	const now = Date.now();
	const arr = (failures.get(ip) || []).filter(t => now - t < FAIL_WINDOW_MS);
	if (arr.length) failures.set(ip, arr); else failures.delete(ip);
	return arr;
}

/** @param {string} ip @returns {{locked: boolean, retry_after_ms: number, fails: number}} */
export function rate_state(ip) {
	const arr = trim_window(ip);
	if (arr.length < FAIL_LOCK_AT) {
		return { locked: false, retry_after_ms: 0, fails: arr.length };
	}
	const last = arr[arr.length - 1];
	const remaining = Math.max(0, FAIL_LOCK_MS - (Date.now() - last));
	return { locked: remaining > 0, retry_after_ms: remaining, fails: arr.length };
}

/** @param {string} ip */
function record_fail(ip) {
	const arr = trim_window(ip);
	arr.push(Date.now());
	failures.set(ip, arr);
}

/** @param {string} ip */
function clear_fails(ip) {
	failures.delete(ip);
}

// Public

export async function get_public_state() {
	const s = await load();
	return {
		enabled: s.enabled,
		has_pin: !!s.pin_hash,
		session_max_age: s.session_max_age,
	};
}

/** @param {string} pin */
function valid_pin_shape(pin) {
	return typeof pin === 'string' && PIN_RE.test(pin);
}

/**
 * Enable PIN auth or change the PIN.
 * @param {{ pin: string, current_pin?: string }} input
 */
export async function configure_set_pin(input) {
	if (!valid_pin_shape(input.pin)) {
		throw new Error('PIN must be 4 to 12 digits');
	}
	const state = await load();
	// If a PIN already exists, the caller must prove they know it. The hooks
	// gate already keeps anonymous browsers off this endpoint when auth is on,
	// but belt-and-braces.
	if (state.pin_hash && (!input.current_pin || !verify_pin(input.current_pin, state))) {
		throw new Error('current PIN required and must match');
	}
	const salt = randomBytes(16).toString('hex');
	const next = /** @type {AuthState} */ ({
		...state,
		enabled: true,
		pin_salt: salt,
		pin_hash: hash_pin(input.pin, salt),
		// Rotate the cookie-signing secret so the change kicks every session out.
		secret: randomBytes(32).toString('hex'),
	});
	await save(next);
	return next;
}

/** @param {{ current_pin: string }} input */
export async function configure_disable(input) {
	const state = await load();
	if (state.pin_hash && (!input.current_pin || !verify_pin(input.current_pin, state))) {
		throw new Error('current PIN required and must match');
	}
	const next = /** @type {AuthState} */ ({
		...state,
		enabled: false,
		pin_hash: null,
		pin_salt: null,
		// Rotate so any remaining sessions are invalidated even if auth is
		// re-enabled later.
		secret: randomBytes(32).toString('hex'),
	});
	await save(next);
	return next;
}

/**
 * Try to authenticate. On success returns a fresh signed cookie; on failure
 * records the attempt against the IP and may report lockout.
 *
 * @param {string} pin
 * @param {string} ip
 */
export async function login(pin, ip) {
	const rate = rate_state(ip);
	if (rate.locked) {
		const error = new Error(`too many failed attempts; try again in ${Math.ceil(rate.retry_after_ms / 1000)}s`);
		// @ts-expect-error attach metadata
		error.retry_after_ms = rate.retry_after_ms;
		// @ts-expect-error
		error.locked = true;
		throw error;
	}
	const state = await load();
	if (!state.enabled || !state.pin_hash) {
		throw new Error('PIN auth is not enabled');
	}
	if (!valid_pin_shape(pin) || !verify_pin(pin, state)) {
		record_fail(ip);
		const after = rate_state(ip);
		const remaining = Math.max(0, FAIL_LOCK_AT - after.fails);
		throw new Error(remaining > 0
			? `incorrect PIN (${remaining} attempt${remaining === 1 ? '' : 's'} left before lockout)`
			: 'too many failed attempts; locked out for 15 minutes');
	}
	clear_fails(ip);
	return mint_cookie(state.secret, state.session_max_age);
}

/**
 * Returns true if the cookie is valid given the current secret.
 * @param {string|undefined} cookie
 */
export async function check_cookie(cookie) {
	const state = await load();
	if (!cookie) return false;
	return verify_cookie(cookie, state.secret);
}
