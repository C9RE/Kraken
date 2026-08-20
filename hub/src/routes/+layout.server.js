import { IS_DEMO } from '$lib/server/fleet.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load() {
	return {
		is_demo: IS_DEMO
	};
}
