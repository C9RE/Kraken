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

	function set_players(n) {
		form.max_players = n;
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
	<p class="kicker italic">Shipyard Commissioning</p>
	<h1 class="serif">Drydock</h1>
	<p class="hero-sub">
		Commission a new independent Windrose dedicated server instance. Configure vessel manifest, allocate dedicated UDP ports, set crew headcount, and the hub will automatically lay her keel and generate the Docker Compose environment.
	</p>
</section>

<form class="drydock-form" onsubmit={submit}>
	<div class="grid-2col">
		<!-- Left Card: Identity & Network -->
		<article class="card">
			<header class="card-head">
				<h2 class="serif">Vessel Manifest &amp; Network</h2>
				<p>Identity attributes and dedicated UDP host port bindings.</p>
			</header>

			<div class="form-fields">
				<label class="field">
					<span class="field-label">Vessel Name <em class="req">*</em></span>
					<input
						value={form.name}
						oninput={on_name_input}
						placeholder="e.g. The Sovereign"
						required
					/>
				</label>

				<label class="field">
					<span class="field-label">Container Slug <em class="muted">(directory &amp; stack id)</em></span>
					<input
						class="mono"
						value={form.id}
						oninput={(e) => { form.id = e.target.value; touched_id = true; }}
						placeholder="sovereign"
						pattern="[a-z][a-z0-9-]{1,30}"
						required
					/>
				</label>

				<label class="field">
					<span class="field-label">Server Note / MOTD</span>
					<input
						bind:value={form.server_note}
						placeholder="Co-op sailing server · High seas adventure"
					/>
				</label>

				<div class="field">
					<div class="field-label-row">
						<span class="field-label">Max Crew Capacity</span>
						<div class="preset-caps mono">
							{#each [2, 4, 8, 12, 16] as n}
								<button
									type="button"
									class="cap-pill"
									class:active={form.max_players === n}
									onclick={() => set_players(n)}
								>
									{n}p
								</button>
							{/each}
						</div>
					</div>
					<input type="number" min="1" max="32" bind:value={form.max_players} />
				</div>

				<div class="row-2">
					<label class="field">
						<span class="field-label">Game Port (UDP)</span>
						<input class="mono" type="number" bind:value={form.port} required />
					</label>
					<label class="field">
						<span class="field-label">Query Port (UDP)</span>
						<input class="mono" type="number" bind:value={form.queryport} required />
					</label>
				</div>
			</div>
		</article>

		<!-- Right Card: Security & Container Architecture -->
		<article class="card">
			<header class="card-head">
				<h2 class="serif">Security &amp; Stack Architecture</h2>
				<p>Access control, SteamCMD image tags, and ICE protocol resolution.</p>
			</header>

			<div class="form-fields">
				<label class="field">
					<span class="field-label">Invite Code <em>(blank = auto-generate on boot)</em></span>
					<input
						class="mono"
						bind:value={form.invite_code}
						placeholder="Auto-generated on first launch"
					/>
				</label>

				<label class="field">
					<span class="field-label">Server Password <em>(optional)</em></span>
					<input
						type="password"
						bind:value={form.server_password}
						placeholder="Leave blank for public access"
					/>
				</label>

				<label class="field">
					<span class="field-label">Docker Image Tag</span>
					<input
						class="mono"
						bind:value={form.image_tag}
						placeholder="v1.6.4"
						required
					/>
				</label>

				<label class="field">
					<span class="field-label">Hostname <em>(default: localhost for ICE)</em></span>
					<input
						class="mono"
						bind:value={form.hostname}
						placeholder="localhost"
						required
					/>
				</label>

				<div class="info-callout mono">
					<span class="info-bullet">⚓</span>
					<span>Laying keel will create <code>fleet/{form.id || 'slug'}/</code>, write <code>.env</code>, and isolate game data into persistent volumes.</span>
				</div>
			</div>
		</article>
	</div>

	<!-- Live Spec Summary and Commission Action Bar -->
	<div class="spec-bar card">
		<div class="spec-info mono">
			<div class="spec-chip">
				<span class="spec-k">vessel:</span>
				<span class="spec-v">{form.name || 'Unnamed Vessel'}</span>
			</div>
			<span class="spec-sep">·</span>
			<div class="spec-chip">
				<span class="spec-k">slug:</span>
				<span class="spec-v">windrose-{form.id || '…'}</span>
			</div>
			<span class="spec-sep">·</span>
			<div class="spec-chip">
				<span class="spec-k">ports:</span>
				<span class="spec-v">{form.port || 7777}/{form.queryport || 7778} UDP</span>
			</div>
			<span class="spec-sep">·</span>
			<div class="spec-chip">
				<span class="spec-k">capacity:</span>
				<span class="spec-v">{form.max_players} sailors</span>
			</div>
		</div>

		<div class="spec-actions">
			{#if error}<span class="err mono">{error}</span>{/if}
			<a href="/" class="btn btn-ghost">Cancel</a>
			<button
				type="submit"
				class="btn btn-primary btn-lay"
				disabled={saving || !form.id || !form.name}
			>
				{saving ? 'laying keel…' : '⚓ Lay Keel & Commission'}
			</button>
		</div>
	</div>
</form>

<style>
	.drydock-header {
		margin-bottom: 28px;
		max-width: 1000px;
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

	.drydock-form {
		display: flex;
		flex-direction: column;
		gap: 28px;
		width: 100%;
	}

	.grid-2col {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 28px;
		align-items: start;
	}
	@media (max-width: 1024px) {
		.grid-2col { grid-template-columns: 1fr; }
	}

	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #ffffff; }
	.card-head p { color: var(--color-ink-2); margin: 0; font-size: 13px; }

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.field-label {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.field-label em {
		font-style: italic;
		color: var(--color-ink-3);
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}
	.field-label .req { color: var(--color-accent-bright); font-weight: 700; }

	.field-label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2px;
	}
	.preset-caps {
		display: flex;
		gap: 6px;
	}
	.cap-pill {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--color-border-strong);
		color: var(--color-ink-3);
		cursor: pointer;
		transition: all 0.12s;
	}
	.cap-pill:hover { color: #ffffff; border-color: var(--color-accent); }
	.cap-pill.active {
		background: var(--color-accent-soft);
		border-color: var(--color-accent-bright);
		color: var(--color-accent-bright);
	}

	.row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	@media (max-width: 560px) {
		.row-2 { grid-template-columns: 1fr; }
	}

	.info-callout {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 14px;
		background: rgba(204, 185, 157, 0.06);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 11.5px;
		color: var(--color-ink-3);
		line-height: 1.5;
		margin-top: 4px;
	}
	.info-callout code {
		background: var(--color-surface-2);
		padding: 1px 4px;
		border-radius: 3px;
		color: var(--color-accent-bright);
	}
	.info-bullet { color: var(--color-accent-bright); font-size: 13px; }

	/* Live Spec summary bar */
	.spec-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding: 18px 24px;
		flex-wrap: wrap;
	}
	.spec-info {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
		color: var(--color-ink-3);
		flex-wrap: wrap;
	}
	.spec-chip { display: inline-flex; gap: 6px; align-items: baseline; }
	.spec-k { color: var(--color-accent); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.12em; }
	.spec-v { color: #ffffff; font-weight: 500; }
	.spec-sep { opacity: 0.3; }

	.spec-actions {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.btn-lay {
		height: 42px;
		padding: 0 24px;
		font-size: 13px;
	}
	.err { color: var(--color-crimson); font-size: 12.5px; }
</style>
