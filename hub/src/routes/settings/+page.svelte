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

	const PIN_RE = /^[0-9]{4,12}$/;
	let pin_new_valid = $derived(PIN_RE.test(pin_new));
	let pin_confirm_valid = $derived(PIN_RE.test(pin_confirm));
	let pins_match_and_valid = $derived(
		pin_new_valid && pin_confirm_valid && pin_new === pin_confirm
	);
	let pin_mismatch_hint = $derived(
		pin_new.length > 0 && pin_confirm.length > 0 && pin_new !== pin_confirm
	);

	let display_version = $derived.by(() => {
		const v = s?.version || '0.0.0';
		return v.startsWith('v') ? v : `v${v}`;
	});

	let update_status = $derived.by(() => {
		if (!s) return '';
		if (s.update_available) {
			const n = s.behind ?? 0;
			return `update available · ${n} commit${n === 1 ? '' : 's'} behind`;
		}
		return 'up to date';
	});

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
		if (!pin_new_valid) { pin_flash('PIN must be 4 to 12 digits'); return; }
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
		let prompt = `Apply update?\n\nThe hub will pull, install, build, and restart. The page will be unavailable for a few seconds.`;
		if (s.dirty) {
			const files = (s.dirty_files || []).slice(0, 10).join('\n  ');
			const extra = (s.dirty_files?.length || 0) > 10 ? `\n  ... +${s.dirty_files.length - 10} more` : '';
			prompt = `You have ${s.dirty_files?.length || 0} uncommitted change(s) in the repo:\n\n  ${files}${extra}\n\nApply update? These changes will be DISCARDED.`;
		}
		const ok = confirm(prompt);
		if (!ok) return;
		updating = true;
		last_log = [];
		try {
			const r = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'update', confirm_discard: !!s.dirty }),
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

<section class="settings-header">
	<div class="nav-breadcrumbs">
		<a href="/" class="back-link">← Harbor Fleet</a>
	</div>
	<p class="kicker italic">Command &amp; Diagnostics</p>
	<h1 class="serif">Hub Settings</h1>
	<p class="hero-sub">
		Hub software orchestration, systemd execution environment, git deployment stream, and optional security PIN authentication.
	</p>
</section>

