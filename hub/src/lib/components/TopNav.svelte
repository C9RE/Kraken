<script>
	import Mark from './Mark.svelte';
	import { page } from '$app/state';
	let path = $derived(page.url?.pathname ?? '');
	const LINKS = [
		{ href: '/',    label: 'fleet' },
		{ href: '/new', label: 'drydock' },
	];
	function is_active(href) {
		if (href === '/') return path === '/';
		return path === href || path.startsWith(href + '/');
	}
</script>

<header class="topbar">
	<a href="/" class="brand">
		<span class="mk"><Mark size={20} /></span>
		<h1 class="serif">Kraken</h1>
		<span class="tag">hub</span>
	</a>
	<nav class="topnav">
		{#each LINKS as l}
			<a href={l.href} class="navlink" class:active={is_active(l.href)}>{l.label}</a>
		{/each}
		<a href="https://github.com/C9RE/Kraken" class="navlink" target="_blank" rel="noopener">github ↗</a>
	</nav>
</header>

<style>
	.topbar {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		padding: 14px 24px;
		border-bottom: 1px solid var(--color-border);
		background: rgba(0,0,0,0.18);
		backdrop-filter: blur(8px);
		position: sticky; top: 0; z-index: 10;
		gap: 18px;
	}
	.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--color-ink); }
	.mk { color: var(--color-accent); display: inline-flex; }
	h1 { font: 400 22px/1 var(--font-display); margin: 0; letter-spacing: -0.025em; }
	.tag {
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--color-accent);
		padding: 3px 6px;
		border: 1px solid var(--color-border-strong);
		border-radius: 2px;
	}
	.topnav { display: flex; gap: 24px; justify-content: flex-end; }
	.navlink {
		font: 700 11px/1 var(--font-body);
		color: var(--color-ink-3);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		padding: 6px 2px;
		border-bottom: 1px solid transparent;
		transition: color .12s, border-color .12s;
	}
	.navlink:hover { color: var(--color-ink); }
	.navlink.active {
		color: var(--color-accent-bright);
		border-bottom-color: var(--color-accent);
	}
	@media (max-width: 720px) { .topbar { padding: 12px 16px; gap: 12px; } h1 { font-size: 20px; } }
</style>
