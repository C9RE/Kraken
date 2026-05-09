<script>
	let { ship, onaction } = $props();
	let busy = $state(false);

	/** @param {string} action */
	async function act(action) {
		busy = true;
		try { await onaction(action); }
		finally { busy = false; }
	}

	function fmt_uptime(secs) {
		if (!secs) return '';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	}
	function uptime_secs(started_at) {
		if (!started_at) return 0;
		return Math.max(0, Math.floor(Date.now() / 1000) - started_at);
	}
</script>

<article class="ship">
	<header class="head">
		<div class="title">
			<a href={`/ship/${ship.id}`} class="name serif">{ship.server_name || ship.name}</a>
			<span class="id mono">{ship.id}</span>
		</div>
		<span class="status">
			<span class="dot" class:on={ship.active} class:warn={ship.health === 'unhealthy'}></span>
			<span class="status-label mono">
				{#if ship.active}
					afloat · {fmt_uptime(uptime_secs(ship.started_at))}
				{:else}
					moored
				{/if}
			</span>
		</span>
	</header>

	<dl class="meta">
		<div><dt>image</dt><dd class="mono">{ship.image_tag || '-'}</dd></div>
		<div><dt>port</dt><dd class="mono">:{ship.port}</dd></div>
		<div><dt>cap</dt><dd class="mono">{ship.max_players}</dd></div>
		<div><dt>invite</dt><dd class="mono">{ship.invite_code || '-'}</dd></div>
	</dl>

	<footer class="actions">
		{#if ship.active}
			<button class="btn btn-ghost" disabled={busy} onclick={() => act('restart')}>{busy ? '…' : 'Restart'}</button>
			<button class="btn btn-danger" disabled={busy} onclick={() => act('stop')}>{busy ? '…' : 'Stop'}</button>
		{:else}
			<button class="btn btn-primary" disabled={busy} onclick={() => act('start')}>{busy ? 'starting…' : 'Cast off'}</button>
		{/if}
		<a class="btn btn-ghost" href={`/ship/${ship.id}`}>Boarding →</a>
	</footer>
</article>

<style>
	.ship {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-accent);
		border-radius: 2px;
		padding: 22px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		transition: background 0.15s, border-color 0.15s;
	}
	.ship:hover { background: var(--color-surface-2); border-color: var(--color-border-strong); border-left-color: var(--color-accent-bright); }

	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.name {
		font: 600 22px/1.1 var(--font-display);
		color: var(--color-ink);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name:hover { color: var(--color-accent-bright); }
	.id {
		font-size: 11px;
		color: var(--color-ink-4);
		letter-spacing: 0.08em;
	}

	.status { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
	.status-label { font-size: 11px; color: var(--color-ink-3); letter-spacing: 0.08em; }

	.meta {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px 18px;
		margin: 0;
		padding-top: 14px;
		border-top: 1px solid var(--color-border);
	}
	.meta div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	dt { font-size: 10px; color: var(--color-ink-4); letter-spacing: 0.16em; text-transform: uppercase; margin: 0; }
	dd { color: var(--color-ink-2); margin: 0; font-size: 12px; }

	.actions { display: flex; gap: 8px; flex-wrap: wrap; }
	.actions .btn { flex: 1; min-width: 100px; }
</style>