{#if loading}
	<div class="loading-state card">
		<p class="loading mono">Loading system diagnostics…</p>
	</div>
{:else if error && !s?.repo_dir}
	<div class="err-card card">
		<p class="err mono">System error: {error}</p>
	</div>
{:else if s}

	<!-- Updates panel -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">Software Stream</h2>
			<p>Upstream repository: <code>{s.remote_url || 'origin'}</code> on branch <code>{s.branch}</code>.</p>
		</header>

		{#if s.error}
			<p class="err">{s.error}</p>
		{:else}
			<div class="version-summary">
				<span class="version-chip mono" class:behind={s.update_available}>{display_version}</span>
				<span class="status-line" class:warn-text={s.update_available}>{update_status}</span>
			</div>

			{#if toast}<div class="toast mono">{toast}</div>{/if}

			<div class="action-row">
				<button class="btn btn-ghost" onclick={check_now} disabled={updating}>Check for updates</button>
				<button class="btn btn-primary"
					onclick={apply_update}
					disabled={updating || !s.update_available}>
					{updating ? 'updating...' : (s.update_available ? 'Apply update' : 'Up to date')}
				</button>
			</div>

			{#if last_log.length}
				<details class="log-block" open>
					<summary>last update log</summary>
					{#each last_log as step, i (i)}
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
			<h2 class="serif">Security PIN Access</h2>
			<p>
				Lock the hub dashboard behind a 4 to 12 digit PIN. Off by default.
				Stored hashed (scrypt) with brute-force rate limiting (5 failed attempts locks for 15 minutes).
			</p>
		</header>

		<div class="auth-state">
			<div class="auth-state-badges">
				<span class="state-chip" class:on={auth?.enabled}>
					{auth?.enabled ? 'enabled' : 'disabled'}
				</span>
				{#if auth?.enabled && auth?.authed}
					<span class="state-chip on">signed in</span>
				{/if}
			</div>
			{#if auth?.enabled && auth?.authed}
				<button class="btn btn-ghost btn-sm" onclick={logout}>Sign out</button>
			{/if}
		</div>

		{#if pin_msg}<div class="toast mono">{pin_msg}</div>{/if}

		{#if auth?.has_pin}
			<div class="pin-row pin-row-current">
				<label class="pin-field">
					<span class="pin-label">current PIN</span>
					<input
						class="pin-input mono"
						type="password"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="12"
						autocomplete="current-password"
						bind:value={pin_current}
						placeholder="required to change/disable"
						disabled={pin_busy} />
				</label>
			</div>
			<div class="hairline"></div>
		{/if}

		<div class="pin-grid">
			<label class="pin-field">
				<span class="pin-label">{auth?.has_pin ? 'new PIN' : 'PIN'}</span>
				<input
					class="pin-input mono"
					class:valid={pin_new_valid}
					class:invalid={pin_new.length > 0 && !pin_new_valid}
					type="password"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="12"
					autocomplete="new-password"
					bind:value={pin_new}
					placeholder="4 to 12 digits"
					disabled={pin_busy} />
			</label>
			<label class="pin-field">
				<span class="pin-label">confirm</span>
				<input
					class="pin-input mono"
					class:valid={pin_confirm_valid && pin_new === pin_confirm}
					class:invalid={pin_confirm.length > 0 && (!pin_confirm_valid || pin_new !== pin_confirm)}
					type="password"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="12"
					autocomplete="new-password"
					bind:value={pin_confirm}
					placeholder="repeat the PIN"
					disabled={pin_busy} />
			</label>
		</div>

		{#if pin_mismatch_hint}
			<p class="pin-hint">PINs don't match</p>
		{/if}

		<div class="action-row pin-cta">
			<button class="btn btn-primary"
				disabled={pin_busy || !pins_match_and_valid}
				onclick={pin_enable_or_change}>
				{pin_busy ? 'saving...' : (auth?.has_pin ? 'Change PIN' : 'Enable PIN login')}
			</button>
		</div>

		{#if auth?.has_pin}
			<div class="danger-zone">
				<div class="hairline danger"></div>
				<button class="btn btn-danger btn-block btn-sm" disabled={pin_busy} onclick={pin_disable}>
					Disable PIN login
				</button>
			</div>
		{/if}
	</article>

	<!-- System info -->
	<article class="card">
		<header class="card-head">
			<h2 class="serif">Environment &amp; Runtime</h2>
			<p>Host server runtime configuration and active storage filesystem.</p>
		</header>
		<dl class="kv">
			<div><dt>version</dt><dd class="mono">{s.version || '0.0.0'}</dd></div>
			<div><dt>pid</dt><dd class="mono">{s.pid}</dd></div>
			<div><dt>node / bun</dt><dd class="mono">{s.node_version}</dd></div>
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
			<h2 class="serif">Process Daemon Strategy</h2>
			<p>Automated restart behaviour upon receiving software updates.</p>
		</header>
		{#if s.systemd_unit}
			<p>Running under systemd unit <code>{s.systemd_unit}</code>. Upon applying updates, the hub process restarts automatically with updated binaries.</p>
		{:else}
			<p>No systemd unit detected (<code>KRAKEN_SYSTEMD_UNIT</code> is unset). Falling back to detached process re-execution from <code>{s.hub_dir}</code>.</p>
		{/if}
	</article>
{/if}

<style>
	.settings-header {
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

	.settings-header h1 {
		font-size: 38px;
		font-weight: 700;
		margin: 4px 0 10px;
		color: #ffffff;
		letter-spacing: 0.03em;
		text-shadow: 0 2px 14px rgba(0,0,0,0.8);
	}
	.hero-sub { font-size: 14.5px; color: var(--color-ink-2); line-height: 1.6; margin: 0; }

	.card { margin-bottom: 24px; }
	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #ffffff; }
	.card-head p { color: var(--color-ink-2); margin: 0; font-size: 13px; }
	.card-head code, code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 4px; color: var(--color-accent-bright); }

	/* Updates panel — clean version summary */
	.version-summary {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 22px 16px;
		margin-bottom: 18px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: rgba(14, 18, 23, 0.6);
	}
	.version-chip {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--color-accent-bright);
		padding: 4px 16px;
		border: 1px solid var(--color-accent);
		border-radius: 6px;
		background: var(--color-accent-soft);
	}
	.version-chip.behind {
		color: #ffffff;
		border-color: var(--color-accent-bright);
	}
	.status-line {
		font-size: 12px;
		color: var(--color-ink-3);
		letter-spacing: 0.06em;
		text-transform: lowercase;
	}
	.status-line.warn-text {
		color: var(--color-rust);
	}

	.toast {
		background: rgba(204, 185, 157, 0.15);
		border: 1px solid var(--color-accent-bright);
		color: #ffffff;
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 13px;
		margin-bottom: 16px;
	}

	.action-row { display: flex; gap: 10px; align-items: center; }

	.log-block { margin-top: 18px; border: 1px solid var(--color-border); border-radius: 6px; }
	.log-block summary { cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 12px; color: var(--color-ink-2); }
	.log-step { padding: 8px 14px; border-top: 1px solid var(--color-border); }
	.log-step.fail .log-name { color: var(--color-crimson); }
	.log-name { font-size: 11px; color: var(--color-sage); display: block; margin-bottom: 4px; letter-spacing: 0.04em; }
	.log-out { background: rgba(5, 7, 9, 0.85); padding: 8px 10px; border-radius: 4px; font-size: 11px; line-height: 1.5; max-height: 200px; overflow: auto; margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--color-ink-2); }

	/* PIN auth — state header */
	.auth-state {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 12px 14px;
		margin-bottom: 18px;
		background: rgba(14, 18, 23, 0.6);
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}
	.auth-state-badges {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.state-chip {
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.18em;
		padding: 6px 10px;
		border-radius: 4px;
		border: 1px solid var(--color-border);
		color: var(--color-ink-3);
		background: transparent;
	}
	.state-chip.on {
		color: var(--color-bg, #111);
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	.btn-sm {
		font-size: 11px;
		min-height: 32px;
		padding: 0 12px;
	}
	.btn-block {
		display: block;
		width: 100%;
		text-align: center;
	}

	/* PIN inputs */
	.pin-row { display: block; margin-bottom: 14px; }
	.pin-row-current { margin-bottom: 14px; }
	.pin-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		margin-bottom: 8px;
	}
	@media (max-width: 560px) {
		.pin-grid { grid-template-columns: 1fr; }
	}
	.pin-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pin-label {
		font-size: 11px;
		color: var(--color-accent);
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.pin-input {
		height: 44px;
		padding: 0 14px;
		font-family: var(--font-mono);
		font-size: 16px;
		text-align: center;
		letter-spacing: 0.4em;
		color: var(--color-ink);
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
		outline: none;
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}
	.pin-input::placeholder {
		letter-spacing: 0.04em;
		color: var(--color-ink-4);
		font-size: 13px;
	}
	.pin-input:focus {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px rgba(204, 185, 157, 0.2);
	}
	.pin-input.valid {
		border-color: var(--color-sage);
	}
	.pin-input.valid:focus {
		box-shadow: 0 0 0 2px rgba(104, 186, 140, 0.2);
	}
	.pin-input.invalid {
		border-color: var(--color-rust);
	}
	.pin-input.invalid:focus {
		box-shadow: 0 0 0 2px rgba(192, 112, 74, 0.2);
	}
	.pin-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.pin-hint {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-rust);
		letter-spacing: 0.04em;
	}

	.pin-cta { margin-top: 14px; }

	.hairline {
		height: 1px;
		background: var(--color-border);
		margin: 14px 0;
	}
	.hairline.danger {
		background: linear-gradient(to right, transparent, var(--color-border) 20%, var(--color-border) 80%, transparent);
		margin: 22px 0 14px;
	}

	.danger-zone {
		margin-top: 8px;
	}

	/* System info */
	.kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 18px; margin: 0; }
	.kv div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); }
	dt { font-size: 11px; color: var(--color-ink-4); letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
	dd { color: var(--color-ink-2); margin: 0; font-size: 12px; }
	.path { word-break: break-all; text-align: right; }

	.loading-state, .err-card { text-align: center; padding: 56px 28px; max-width: 600px; margin: 40px auto; }
	.loading { color: var(--color-accent-bright); }
	.err { color: var(--color-crimson); }
</style>
