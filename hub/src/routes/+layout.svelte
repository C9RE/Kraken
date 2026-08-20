<script>
	import '../app.css';
	import TopNav from '$lib/components/TopNav.svelte';
	import { page } from '$app/state';
	let { children } = $props();
	let is_demo = $derived(page.data?.is_demo);
	let chrome = $derived(page.url?.pathname !== '/login');
</script>

<svelte:head>
	<title>{is_demo ? 'Kraken Demo — Windrose Server Sandbox' : 'Kraken Hub — Windrose Fleet Manager'}</title>
</svelte:head>

<div class="fixed-backdrop" aria-hidden="true"></div>

<div class="app" class:bare={!chrome}>
	{#if is_demo}
		<div class="demo-banner">
			<div class="demo-banner-wrap">
				<span class="demo-badge">DEMO SANDBOX</span>
				<span class="demo-text">Interactive Windrose fleet manager · Server orchestration is simulated · Try casting off, rigging mods, or commissioning a vessel</span>
			</div>
		</div>
	{/if}
	{#if chrome}<TopNav />{/if}
	<main>
		{@render children?.()}
	</main>
	{#if chrome}
		<footer class="botbar mono">
			<span>{is_demo ? 'Kraken Demo Sandbox' : 'Kraken Hub'}</span>
			<span class="sep">·</span>
			<a href="https://thekraken.cloud" target="_blank" rel="noopener">thekraken.cloud</a>
			<span class="sep">·</span>
			<a href="https://github.com/C9RE/Kraken" target="_blank" rel="noopener">GitHub (v1.6.4)</a>
			<span class="sep">·</span>
			<a href="https://c9re.com" target="_blank" rel="noopener">C9RE</a>
		</footer>
	{/if}
</div>

<style>
	.app { display: flex; flex-direction: column; min-height: 100dvh; position: relative; z-index: 1; }
	.app.bare main { padding: 0; max-width: none; }
	main { flex: 1; padding: 36px 24px 64px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
	
	.demo-banner {
		background: linear-gradient(90deg, rgba(204, 185, 157, 0.15) 0%, rgba(154, 127, 62, 0.25) 50%, rgba(204, 185, 157, 0.15) 100%);
		border-bottom: 1px solid rgba(204, 185, 157, 0.3);
		padding: 7px 16px;
		font-size: 12px;
		color: #f5e6c8;
		text-align: center;
		position: relative;
		z-index: 101;
	}
	.demo-banner-wrap {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.demo-badge {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		background: #ccb99d;
		color: #07090c;
		padding: 2px 6px;
		border-radius: 3px;
		text-transform: uppercase;
	}
	.demo-text {
		font-size: 12px;
		letter-spacing: 0.02em;
		color: #e8d7be;
	}

	.botbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 20px 24px;
		border-top: 1px solid var(--color-border);
		font-size: 11.5px;
		color: var(--color-ink-4);
		background: rgba(7, 9, 12, 0.6);
	}
	.botbar a { color: var(--color-ink-3); }
	.botbar a:hover { color: var(--color-accent-bright); }
	.botbar .sep { opacity: 0.4; }
</style>
