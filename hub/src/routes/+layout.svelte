<script>
	import '../app.css';
	import TopNav from '$lib/components/TopNav.svelte';
	let { children } = $props();
</script>

<svelte:head><title>Kraken hub</title></svelte:head>

<div class="app">
	<TopNav />
	<main>
		{@render children?.()}
	</main>
	<footer class="botbar mono">
		<span>Kraken hub</span>
		<span class="sep">·</span>
		<span>Windrose dedicated server fleet</span>
		<span class="sep">·</span>
		<a href="https://github.com/C9RE/Kraken">github.com/C9RE/Kraken</a>
	</footer>
</div>

<style>
	.app { display: flex; flex-direction: column; min-height: 100dvh; }
	main { flex: 1; padding: 32px 24px 48px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
	.botbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 24px;
		border-top: 1px solid var(--color-border);
		font-size: 11px;
		color: var(--color-ink-4);
	}
	.botbar .sep { opacity: 0.5; }
</style>
