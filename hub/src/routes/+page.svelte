<script>
	import ShipCard from '$lib/components/ShipCard.svelte';

	/** @type {any[]} */
	let ships = $state([]);
	let loading = $state(true);
	let error = $state('');

	let afloat_count = $derived(ships.filter(s => s.active).length);
	let moored_count = $derived(ships.filter(s => !s.active).length);

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
		await fetch(`/api/fleet/${ship_id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action }),
		});
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
			</div>
		{/if}
		<a href="/new" class="btn btn-primary btn-drydock">
			<span>+ Commission Vessel</span>
		</a>
	</div>
</section>

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
{:else}
	<div class="grid">
		{#each ships as ship (ship.id)}
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
