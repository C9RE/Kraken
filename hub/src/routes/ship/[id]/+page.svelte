<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Rigging from '$lib/components/Rigging.svelte';
	import Voyage from '$lib/components/Voyage.svelte';

	let id = $derived(page.params.id);

	/** @type {any} */
	let ship = $state(null);
	let backups = $state([]);
	let loading = $state(true);
	let error = $state('');
	let busy = $state('');
	let toast = $state('');

	let logs = $state('');
	let logs_lines = $state(200);

	// Editable .env state - separate from ship.env so we know what's dirty
	let env_draft = $state(/** @type {Record<string,string>} */ ({}));
	let env_loaded_for = $state('');

	const FIELDS = [
		{ key: 'SERVER_NAME', label: 'server name', kind: 'text' },
		{ key: 'SERVER_NOTE', label: 'note', kind: 'text' },
		{ key: 'INVITE_CODE', label: 'invite code', kind: 'text' },
		{ key: 'SERVER_PASSWORD', label: 'password', kind: 'text' },
		{ key: 'MAX_PLAYERS', label: 'max players', kind: 'number' },
		{ key: 'PORT', label: 'port (UDP)', kind: 'number' },
		{ key: 'QUERYPORT', label: 'query port (UDP)', kind: 'number' },
		{ key: 'IMAGE_TAG', label: 'image tag', kind: 'text' },
		{ key: 'HOSTNAME', label: 'hostname', kind: 'text' },
		{ key: 'UPDATE_ON_START', label: 'auto-update on boot', kind: 'bool' },
		{ key: 'GENERATE_SETTINGS', label: 'auto-patch ServerDescription', kind: 'bool' },
		{ key: 'USE_DIRECT_CONNECTION', label: 'direct connection (no invite)', kind: 'bool' },
		{ key: 'DIRECT_CONNECTION_SERVER_PORT', label: 'direct port', kind: 'number' },
		{ key: 'DISCORD_WEBHOOK_URL', label: 'discord webhook', kind: 'text' },
		{ key: 'GOTIFY_URL', label: 'gotify url', kind: 'text' },
		{ key: 'GOTIFY_TOKEN', label: 'gotify token', kind: 'text' },
	];

	async function load() {
		try {
			const r = await fetch(`/api/fleet/${id}`, { cache: 'no-store' });
			if (!r.ok) {
				const d = await r.json().catch(() => ({}));
				error = d.error || `status ${r.status}`;
				return;
			}
			error = '';
			const data = await r.json();
			ship = data.ship;
			backups = data.backups || [];
			if (env_loaded_for !== id) {
				env_draft = { ...ship.env };
				env_loaded_for = id;
			}
		} finally {
			loading = false;
		}
	}

	async function load_logs() {
		try {
			const r = await fetch(`/api/fleet/${id}/logs?lines=${logs_lines}`);
			const data = await r.json();
			logs = data.logs || '';
		} catch {}
	}

	$effect(() => {
		load();
		load_logs();
		const tid = setInterval(() => { load(); load_logs(); }, 6000);
		return () => clearInterval(tid);
	});

	function flash(msg) { toast = msg; setTimeout(() => toast = '', 5000); }

	/** @param {string} action */
	async function act(action, opts = {}) {
		busy = action;
		try {
			const r = await fetch(`/api/fleet/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, ...opts }),
			});
			const data = await r.json();
			flash(data.ok === false ? `error: ${data.error || 'failed'}` : `${action} → ${data.ok ? 'ok' : 'done'}`);
			await load();
			await load_logs();
		} finally {
			busy = '';
		}
	}

	let dirty = $derived.by(() => {
		if (!ship?.env) return false;
		for (const f of FIELDS) {
			if ((env_draft[f.key] || '') !== (ship.env[f.key] || '')) return true;
		}
		return false;
	});

	async function save_env() {
		busy = 'save';
		try {
			const updates = {};
			for (const f of FIELDS) {
				updates[f.key] = env_draft[f.key] ?? '';
			}
			const r = await fetch(`/api/fleet/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'update_env', env: updates }),
			});
			const data = await r.json();
			if (data.ok) {
				flash('settings saved · restart for changes to take effect');
				await load();
			} else {
				flash(`save failed: ${data.error}`);
			}
		} finally {
			busy = '';
		}
	}

	async function scuttle() {
		const confirmed = confirm(`Scuttle "${ship.name}"?\n\nThis will:\n  • stop the container\n  • DELETE the ship's directory (saves, configs, all of it)\n  • remove the ship from the fleet index\n\nThis cannot be undone.`);
		if (!confirmed) return;
		busy = 'scuttle';
		try {
			const r = await fetch(`/api/fleet/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'scuttle', purge: true }),
			});
			const data = await r.json();
			if (data.ok) goto('/');
			else flash(`scuttle failed: ${data.error}`);
		} finally {
			busy = '';
		}
	}

	function fmt_size(bytes) {
		if (!bytes) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
		if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	}
	function fmt_date(epoch) { return new Date(epoch * 1000).toLocaleString(); }
	function fmt_uptime(secs) {
		if (!secs) return '-';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
	let uptime_secs = $derived(
		ship?.started_at ? Math.max(0, Math.floor(Date.now() / 1000) - ship.started_at) : 0
	);
</script>

{#if loading && !ship}
	<div class="loading-state card">
		<p class="loading mono">Boarding vessel bridge…</p>
	</div>
{:else if error}
	<div class="err-card card">
		<p class="err mono">Vessel bridge unreachable: {error}</p>
		<a href="/" class="btn btn-ghost">← Return to Harbor Fleet</a>
	</div>
{:else if ship}
	<header class="bridge-head">
		<div class="bridge-info">
			<div class="nav-breadcrumbs">
				<a href="/" class="back-link">← Harbor Fleet</a>
			</div>
			<h1 class="serif">{ship.env.SERVER_NAME || ship.name}</h1>
			<div class="status-pills mono">
				<span class="status-pill" class:on={ship.active}>
					<span class="dot" class:on={ship.active} class:warn={ship.health === 'unhealthy'}></span>
					<span>{ship.active ? `Afloat · ${fmt_uptime(uptime_secs)}` : 'Moored in Harbor'}</span>
				</span>
				<span class="sep">·</span>
				<span class="id-pill">id: {ship.id}</span>
				<span class="sep">·</span>
				<span class="port-pill">port: {ship.env.PORT || ship.port}</span>
				<span class="sep">·</span>
				<span class="ver-pill">{ship.env.IMAGE_TAG || ship.image_tag || 'v1.6.4'}</span>
			</div>
		</div>
		<div class="bridge-actions">
			{#if ship.active}
				<button class="btn btn-ghost" disabled={!!busy} onclick={() => act('restart')} title="Restart server container">
					{busy === 'restart' ? 'restarting…' : '↻ Restart'}
				</button>
				<button class="btn btn-danger" disabled={!!busy} onclick={() => act('stop')} title="Stop server container">
					{busy === 'stop' ? 'stopping…' : '■ Moor (Stop)'}
				</button>
			{:else}
				<button class="btn btn-primary btn-cast" disabled={!!busy} onclick={() => act('start')} title="Launch dedicated server container">
					{busy === 'start' ? 'casting off…' : '⚓ Cast Off (Start)'}
				</button>
			{/if}
		</div>
	</header>

	{#if toast}<div class="toast mono">{toast}</div>{/if}

	<section class="grid">
		<!-- LEFT - settings & voyage -->
		<div class="col">
			<article class="card">
				<header class="card-head">
					<h2 class="serif">Manifest &amp; Settings</h2>
					<p>Dedicated server stack configuration. Values persist in <code>.env</code>; restart container to apply.</p>
				</header>
				<div class="fields">
					{#each FIELDS as f}
						<label class="field-label">
							<span>{f.label}</span>
							{#if f.kind === 'bool'}
								<select bind:value={env_draft[f.key]}>
									<option value="">(unset)</option>
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							{:else if f.kind === 'number'}
								<input type="number" bind:value={env_draft[f.key]} />
							{:else}
								<input bind:value={env_draft[f.key]} />
							{/if}
						</label>
					{/each}
				</div>
				<footer class="form-foot">
					<span class="hint mono">{dirty ? '⬤ Unsaved configuration changes' : '○ Configuration synchronized'}</span>
					<button class="btn btn-primary" disabled={!dirty || !!busy} onclick={save_env}>
						{busy === 'save' ? 'saving…' : 'Save Settings'}
					</button>
				</footer>
			</article>

			<Voyage {id} />

			<article class="card">
				<header class="card-head">
					<h2 class="serif">Drydock Refit</h2>
					<p>Pull latest Windrose Docker image and recreate container. Safe hot-restart.</p>
				</header>
				<div class="row gap">
					<button class="btn btn-ghost" disabled={!!busy} onclick={() => act('pull')}>
						{busy === 'pull' ? 'pulling…' : 'Pull Image'}
					</button>
					<button class="btn btn-primary" disabled={!!busy} onclick={() => act('refit')}>
						{busy === 'refit' ? 'refitting…' : 'Refit & Restart Stack'}
					</button>
				</div>
			</article>

			<article class="card danger">
				<header class="card-head">
					<h2 class="serif">Scuttle Vessel</h2>
					<p>Permanently remove this ship and wipe directory contents. Ensure you have backups saved.</p>
				</header>
				<button class="btn btn-danger" disabled={!!busy} onclick={scuttle}>
					{busy === 'scuttle' ? 'scuttling…' : '⚠ Scuttle & Delete Ship'}
				</button>
			</article>
		</div>

		<!-- RIGHT - mods, cargo hold, logs -->
		<div class="col">
			<Rigging {id} />

			<article class="card">
				<header class="card-head">
					<h2 class="serif">Cargo Hold (Backups)</h2>
					<p>Hot save snapshots stored in <code>{ship.path}/backups/</code>.</p>
				</header>
				<div class="row gap cargo-top">
					<span class="mono ink-3">Disk consumption: <strong class="ink-1">{fmt_size(ship.storage_bytes)}</strong></span>
					<span class="grow"></span>
					<button class="btn btn-primary" disabled={!!busy} onclick={() => act('backup')}>
						{busy === 'backup' ? 'tarring…' : '📦 Snapshot Backup'}
					</button>
				</div>
				{#if backups.length}
					<ul class="bk-list mono">
						{#each backups.slice(0, 8) as b}
							<li>
								<span class="bk-name" title={b.name}>{b.name}</span>
								<span class="bk-size">{fmt_size(b.size)}</span>
								<span class="bk-time">{fmt_date(b.mtime)}</span>
							</li>
						{/each}
					</ul>
					{#if backups.length > 8}<p class="ink-4 mono small">+{backups.length - 8} older archives stored</p>{/if}
				{:else}
					<p class="ink-4 empty-note">No save snapshots recorded yet.</p>
				{/if}
			</article>

			<article class="card">
				<header class="card-head log-head">
					<div>
						<h2 class="serif">Ship's Log Book</h2>
						<p>Real-time stdout/stderr from <code>docker logs {ship.container}</code></p>
					</div>
					<div class="log-controls mono">
						<span>tail lines:</span>
						<input type="number" bind:value={logs_lines} min="50" max="2000" step="50" class="inline-num" />
					</div>
				</header>
				<pre class="logs mono">{logs || '(no logs captured yet — cast off vessel to start container)'}</pre>
			</article>
		</div>
	</section>
{/if}

<style>
	.bridge-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 28px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.bridge-info { max-width: 700px; }
	.nav-breadcrumbs { margin-bottom: 8px; }
	.back-link {
		font-family: var(--font-mono);
		font-size: 11.5px;
		letter-spacing: 0.08em;
		color: var(--color-accent);
		text-transform: uppercase;
	}
	.back-link:hover { color: #ffffff; }

	.bridge-head h1 {
		font-size: 38px;
		font-weight: 700;
		margin: 2px 0 10px;
		color: #ffffff;
		letter-spacing: 0.03em;
		text-shadow: 0 2px 14px rgba(0,0,0,0.8);
	}
	
	.status-pills {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		font-size: 12px;
		color: var(--color-ink-3);
	}
	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		border-radius: 4px;
		background: rgba(255,255,255,0.05);
		border: 1px solid var(--color-border);
		color: var(--color-ink-2);
	}
	.status-pill.on {
		background: rgba(104, 186, 140, 0.15);
		border-color: rgba(104, 186, 140, 0.4);
		color: #ffffff;
	}
	.status-pills .sep { opacity: 0.3; }

	.bridge-actions { display: flex; gap: 10px; align-items: center; }
	.btn-cast { height: 38px; padding: 0 20px; }

	.grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 24px; }
	@media (max-width: 1024px) { .grid { grid-template-columns: 1fr; } }
	.col { display: flex; flex-direction: column; gap: 24px; min-width: 0; }

	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #ffffff; }
	.card-head p { color: var(--color-ink-2); margin: 0; font-size: 13px; }
	.card-head code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 4px; color: var(--color-accent-bright); }

	.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px 18px; }
	.field-label span { font-size: 10.5px; font-weight: 600; color: var(--color-accent); letter-spacing: 0.14em; }

	.form-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--color-border); }
	.hint { font-size: 11.5px; color: var(--color-ink-3); letter-spacing: 0.04em; }

	.card.danger { border-color: rgba(194, 89, 83, 0.4); }
	.card.danger .card-head h2 { color: var(--color-crimson); }

	.row.gap { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.grow { flex: 1; }
	.ink-1 { color: #ffffff; }
	.ink-3 { color: var(--color-ink-3); }
	.ink-4 { color: var(--color-ink-4); }

	.cargo-top { padding-bottom: 12px; border-bottom: 1px solid var(--color-border); }
	.bk-list { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
	.bk-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 8px 10px; background: rgba(0,0,0,0.25); border-radius: 4px; border: 1px solid var(--color-border); }
	.bk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-accent-bright); }
	.bk-size { color: var(--color-ink-2); }
	.bk-time { color: var(--color-ink-3); font-size: 11px; }

	.log-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
	.log-controls { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--color-ink-3); }
	.inline-num { display: inline-block; width: 72px; padding: 4px 8px; font-size: 12px; }

	.logs {
		background: rgba(5, 7, 9, 0.85);
		border: 1px solid var(--color-border);
		padding: 14px 16px;
		border-radius: 6px;
		max-height: 420px;
		overflow: auto;
		font-size: 11.5px;
		line-height: 1.55;
		color: #e2ded8;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.toast {
		background: rgba(204, 185, 157, 0.15);
		border: 1px solid var(--color-accent-bright);
		color: #ffffff;
		padding: 10px 16px;
		border-radius: 6px;
		font-size: 12.5px;
		margin-bottom: 20px;
		box-shadow: 0 4px 16px rgba(0,0,0,0.4);
	}

	.empty-note { font-size: 13px; margin-top: 14px; text-align: center; }
	.loading-state, .err-card { text-align: center; padding: 56px 28px; max-width: 600px; margin: 40px auto; }
	.loading { color: var(--color-accent-bright); }
	.err { color: var(--color-crimson); margin-bottom: 14px; }
</style>
