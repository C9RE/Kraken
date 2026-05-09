<script>
	import { goto } from '$app/navigation';

	/** @type {any} */
	let s = $state(null);
	let loading = $state(true);
	let error = $state('');
	let updating = $state(false);
	let toast = $state('');
	/** @type {Array<{step: string, ok: boolean, output: string}>} */
	let last_log = $state([]);

	// Auth state
	/** @type {any} */
	let auth = $state(null);
	let pin_busy = $state(false);
	let pin_new = $state('');
	let pin_confirm = $state('');
	let pin_current = $state('');
	let pin_msg = $state('');

	async function load_auth() {
		try {
			const r = await fetch('/api/auth', { cache: 'no-store' });
			auth = await r.json();
		} catch {}
	}

	async function load() {
		try {
			const r = await fetch('/api/system', { cache: 'no-store' });
			s = await r.json();
			error = s.ok === false ? s.error : '';
		} catch (e) {
			error = String(e);
		} finally {
			loading = false;
		}
		load_auth();
	}

	function pin_flash(m) { pin_msg = m; setTimeout(() => pin_msg = '', 5000); }

	async function pin_enable_or_change() {
		if (!/^[0-9]{4,12}$/.test(pin_new)) { pin_flash('PIN must be 4 to 12 digits'); return; }
		if (pin_new !== pin_confirm) { pin_flash('PINs do not match'); return; }
		pin_busy = true;
		try {
			const action = auth?.has_pin ? 'change' : 'enable';
			const body = action === 'change'
				? { action, pin: pin_new, current_pin: pin_current }
				: { action, pin: pin_new };
			const r = await fetch('/api/auth/configure', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			const d = await r.json();
			if (d.ok) {
				pin_flash(action === 'change' ? 'PIN updated' : 'PIN auth enabled');
				pin_new = pin_confirm = pin_current = '';
				await load_auth();
			} else {
				pin_flash(`failed: ${d.error}`);
			}
		} finally { pin_busy = false; }
	}

	async function pin_disable() {
		if (!confirm('Disable PIN login? Anyone on the network will be able to access the hub.')) return;
		pin_busy = true;
		try {
			const r = await fetch('/api/auth/configure', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'disable', current_pin: pin_current }),
			});
			const d = await r.json();
			if (d.ok) {
				pin_flash('PIN auth disabled');
				pin_current = '';
				await load_auth();
			} else {
				pin_flash(`failed: ${d.error}`);
			}
		} finally { pin_busy = false; }
	}

	async function logout() {
		await fetch('/api/auth', { method: 'DELETE' });
		goto('/login');
	}

	$effect(() => {
		load();
		const t = setInterval(load, 15_000);
		return () => clearInterval(t);
	});

	function flash(m) { toast = m; setTimeout(() => toast = '', 6000); }

	async function check_now() {
		await load();
		flash(s?.update_available ? `update available: ${s.behind} commit${s.behind === 1 ? '' : 's'} behind` : 'up to date');
	}

	async function apply_update() {
		if (!s?.update_available) return;
		const ok = confirm(`Update from ${s.current_short} to ${s.remote_short}?\n\n"${s.remote_subject}"\n\nThe hub will pull, install, build, and restart. The page will be unavailable for a few seconds.`);
		if (!ok) return;
		updating = true;
		last_log = [];
		try {
			const r = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'update' }),
			});
			const d = await r.json();
			last_log = d.log || [];
			if (d.ok) {
				flash(`update applied. restart: ${d.restart}. reloading in 5s.`);
				setTimeout(() => location.reload(), 5000);
			} else {
				flash(`update failed: ${d.error}`);
			}
		} catch (e) {
			flash(`update error: ${e}`);
		} finally {
			updating = false;
		}
	}

	function fmt_date(iso) {
		if (!iso) return 'unknown';
		try { return new Date(iso).toLocaleString(); } catch { return iso; }
	}
	function fmt_uptime(secs) {
		if (!secs) return '0s';
		const d = Math.floor(secs / 86400);
		const h = Math.floor((secs % 86400) / 3600);
		const m = Math.floor((secs % 3600) / 60);
		if (d > 0) return `${d}d ${h}h`;
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	}
</script>

<section class="hero">
	<p class="kicker italic">behind the wheel</p>
	<h1 class="serif">settings</h1>
	<p class="hero-sub">
		hub version, paths, and one-click update. no auth here, no telemetry, nothing fancy.
	</p>
</section>

