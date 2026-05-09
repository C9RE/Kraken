<script>
	import ShipCard from '$lib/components/ShipCard.svelte';

	/** @type {any[]} */
	let ships = $state([]);
	let loading = $state(true);
	let error = $state('');

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

<section class="hero">
	<p class="kicker italic">welcome aboard</p>
	<h1 class="serif">the fleet</h1>
	<p class="hero-sub">
		every ship is a self-contained Windrose dedicated server.
		raise a new one in <a href="/new">drydock</a>; trim the rigging from each ship's bridge.
	</p>
</section>

{#if loading && ships.length === 0}
	<p class="loading">scanning the harbor…</p>
{:else if error}
	<p class="err">error: {error}</p>
{:else if ships.length === 0}
	<div class="empty card">
		<h2 class="serif">the harbor is empty</h2>
		<p>no ships registered yet. visit the <a href="/new">drydock</a> to commission your first.</p>
		<a href="/new" class="btn btn-primary">→ open drydock</a>
	</div>
{:else}
	<div class="grid">
		{#each ships as ship (ship.id)}
			<ShipCard {ship} onaction={(a) => ship_action(ship.id, a)} />
		{/each}
	</div>
{/if}

<style>
	.hero { margin-bottom: 32px; max-width: 720px; }
	.hero h1 { font-size: 44px; font-weight: 600; margin: 4px 0 12px; }
	.hero-sub { font-size: 15px; color: var(--color-ink-2); line-height: 1.6; }
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 20px;
	}
	.empty {
		text-align: center;
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}
	.empty h2 { font-size: 28px; font-weight: 500; margin: 0; color: var(--color-ink-2); }
	.empty p { color: var(--color-ink-3); margin: 0; }
	.empty .btn { margin-top: 8px; }
	.loading, .err { color: var(--color-ink-3); padding: 32px 0; }
	.err { color: var(--color-crimson); }
</style>
