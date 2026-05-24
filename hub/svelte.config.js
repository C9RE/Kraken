import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
	preprocess: vitePreprocess(),
	kit: {
		// 1 GiB body limit so real mod uploads (zip/pak) get through. The
		// adapter-node default is 512 KB and silently rejects anything bigger,
		// which made every non-trivial mod fail with a confusing error.
		adapter: adapter({ bodySizeLimit: 1024 * 1024 * 1024 }),
		// CSRF Origin check stays ON. Scripted clients that want to POST from
		// outside a browser must set `Origin: <hub-url>` explicitly. Disabling
		// this globally means any tab in the same browser can fire start/stop,
		// mod upload, or PIN change against an authed session.
	},
};