{#if loading}
	<p class="muted">loading...</p>
{:else if error && !s?.repo_dir}
	<p class="err">error: {error}</p>
{:else if s}

	<!-- Updates panel -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">updates</h2>
			<p>pulls from <code>{s.remote_url || 'origin'}</code> on branch <code>{s.branch}</code>.</p>
		</header>

		{#if s.error}
			<p class="err">{s.error}</p>
		{:else}
			<div class="version-row">
				<div class="version-block">
					<span class="block-label">running</span>
					<span class="sha mono">{s.current_short || '?'}</span>
					<span class="subject">{s.current_subject || '(no commit info)'}</span>
					<span class="when mono muted">{fmt_date(s.current_date)}</span>
				</div>
				<div class="arrow mono">{s.update_available ? '->' : '=='}</div>
				<div class="version-block" class:ahead={s.update_available}>
					<span class="block-label">{s.update_available ? 'available' : 'remote'}</span>
					<span class="sha mono">{s.remote_short || '?'}</span>
					<span class="subject">{s.remote_subject || '(in sync)'}</span>
					<span class="when mono muted">{fmt_date(s.remote_date)}</span>
				</div>
			</div>

			{#if s.dirty}
				<div class="warn">
					<strong>working tree is dirty.</strong>
					<p>local changes are present in <code>{s.repo_dir}</code>. commit or stash them before updating, otherwise <code>git pull --ff-only</code> will refuse.</p>
				</div>
			{/if}

			{#if toast}<p class="toast">{toast}</p>{/if}

			<div class="action-row">
				<button class="btn btn-ghost" onclick={check_now} disabled={updating}>Check for updates</button>
				<button class="btn btn-primary"
					onclick={apply_update}
					disabled={updating || !s.update_available || s.dirty}>
					{updating ? 'updating...' : (s.update_available ? `Apply update (${s.behind} behind)` : 'Up to date')}
				</button>
			</div>

			{#if last_log.length}
				<details class="log-block" open>
					<summary>last update log</summary>
					{#each last_log as step}
						<div class="log-step" class:fail={!step.ok}>
							<span class="log-name mono">{step.ok ? '+' : 'x'} {step.step}</span>
							<pre class="log-out mono">{step.output || '(no output)'}</pre>
						</div>
					{/each}
				</details>
			{/if}
		{/if}
	</article>

	<!-- PIN auth -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">PIN login</h2>
			<p>
				lock the hub behind a 4 to 12 digit PIN. off by default.
				stored hashed (scrypt) at <code>{s.repo_dir ? `$KRAKEN_FLEET_ROOT/auth.json` : 'auth.json'}</code>.
				rate limited: 5 wrong PINs in 15 minutes triggers a 15 minute lockout per IP.
			</p>
		</header>

		<div class="auth-state">
			<span class="badge" class:on={auth?.enabled}>{auth?.enabled ? 'enabled' : 'disabled'}</span>
			{#if auth?.enabled && auth?.authed}
				<span class="badge on">signed in</span>
				<button class="btn btn-ghost auth-logout" onclick={logout}>Sign out</button>
			{/if}
		</div>

		{#if pin_msg}<p class="toast">{pin_msg}</p>{/if}

		<div class="auth-grid">
			<label>
				<span>{auth?.has_pin ? 'new PIN' : 'PIN'}</span>
				<input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password"
					bind:value={pin_new} placeholder="4 to 12 digits" disabled={pin_busy} />
			</label>
			<label>
				<span>confirm</span>
				<input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password"
					bind:value={pin_confirm} placeholder="repeat the PIN" disabled={pin_busy} />
			</label>
			{#if auth?.has_pin}
				<label>
					<span>current PIN</span>
					<input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password"
						bind:value={pin_current} placeholder="required to change/disable" disabled={pin_busy} />
				</label>
			{/if}
		</div>

		<div class="action-row">
			<button class="btn btn-primary"
				disabled={pin_busy || !pin_new || !pin_confirm}
				onclick={pin_enable_or_change}>
				{pin_busy ? 'saving...' : (auth?.has_pin ? 'Change PIN' : 'Enable PIN login')}
			</button>
			{#if auth?.has_pin}
				<button class="btn btn-danger" disabled={pin_busy} onclick={pin_disable}>
					Disable PIN login
				</button>
			{/if}
		</div>
	</article>

	<!-- System info -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">system</h2>
			<p>where the hub is running and what it sees on disk.</p>
		</header>
		<dl class="kv">
			<div><dt>version</dt><dd class="mono">{s.version || '0.0.0'}</dd></div>
			<div><dt>pid</dt><dd class="mono">{s.pid}</dd></div>
			<div><dt>node</dt><dd class="mono">{s.node_version}</dd></div>
			<div><dt>uptime</dt><dd class="mono">{fmt_uptime(s.uptime_seconds)}</dd></div>
			<div><dt>repo</dt><dd class="mono path">{s.repo_dir}</dd></div>
			<div><dt>hub</dt><dd class="mono path">{s.hub_dir}</dd></div>
			<div><dt>branch</dt><dd class="mono">{s.branch}</dd></div>
			<div><dt>systemd unit</dt><dd class="mono">{s.systemd_unit || '(none)'}</dd></div>
		</dl>
	</article>

	<!-- Restart strategy -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">restart strategy</h2>
			<p>what happens when you click "apply update".</p>
		</header>
		{#if s.systemd_unit}
			<p>running under systemd unit <code>{s.systemd_unit}</code>. after build, the hub exits cleanly and systemd's <code>Restart=always</code> brings it back with the new binary.</p>
		{:else}
			<p>no systemd unit set (<code>KRAKEN_SYSTEMD_UNIT</code> env var is empty). the hub will spawn a detached <code>update.sh restart</code>, which kills our pid and re-execs <code>bun run start</code> from <code>{s.hub_dir}</code>.</p>
			<p class="muted small">
				for the cleanest experience, wrap the hub in a systemd unit. example:
			</p>
			<pre class="snippet mono">[Unit]
Description=Kraken Hub
After=network.target docker.service

[Service]
Type=simple
User={'{user}'}
WorkingDirectory={s.hub_dir}
Environment=KRAKEN_FLEET_ROOT=/srv/kraken-fleet
Environment=KRAKEN_TEMPLATE={s.repo_dir}
Environment=KRAKEN_SYSTEMD_UNIT=kraken-hub
Environment=PORT=8783
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/bun run start
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target</pre>
		{/if}
	</article>
{/if}

<style>
	.hero { margin-bottom: 32px; max-width: 720px; }
	.hero h1 { font-size: 44px; font-weight: 600; margin: 4px 0 12px; }
	.hero-sub { font-size: 15px; color: var(--color-ink-2); line-height: 1.6; }

	.card { margin-bottom: 24px; }
	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
	.card-head p { color: var(--color-ink-3); margin: 0; font-size: 13px; }
	.card-head code, code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 2px; color: var(--color-ink-2); }

	.version-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 18px;
		align-items: stretch;
		margin-bottom: 18px;
	}
	@media (max-width: 720px) { .version-row { grid-template-columns: 1fr; } .arrow { display: none; } }
	.version-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
		border: 1px solid var(--color-border);
		border-radius: 2px;
		background: var(--color-surface-2);
	}
	.version-block.ahead { border-color: var(--color-accent); background: var(--color-accent-soft); }
	.block-label {
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--color-accent);
		margin-bottom: 4px;
	}
	.sha { font-size: 16px; font-weight: 600; color: var(--color-ink); }
	.subject { font-size: 13px; color: var(--color-ink-2); line-height: 1.4; }
	.when { font-size: 11px; }
	.arrow { display: flex; align-items: center; font-size: 18px; color: var(--color-ink-3); }
	.muted { color: var(--color-ink-3); }
	.small { font-size: 12px; }

	.warn {
		padding: 14px 16px;
		margin-bottom: 18px;
		border: 1px solid var(--color-rust);
		background: rgba(192, 112, 74, 0.08);
		border-radius: 2px;
		font-size: 13px;
	}
	.warn strong { color: var(--color-rust); }
	.warn p { margin: 4px 0 0; color: var(--color-ink-2); }

	.toast {
		background: var(--color-accent-soft);
		border: 1px solid var(--color-accent);
		color: var(--color-accent-bright);
		padding: 10px 14px;
		border-radius: 2px;
		font-size: 13px;
		margin-bottom: 16px;
	}

	.action-row { display: flex; gap: 10px; align-items: center; }

	.log-block { margin-top: 18px; border: 1px solid var(--color-border); border-radius: 2px; }
	.log-block summary { cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 12px; color: var(--color-ink-2); }
	.log-step { padding: 8px 14px; border-top: 1px solid var(--color-border); }
	.log-step.fail .log-name { color: var(--color-crimson); }
	.log-name { font-size: 11px; color: var(--color-sage); display: block; margin-bottom: 4px; letter-spacing: 0.04em; }
	.log-out { background: var(--color-surface-2); padding: 8px 10px; border-radius: 2px; font-size: 11px; line-height: 1.5; max-height: 200px; overflow: auto; margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--color-ink-3); }

	.kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 18px; margin: 0; }
	.kv div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); }
	dt { font-size: 11px; color: var(--color-ink-4); letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
	dd { color: var(--color-ink-2); margin: 0; font-size: 12px; }
	.path { word-break: break-all; text-align: right; }

	.snippet {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: 2px;
		padding: 12px 14px;
		margin: 8px 0 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-ink-2);
		overflow: auto;
	}

	.err { color: var(--color-crimson); }
</style>
