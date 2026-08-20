<script>
	let { ship, onaction } = $props();
	let busy = $state(false);
	let busy_action = $state(/** @type {string | null} */ (null));

	/** @param {string} action */
	async function act(action) {
		busy = true;
		busy_action = action;
		try { await onaction(action); }
		finally { busy = false; busy_action = null; }
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
			<div class="icon-group" role="group" aria-label="Ship controls">
				<button
					type="button"
					class="icon-btn"
					disabled={busy}
					aria-label="Restart ship"
					title="Restart"
					onclick={() => act('restart')}
				>
					{#if busy_action === 'restart'}
						<span class="spinner" aria-hidden="true"></span>
					{:else}
						<span class="glyph" aria-hidden="true">↻</span>
					{/if}
				</button>
				<button
					type="button"
					class="icon-btn danger"
					disabled={busy}
					aria-label="Stop ship"
					title="Stop"
					onclick={() => act('stop')}
				>
					{#if busy_action === 'stop'}
						<span class="spinner" aria-hidden="true"></span>
					{:else}
						<span class="glyph" aria-hidden="true">✕</span>
					{/if}
				</button>
			</div>
			<a class="cta" href={`/ship/${ship.id}`}>
				<span class="cta-label">Boarding</span>
				<span class="cta-arrow" aria-hidden="true">→</span>
			</a>
		{:else}
			<button
				type="button"
				class="cast-off"
				disabled={busy}
				aria-label="Cast off — start ship"
				onclick={() => act('start')}
			>
				{#if busy_action === 'start'}
					<span class="spinner dark" aria-hidden="true"></span>
					<span class="cta-label">Casting off…</span>
				{:else}
					<span class="glyph anchor" aria-hidden="true">⚓</span>
					<span class="cta-label">Cast off</span>
				{/if}
			</button>
			<a class="cta ghost" href={`/ship/${ship.id}`}>
				<span class="cta-label">Boarding</span>
				<span class="cta-arrow" aria-hidden="true">→</span>
			</a>
		{/if}
	</footer>
</article>

<style>
	.ship {
		background: var(--color-surface);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-accent);
		border-radius: 8px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
		transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
	}
	.ship:hover {
		background: var(--color-surface-2);
		border-color: var(--color-border-strong);
		border-left-color: var(--color-accent-bright);
		transform: translateY(-2px);
		box-shadow: 0 8px 28px -4px rgba(0, 0, 0, 0.6);
	}

	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.name {
		font: 700 22px/1.1 var(--font-display);
		color: #ffffff;
		text-shadow: 0 2px 8px rgba(0,0,0,0.7);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		letter-spacing: 0.02em;
	}
	.name:hover { color: var(--color-accent-bright); }
	.id {
		font-size: 11px;
		color: var(--color-ink-4);
		letter-spacing: 0.08em;
	}

	.status { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
	.status-label { font-size: 11.5px; color: var(--color-ink-2); letter-spacing: 0.06em; }

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

	/* ─── Actions footer ──────────────────────────────────────── */
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: stretch;
		padding-top: 14px;
		border-top: 1px solid var(--color-border);
	}

	/* Icon-button group (Restart / Stop) — left-anchored, compact */
	.icon-group {
		display: inline-flex;
		gap: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		overflow: hidden;
		background: var(--color-surface);
	}
	.icon-btn {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 0 10px;
		background: transparent;
		border: 0;
		border-right: 1px solid var(--color-border);
		color: var(--color-ink-3);
		font-family: var(--font-body);
		cursor: pointer;
		transition: background 0.15s, color 0.15s, transform 0.1s;
	}
	.icon-btn:last-child { border-right: 0; }
	.icon-btn .glyph {
		font-size: 16px;
		line-height: 1;
		display: inline-block;
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--color-accent-soft);
		color: var(--color-accent-bright);
	}
	.icon-btn.danger:hover:not(:disabled) {
		background: rgba(176, 77, 62, 0.15);
		color: var(--color-crimson);
	}
	.icon-btn:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--color-border-focus);
		color: var(--color-accent-bright);
	}
	.icon-btn:active:not(:disabled) { transform: scale(0.94); }
	.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Boarding primary CTA — right-anchored, weightier */
	.cta {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		padding: 0 16px;
		background: var(--color-accent-soft);
		border: 1px solid var(--color-accent);
		border-radius: 6px;
		color: var(--color-accent-bright);
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-decoration: none;
		transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
	}
	.cta .cta-arrow {
		font-size: 14px;
		transition: transform 0.18s;
	}
	.cta:hover {
		background: var(--color-accent);
		border-color: var(--color-accent-bright);
		color: #080a0d;
		transform: translateY(-1px);
	}
	.cta:hover .cta-arrow { transform: translateX(3px); }
	.cta:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--color-border-focus);
	}
	.cta:active { transform: scale(0.96); }

	/* Ghost variant of CTA — used alongside Cast off (moored state) */
	.cta.ghost {
		background: transparent;
		border-color: var(--color-border-strong);
		color: var(--color-ink-2);
	}
	.cta.ghost:hover {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
		color: var(--color-accent-bright);
	}

	/* Cast off — prominent, accent-filled, anchor glyph */
	.cast-off {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		padding: 0 18px;
		background: var(--color-accent);
		border: 1px solid var(--color-accent-bright);
		border-radius: 6px;
		color: #080a0d;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, transform 0.12s, box-shadow 0.15s;
	}
	.cast-off .anchor { font-size: 15px; line-height: 1; }
	.cast-off:hover:not(:disabled) {
		background: var(--color-accent-bright);
		border-color: #ffffff;
		transform: translateY(-1px);
		box-shadow: 0 4px 14px rgba(204, 185, 157, 0.35);
	}
	.cast-off:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--color-border-focus);
	}
	.cast-off:active:not(:disabled) { transform: scale(0.96); box-shadow: none; }
	.cast-off:disabled { opacity: 0.55; cursor: not-allowed; }

	/* Disable sibling interaction during busy state */
	.actions:has(.icon-btn:disabled) .cta,
	.actions:has(.cast-off:disabled) .cta.ghost {
		opacity: 0.5;
		pointer-events: none;
	}

	/* CTA label — shared text style */
	.cta-label {
		display: inline-block;
		line-height: 1;
	}

	/* Spinner — pure CSS, nautical brass */
	.spinner {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1.5px solid var(--color-border-strong);
		border-top-color: var(--color-accent-bright);
		animation: spin 0.7s linear infinite;
		display: inline-block;
	}
	.spinner.dark {
		border-color: rgba(19, 18, 18, 0.25);
		border-top-color: #131212;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner { animation-duration: 1.6s; }
		.icon-btn, .cta, .cta-arrow, .cast-off { transition: none; }
		.icon-btn:hover, .cta:hover, .cast-off:hover { transform: none; }
	}
</style>
