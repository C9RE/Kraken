<script>
	import Mark from './Mark.svelte';
	import { page } from '$app/state';
	let path = $derived(page.url?.pathname ?? '');
	let is_demo = $derived(page.data?.is_demo);
	let resetting = $state(false);

	const LINKS = [
		{ href: '/',         label: 'fleet' },
		{ href: '/new',      label: 'drydock' },
		{ href: '/settings', label: 'settings' },
	];
	function is_active(href) {
		if (href === '/') return path === '/';
		return path === href || path.startsWith(href + '/');
	}

	async function reset_demo() {
		if (!confirm('Reset Demo Sandbox?\n\nThis will restore the 3 default vessels (The Black Pearl, Queen Anne, Flying Dutchman) and initial save states.')) return;
		resetting = true;
		try {
			await fetch('/api/fleet/reset-demo', { method: 'POST' });
			location.reload();
		} finally {
			resetting = false;
		}
	}
</script>

<header class="topbar">
	<a href="/" class="brand">
		<span class="mk"><Mark size={22} /></span>
		<h1 class="serif">Kraken</h1>
		<span class="tag" class:demo={is_demo}>{is_demo ? 'demo sandbox' : 'hub'}</span>
	</a>
	<nav class="topnav">
		{#each LINKS as l}
			<a href={l.href} class="navlink" class:active={is_active(l.href)}>{l.label}</a>
		{/each}
		{#if is_demo}
			<button class="btn-demo-reset" onclick={reset_demo} disabled={resetting} title="Reset demo vessels">
				{resetting ? 'resetting…' : '↺ reset sandbox'}
			</button>
		{/if}
		<a href="https://github.com/C9RE/Kraken" class="navlink" target="_blank" rel="noopener">github ↗</a>
	</nav>
</header>

<style>
	.topbar {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		padding: 14px 28px;
		border-bottom: 1px solid var(--color-border);
		background: rgba(10, 13, 17, 0.75);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		position: sticky; top: 0; z-index: 100;
		gap: 18px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		text-decoration: none;
		color: var(--color-ink);
	}
	.mk {
		color: var(--color-accent-bright);
		display: inline-flex;
		transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
	}
	.brand:hover .mk {
		transform: rotate(180deg) scale(1.15);
		filter: drop-shadow(0 0 10px rgba(232, 215, 190, 0.8));
	}
	h1 {
		font: 700 22px/1 var(--font-display);
		margin: 0;
		letter-spacing: 0.04em;
		color: #ffffff;
		text-shadow: 0 2px 10px rgba(0,0,0,0.8);
	}
	.tag {
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-accent);
		padding: 3px 8px;
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		background: var(--color-accent-soft);
	}
	.tag.demo {
		color: #e8d7be;
		border-color: rgba(204, 185, 157, 0.4);
		background: rgba(204, 185, 157, 0.15);
		box-shadow: 0 0 10px rgba(204, 185, 157, 0.2);
	}
	.topnav { display: flex; gap: 20px; align-items: center; justify-content: flex-end; }
	.navlink {
		font: 700 11px/1 var(--font-body);
		color: var(--color-ink-3);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		padding: 6px 4px;
		border-bottom: 2px solid transparent;
		transition: color .15s, border-color .15s;
	}
	.navlink:hover { color: var(--color-ink); }
	.navlink.active {
		color: var(--color-accent-bright);
		border-bottom-color: var(--color-accent);
	}
	.btn-demo-reset {
		background: rgba(204, 185, 157, 0.1);
		border: 1px solid var(--color-border-strong);
		color: var(--color-accent-bright);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 4px 10px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s, transform 0.1s;
	}
	.btn-demo-reset:hover {
		background: var(--color-accent-soft);
		border-color: var(--color-accent-bright);
	}
	.btn-demo-reset:active { transform: scale(0.96); }
	@media (max-width: 720px) {
		.topbar { padding: 12px 16px; gap: 12px; }
		h1 { font-size: 20px; }
		.topnav { gap: 14px; }
	}
</style>
