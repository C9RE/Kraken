<script>
	import ShipCard from '$lib/components/ShipCard.svelte';

	/** @type {any[]} */
	let ships = $state([]);
	let loading = $state(true);
	let error = $state('');
	let action_msg = $state('');
	let action_err = $state('');
	let filter_query = $state('');
	/** @type {'all'|'afloat'|'moored'} */
	let status_filter = $state('all');
	/** @type {ReturnType<typeof setTimeout> | null} */
	let notice_timer = null;

	let afloat_count = $derived(ships.filter(s => s.active).length);
	let moored_count = $derived(ships.filter(s => !s.active).length);
	let total_cap = $derived(ships.reduce((sum, s) => sum + (Number(s.max_players) || 0), 0));
	let active_cap = $derived(ships.filter(s => s.active).reduce((sum, s) => sum + (Number(s.max_players) || 0), 0));

	let visible_ships = $derived.by(() => {
		const q = filter_query.trim().toLowerCase();
		return ships.filter(s => {
			if (status_filter === 'afloat' && !s.active) return false;
			if (status_filter === 'moored' && s.active) return false;
			if (!q) return true;
			const hay = `${s.server_name || ''} ${s.name || ''} ${s.id || ''} ${s.invite_code || ''} ${s.port || ''}`.toLowerCase();
			return hay.includes(q);
		});
	});

	/** @param {string} msg @param {boolean} [is_err] */
	function flash_notice(msg, is_err = false) {
		if (notice_timer) clearTimeout(notice_timer);
		if (is_err) {
			action_err = msg;
			action_msg = '';
		} else {
			action_msg = msg;
			action_err = '';
		}
		notice_timer = setTimeout(() => {
			action_msg = '';
			action_err = '';
		}, 5000);
	}

	async function load() {
		try {
			const r = await fetch('/api/fleet', { cache: 'no-store' });
			if (!r.ok) { error = `status ${r.status}`; return; }
			error = '';
			const data = await r.json();
			ships = data.ships || [];
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
		const id = setInterval(load, 5000);
		return () => clearInterval(id);
	});

	/** @param {string} ship_id @param {string} action */
	async function ship_action(ship_id, action) {
		try {
			const r = await fetch(`/api/fleet/${ship_id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action }),
			});
			const data = await r.json().catch(() => ({}));
			if (!r.ok || data.ok === false) {
				flash_notice(data.error || data.output || `${ship_id}: ${action} failed (${r.status})`, true);
			} else {
				const verb = action === 'start' ? 'cast off' : action === 'stop' ? 'moored' : 'restarted';
				flash_notice(`${ship_id} ${verb} cleanly.`);
			}
		} catch (e) {
			flash_notice(`${ship_id}: ${String(e)}`, true);
		}
		await load();
	}
</script>

<section class="fleet-header">
	<div class="fleet-title-block">
		<p class="kicker italic">Command Bridge</p>
		<h1 class="serif">Harbor Fleet</h1>
		<p class="hero-sub">
			Independent Windrose dedicated server stacks. Rig UE4SS mods, tune RocksDB voyage parameters, and hot-tar saves in real time.
		</p>
	</div>
	
	<div class="fleet-controls">
		{#if ships.length > 0}
			<div class="stats-pills mono">
				<span class="stat-chip"><strong class="num">{ships.length}</strong> vessels</span>
				<span class="sep">·</span>
				<span class="stat-chip on"><span class="dot on"></span> <strong class="num">{afloat_count}</strong> afloat</span>
				{#if moored_count > 0}
					<span class="sep">·</span>
					<span class="stat-chip"><span class="dot"></span> <strong class="num">{moored_count}</strong> moored</span>
				{/if}
				<span class="sep">·</span>
				<span class="stat-chip" title="Total crew slots across afloat ships"><strong class="num">{active_cap}</strong>/{total_cap} crew cap</span>
			</div>
		{/if}
		<a href="/new" class="btn btn-primary btn-drydock">
			<span>+ Commission Vessel</span>
		</a>
	</div>
</section>

{#if action_err}
	<div class="notice err mono" role="alert">
		<span>✕ {action_err}</span>
		<button type="button" class="notice-close" aria-label="Dismiss message" onclick={() => action_err = ''}>✕</button>
	</div>
{:else if action_msg}
	<div class="notice ok mono" role="status">
		<span>⚓ {action_msg}</span>
		<button type="button" class="notice-close" aria-label="Dismiss message" onclick={() => action_msg = ''}>✕</button>
	</div>
{/if}

{#if ships.length > 1}
	<div class="fleet-toolbar">
		<div class="search-box">
			<input
				type="search"
				class="mono"
				bind:value={filter_query}
				placeholder="Filter vessels by name, id, invite code, or port…"
				aria-label="Filter vessels"
			/>
		</div>
		<div class="filter-tabs mono" role="group" aria-label="Filter by vessel status">
			<button type="button" class="ftab" class:active={status_filter === 'all'} onclick={() => status_filter = 'all'}>
				All ({ships.length})
			</button>
			<button type="button" class="ftab" class:active={status_filter === 'afloat'} onclick={() => status_filter = 'afloat'}>
				Afloat ({afloat_count})
			</button>
			<button type="button" class="ftab" class:active={status_filter === 'moored'} onclick={() => status_filter = 'moored'}>
				Moored ({moored_count})
			</button>
		</div>
	</div>
{/if}

{#if loading && ships.length === 0}
	<div class="loading-state card">
		<p class="loading mono">Scanning the harbor waters…</p>
	</div>
{:else if error}
	<div class="err-card card">
		<p class="err mono">Communication failure: {error}</p>
		<button class="btn btn-ghost" onclick={load}>↺ Retry Scan</button>
	</div>
{:else if ships.length === 0}
	<div class="empty card">
		<div class="empty-icon">⚓</div>
		<h2 class="serif">The Harbor is Quiet</h2>
		<p>No vessels currently registered in the fleet registry. Visit drydock to commission your first Windrose dedicated server.</p>
		<a href="/new" class="btn btn-primary">→ Open Drydock</a>
	</div>
{:else if visible_ships.length === 0}
	<div class="empty card">
		<h2 class="serif">No Matching Vessels</h2>
		<p>No ships match the current search or status filter.</p>
		<button type="button" class="btn btn-ghost" onclick={() => { filter_query = ''; status_filter = 'all'; }}>Reset Filters</button>
	</div>
{:else}
	<div class="grid">
		{#each visible_ships as ship (ship.id)}
			<ShipCard {ship} onaction={(a) => ship_action(ship.id, a)} />
		{/each}
	</div>
{/if}

<style>
	.fleet-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 32px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.fleet-title-block { max-width: 620px; }
	.fleet-header h1 {
		font-size: 38px;
		font-weight: 700;
		margin: 4px 0 10px;
		color: #ffffff;
		letter-spacing: 0.03em;
		text-shadow: 0 2px 14px rgba(0,0,0,0.8);
	}
	.hero-sub {
		font-size: 14.5px;
		color: var(--color-ink-2);
		line-height: 1.6;
		margin: 0;
	}
	
	.fleet-controls {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.stats-pills {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 7px 14px;
		background: rgba(14, 18, 23, 0.75);
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		font-size: 12px;
		color: var(--color-ink-3);
	}
	.stat-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.stat-chip .num { color: #ffffff; font-weight: 600; }
	.stat-chip.on .num { color: var(--color-sage); }
	.stats-pills .sep { opacity: 0.3; }

	.btn-drydock {
		padding: 0 18px;
		height: 38px;
	}

	.notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		border-radius: 6px;
		font-size: 12px;
		margin-bottom: 20px;
	}
	.notice.ok {
		background: rgba(104, 186, 140, 0.12);
		border: 1px solid rgba(104, 186, 140, 0.35);
		color: #d6f5e3;
	}
	.notice.err {
		background: rgba(194, 89, 83, 0.14);
		border: 1px solid rgba(194, 89, 83, 0.45);
		color: #f8d4d2;
	}
	.notice-close {
		background: transparent;
		border: 0;
		color: inherit;
		opacity: 0.7;
		cursor: pointer;
		padding: 2px 6px;
	}
	.notice-close:hover { opacity: 1; }

	.fleet-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	.search-box { flex: 1 1 260px; max-width: 420px; }
	.search-box input {
		width: 100%;
		font-size: 12.5px;
		padding: 7px 12px;
		box-sizing: border-box;
	}
	.filter-tabs {
		display: inline-flex;
		gap: 4px;
		padding: 3px;
		background: rgba(14, 18, 23, 0.78);
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
	}
	.ftab {
		appearance: none;
		background: transparent;
		border: 1px solid transparent;
		color: var(--color-ink-3);
		padding: 5px 11px;
		border-radius: 4px;
		font-size: 11px;
		cursor: pointer;
		transition: color 0.15s, background 0.15s, border-color 0.15s;
	}
	.ftab:hover { color: var(--color-ink); }
	.ftab.active {
		background: var(--color-accent-soft);
		border-color: var(--color-border-strong);
		color: var(--color-accent-bright);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 22px;
	}

	.empty, .loading-state, .err-card {
		text-align: center;
		padding: 56px 28px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		max-width: 600px;
		margin: 40px auto;
	}
	.empty-icon { font-size: 32px; opacity: 0.6; }
	.empty h2 { font-size: 26px; font-weight: 600; margin: 0; color: #ffffff; }
	.empty p { color: var(--color-ink-2); margin: 0; line-height: 1.6; }
	.empty .btn { margin-top: 6px; }

	.loading { color: var(--color-accent-bright); margin: 0; font-size: 13px; }
	.err { color: var(--color-crimson); margin: 0; font-size: 13px; }
</style>
