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

<section class="hero">
	<p class="kicker italic">commission a new vessel</p>
	<h1 class="serif">drydock</h1>
	<p class="hero-sub">
		give the ship a name, pick a port, set the headcount. the hub will lay her keel -
		writing a docker-compose stack you can edit later from her bridge.
	</p>
</section>

<form class="card form" onsubmit={submit}>
	<div class="row">
		<label>
			<span>ship name</span>
			<input value={form.name} oninput={on_name_input} placeholder="The Mariner" required />
		</label>
		<label>
			<span>id <em>(slug)</em></span>
			<input value={form.id} oninput={(e) => { form.id = e.target.value; touched_id = true; }}
				placeholder="mariner" pattern="[a-z][a-z0-9-]{1,30}" required />
		</label>
	</div>

	<label>
		<span>server note</span>
		<input bind:value={form.server_note} placeholder="A friendly co-op server" />
	</label>

	<div class="row">
		<label>
			<span>max players</span>
			<input type="number" min="1" max="16" bind:value={form.max_players} />
		</label>
		<label>
			<span>game port (UDP)</span>
			<input type="number" bind:value={form.port} />
		</label>
		<label>
			<span>query port (UDP)</span>
			<input type="number" bind:value={form.queryport} />
		</label>
	</div>

	<div class="row">
		<label>
			<span>invite code <em>(blank = auto)</em></span>
			<input bind:value={form.invite_code} placeholder="leave empty to keep existing" />
		</label>
		<label>
			<span>server password <em>(optional)</em></span>
			<input bind:value={form.server_password} placeholder="public if blank" />
		</label>
	</div>

	<div class="row">
		<label>
			<span>image tag</span>
			<input bind:value={form.image_tag} />
		</label>
		<label>
			<span>hostname <em>(keep "localhost" for ICE)</em></span>
			<input bind:value={form.hostname} />
		</label>
	</div>

	{#if error}<p class="err">{error}</p>{/if}

	<div class="actions">
		<a href="/" class="btn btn-ghost">Back to fleet</a>
		<button type="submit" class="btn btn-primary" disabled={saving || !form.id || !form.name}>
			{saving ? 'laying keel…' : 'Lay keel'}
		</button>
	</div>
</form>

<style>
	.hero { margin-bottom: 32px; max-width: 720px; }
	.hero h1 { font-size: 44px; font-weight: 600; margin: 4px 0 12px; }
	.hero-sub { font-size: 15px; color: var(--color-ink-2); line-height: 1.6; }

	.form { display: flex; flex-direction: column; gap: 20px; max-width: 760px; }
	.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
	label em { font-style: italic; color: var(--color-ink-4); font-weight: 400; text-transform: none; letter-spacing: 0; }
	.actions { display: flex; gap: 12px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--color-border); }
	.err { color: var(--color-crimson); margin: 0; font-size: 13px; }
</style>
