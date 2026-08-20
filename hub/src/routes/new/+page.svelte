<script>
	import { goto } from '$app/navigation';

	let form = $state({
		id: '',
		name: '',
		invite_code: '',
		server_note: '',
		max_players: 4,
		port: 7777,
		queryport: 7778,
		server_password: '',
		image_tag: 'v1.6.4',
		hostname: 'localhost',
	});
	let saving = $state(false);
	let error = $state('');

	// Auto-derive id from name when user hasn't typed one yet
	let touched_id = $state(false);
	function on_name_input(e) {
		form.name = e.target.value;
		if (!touched_id) {
			form.id = form.name.toLowerCase()
				.replace(/[^a-z0-9-]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 30);
		}
	}

	async function submit(e) {
		e.preventDefault();
		saving = true; error = '';
		try {
			const r = await fetch('/api/fleet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...form,
					max_players: Number(form.max_players),
					port: Number(form.port),
					queryport: Number(form.queryport),
				}),
			});
			const data = await r.json();
			if (!r.ok || !data.ok) { error = data.error || `status ${r.status}`; return; }
			goto(`/ship/${data.ship.id}`);
		} catch (e) {
			error = String(e);
		} finally {
			saving = false;
		}
	}
</script>

<section class="drydock-header">
	<div class="nav-breadcrumbs">
		<a href="/" class="back-link">← Harbor Fleet</a>
	</div>
	<p class="kicker italic">Commission a New Vessel</p>
	<h1 class="serif">Drydock</h1>
	<p class="hero-sub">
		Give your vessel a name, allocate UDP ports, and configure headcount capacity. The hub will automatically lay her keel by generating a Docker Compose stack ready for instant launch.
	</p>
</section>

<form class="card form" onsubmit={submit}>
	<div class="row">
		<label>
			<span>Vessel Name</span>
			<input value={form.name} oninput={on_name_input} placeholder="The Sovereign" required />
		</label>
		<label>
			<span>Identifier Slug <em>(container id)</em></span>
			<input value={form.id} oninput={(e) => { form.id = e.target.value; touched_id = true; }}
				placeholder="sovereign" pattern="[a-z][a-z0-9-]{1,30}" required />
		</label>
	</div>

	<label>
		<span>Server Note / MOTD</span>
		<input bind:value={form.server_note} placeholder="Co-op sailing server · Mods enabled" />
	</label>

	<div class="row row-3">
		<label>
			<span>Max Players</span>
			<input type="number" min="1" max="16" bind:value={form.max_players} />
		</label>
		<label>
			<span>Game Port (UDP)</span>
			<input type="number" bind:value={form.port} />
		</label>
		<label>
			<span>Query Port (UDP)</span>
			<input type="number" bind:value={form.queryport} />
		</label>
	</div>

	<div class="row">
		<label>
			<span>Invite Code <em>(blank = auto-generate)</em></span>
			<input bind:value={form.invite_code} placeholder="auto-generated on boot if empty" />
		</label>
		<label>
			<span>Server Password <em>(optional)</em></span>
			<input bind:value={form.server_password} placeholder="leave blank for public access" />
		</label>
	</div>

	<div class="row">
		<label>
			<span>Docker Image Tag</span>
			<input bind:value={form.image_tag} />
		</label>
		<label>
			<span>Hostname <em>(default: localhost)</em></span>
			<input bind:value={form.hostname} />
		</label>
	</div>

	{#if error}<p class="err mono">{error}</p>{/if}

	<div class="actions">
		<a href="/" class="btn btn-ghost">Cancel</a>
		<button type="submit" class="btn btn-primary btn-lay" disabled={saving || !form.id || !form.name}>
			{saving ? 'laying keel…' : '⚓ Lay Keel & Commission'}
		</button>
	</div>
</form>

<style>
	.drydock-header {
		margin-bottom: 28px;
		max-width: 740px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--color-border);
	}
	.nav-breadcrumbs { margin-bottom: 8px; }
	.back-link {
		font-family: var(--font-mono);
		font-size: 11.5px;
		letter-spacing: 0.08em;
		color: var(--color-accent);
		text-transform: uppercase;
	}
	.back-link:hover { color: #ffffff; }

	.drydock-header h1 {
		font-size: 38px;
		font-weight: 700;
		margin: 4px 0 10px;
		color: #ffffff;
		letter-spacing: 0.03em;
		text-shadow: 0 2px 14px rgba(0,0,0,0.8);
	}
	.hero-sub { font-size: 14.5px; color: var(--color-ink-2); line-height: 1.6; margin: 0; }

	.form {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 780px;
	}
	.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
	.row-3 { grid-template-columns: repeat(3, 1fr); }
	@media (max-width: 640px) { .row-3 { grid-template-columns: 1fr; } }

	label span { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent); }
	label em { font-style: italic; color: var(--color-ink-3); font-weight: 400; text-transform: none; letter-spacing: 0; }

	.actions { display: flex; gap: 12px; justify-content: flex-end; align-items: center; padding-top: 14px; border-top: 1px solid var(--color-border); }
	.btn-lay { height: 38px; padding: 0 22px; }
	.err { color: var(--color-crimson); margin: 0; font-size: 13px; }
</style>
