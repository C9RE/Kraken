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

	// Editable .env state — separate from ship.env so we know what's dirty
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
		if (!secs) return '—';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
	let uptime_secs = $derived(
		ship?.started_at ? Math.max(0, Math.floor(Date.now() / 1000) - ship.started_at) : 0
	);
</script>

{#if loading && !ship}
	<p class="loading">boarding…</p>
{:else if error}
	<p class="err">error: {error} · <a href="/">back to fleet</a></p>
{:else if ship}
	<header class="bridge-head">
		<div>
			<p class="kicker italic">bridge of</p>
			<h1 class="serif">{ship.env.SERVER_NAME || ship.name}</h1>
			<p class="sub">
				<span class="dot" class:on={ship.active} class:warn={ship.health === 'unhealthy'}></span>
				<span class="mono">{ship.active ? `afloat · ${fmt_uptime(uptime_secs)}` : 'moored'}</span>
				<span class="sep">·</span>
				<span class="mono">{ship.id}</span>
				<span class="sep">·</span>
				<span class="mono">{ship.env.IMAGE_TAG || ship.image_tag}</span>
			</p>
		</div>
		<div class="actions">
			{#if ship.active}
				<button class="btn btn-ghost" disabled={!!busy} onclick={() => act('restart')}>
					{busy === 'restart' ? '…' : 'Restart'}
				</button>
				<button class="btn btn-danger" disabled={!!busy} onclick={() => act('stop')}>
					{busy === 'stop' ? '…' : 'Stop'}
				</button>
			{:else}
				<button class="btn btn-primary" disabled={!!busy} onclick={() => act('start')}>
					{busy === 'start' ? 'starting…' : 'Cast off'}
				</button>
			{/if}
		</div>
	</header>

	{#if toast}<p class="toast">{toast}</p>{/if}

	<section class="grid">
		<!-- LEFT — settings -->
		<div class="col">
			<article class="card">
				<header class="card-head">
					<h2 class="serif">rigging</h2>
					<p>edit the ship's configuration. saved values land in <code>.env</code>; restart to take effect.</p>
				</header>
				<div class="fields">
					{#each FIELDS as f}
						<label>
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
					<span class="hint mono">{dirty ? '⬤ unsaved changes' : '○ no changes'}</span>
					<button class="btn btn-primary" disabled={!dirty || !!busy} onclick={save_env}>
						{busy === 'save' ? 'saving…' : 'Save settings'}
					</button>
				</footer>
			</article>

			<Voyage {id} />

			<article class="card">
				<header class="card-head">
					<h2 class="serif">refit</h2>
					<p>pull the latest image and re-launch. equivalent to <code>docker compose pull &amp;&amp; up -d</code>.</p>
				</header>
				<div class="row gap">
					<button class="btn" disabled={!!busy} onclick={() => act('pull')}>
						{busy === 'pull' ? 'pulling…' : 'Pull image only'}
					</button>
					<button class="btn btn-primary" disabled={!!busy} onclick={() => act('refit')}>
						{busy === 'refit' ? 'refitting…' : 'Refit (pull + restart)'}
					</button>
				</div>
			</article>

			<article class="card danger">
				<header class="card-head">
					<h2 class="serif">scuttle</h2>
					<p>permanently delete this ship and all its files. there is no recovery short of a backup tarball.</p>
				</header>
				<button class="btn btn-danger" disabled={!!busy} onclick={scuttle}>
					{busy === 'scuttle' ? 'scuttling…' : '⚠ Scuttle ship'}
				</button>
			</article>
		</div>

		<!-- RIGHT — mods, backups, logs -->
		<div class="col">
			<Rigging {id} />

			<article class="card">
				<header class="card-head">
					<h2 class="serif">cargo hold</h2>
					<p>save tarballs in <code>{ship.path}/backups/</code>. hot-tarred (no stop required).</p>
				</header>
				<div class="row gap">
					<span class="mono ink-3">storage on disk: {fmt_size(ship.storage_bytes)}</span>
					<span class="grow"></span>
					<button class="btn btn-primary" disabled={!!busy} onclick={() => act('backup')}>
						{busy === 'backup' ? 'tarring…' : 'Backup now'}
					</button>
				</div>
				{#if backups.length}
					<ul class="bk-list mono">
						{#each backups.slice(0, 8) as b}
							<li>
								<span class="bk-name">{b.name}</span>
								<span class="bk-size">{fmt_size(b.size)}</span>
								<span class="bk-time">{fmt_date(b.mtime)}</span>
							</li>
						{/each}
					</ul>
					{#if backups.length > 8}<p class="ink-4 mono">+{backups.length - 8} older</p>{/if}
				{:else}
					<p class="ink-4">no backups yet.</p>
				{/if}
			</article>

			<article class="card">
				<header class="card-head">
					<h2 class="serif">log book</h2>
					<p>last <input type="number" bind:value={logs_lines} min="50" max="2000" step="50" class="inline-num" /> lines from <code>docker logs {ship.container}</code></p>
				</header>
				<pre class="logs mono">{logs || '(no output yet)'}</pre>
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
		margin-bottom: 24px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.bridge-head h1 { font-size: 40px; font-weight: 600; margin: 4px 0 8px; }
	.bridge-head .sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--color-ink-3); font-size: 12px; margin: 0; }
	.bridge-head .sub .sep { opacity: 0.5; }
	.bridge-head .actions { display: flex; gap: 8px; }

	.grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; }
	@media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
	.col { display: flex; flex-direction: column; gap: 24px; min-width: 0; }

	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
	.card-head p { color: var(--color-ink-3); margin: 0; font-size: 13px; }
	.card-head code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 2px; color: var(--color-ink-2); }

	.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px 18px; }

	.form-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--color-border); }
	.hint { font-size: 11px; color: var(--color-ink-3); letter-spacing: 0.06em; }

	.card.danger { border-color: rgba(176, 77, 62, 0.3); }
	.card.danger .card-head h2 { color: var(--color-crimson); }

	.row.gap { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.grow { flex: 1; }
	.ink-3 { color: var(--color-ink-3); }
	.ink-4 { color: var(--color-ink-4); }

	.bk-list { list-style: none; padding: 0; margin: 16px 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
	.bk-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); }
	.bk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-ink-2); }
	.bk-size { color: var(--color-ink-3); }
	.bk-time { color: var(--color-ink-4); font-size: 11px; }

	.inline-num { display: inline-block; width: 80px; padding: 2px 6px; font-size: 12px; }

	.logs {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		padding: 12px 14px;
		border-radius: 2px;
		max-height: 360px;
		overflow: auto;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-ink-2);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.toast {
		background: var(--color-accent-soft);
		border: 1px solid var(--color-accent);
		color: var(--color-accent-bright);
		padding: 10px 14px;
		border-radius: 2px;
		font-size: 13px;
		margin-bottom: 16px;
	}

	.loading, .err { color: var(--color-ink-3); padding: 32px 0; }
	.err { color: var(--color-crimson); }
</style>
