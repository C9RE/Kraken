import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// The hub is intended to run on a trusted network or behind a reverse
		// proxy that handles auth — same threat model as the upstream Docker
		// stack itself. Disabling the SvelteKit CSRF Origin check keeps form
		// uploads (mods) working from scripted clients (curl, CI, other UIs)
		// without requiring callers to spoof Origin headers.
		csrf: { checkOrigin: false },
	},
};
