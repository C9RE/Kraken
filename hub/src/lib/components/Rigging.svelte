<script>
	let { id } = $props();

	/** @type {any} */
	let state = $state(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state('');
	let toast = $state('');

	let drag_over = $state(false);
	/** @type {HTMLInputElement | null} */
	let file_input = $state(null);

	let upload_name = $state('');
	let upload_enable = $state(true);
	let upload_kind = $state('auto'); // auto | ue4ss | logic-pak | asset-pak

	async function load() {
		try {
			const r = await fetch(`/api/fleet/${id}/mods`);
			if (!r.ok) {
				const d = await r.json().catch(() => ({}));
				error = d.error || `status ${r.status}`;
				return;
			}
			error = '';
			state = await r.json();
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
		const t = setInterval(load, 8000);
		return () => clearInterval(t);
	});

	function flash(m) { toast = m; setTimeout(() => toast = '', 5500); }

	/** @param {string} name @param {string} kind @param {boolean} on */
	async function toggle(name, kind, on) {
		busy = `t-${name}`;
		try {
			const r = await fetch(`/api/fleet/${id}/mods/${encodeURIComponent(name)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: on ? 'enable' : 'disable', kind }),
			});
			const d = await r.json();
			flash(d.ok ? `${name} → ${on ? 'enabled' : 'disabled'}` : `failed: ${d.error}`);
			await load();
		} finally { busy = ''; }
	}

	/** @param {string} name @param {string} kind @param {boolean} builtin */
	async function del(name, kind, builtin) {
		const what = kind === 'ue4ss' ? 'mod' : (kind === 'logic-pak' ? 'logic pak' : 'asset pak');
		const msg = builtin
			? `Delete UE4SS built-in mod "${name}"?\n\nThis ships with UE4SS itself. Removing it can break the loader (especially BPModLoaderMod and Keybinds). Continue?`
			: `Delete ${what} "${name}"?\n\nThis cannot be undone.`;
		if (!confirm(msg)) return;
		busy = `d-${name}`;
		try {
			const r = await fetch(`/api/fleet/${id}/mods/${encodeURIComponent(name)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete', kind }),
			});
			const d = await r.json();
			flash(d.ok ? `${name} removed` : `failed: ${d.error}`);
			await load();
		} finally { busy = ''; }
	}

	/** @param {File} file */
	async function upload(file) {
		busy = 'upload';
		try {
			const fd = new FormData();
			fd.append('file', file);
			if (upload_name) fd.append('name', upload_name);
			fd.append('enable', upload_enable ? 'true' : 'false');
			if (upload_kind !== 'auto') fd.append('kind', upload_kind);
			const r = await fetch(`/api/fleet/${id}/mods`, { method: 'POST', body: fd });
			const d = await r.json();
			if (d.ok) {
				flash(`installed: ${d.name} (${d.kind}) - ${d.action}`);
				upload_name = '';
				if (file_input) file_input.value = '';
				await load();
			} else {
				flash(`upload failed: ${d.error}`);
			}
		} finally { busy = ''; }
	}

	function on_drop(e) {
		e.preventDefault();
		drag_over = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) upload(file);
	}
	function on_drag_over(e) { e.preventDefault(); drag_over = true; }
	function on_drag_leave() { drag_over = false; }
	function on_pick(e) {
		const file = e.target.files?.[0];
		if (file) upload(file);
	}

	function fmt_size(bytes) {
		if (!bytes) return '0';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
		if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
	}
	function kind_label(k) {
		return k === 'ue4ss' ? 'UE4SS' : (k === 'logic-pak' ? 'logic pak' : (k === 'asset-pak' ? 'asset pak' : k));
	}
</script>

<article class="card">
	<header class="card-head">
		<h2 class="serif">rigging</h2>
		<p>
			drop a <code>.zip</code>, <code>.lua</code>, <code>.dll</code>, or <code>.pak</code> bundle.
			UE4SS Lua / DLL mods land in <code>ue4ss/Mods/</code>; pak files in <code>Content/Paks/~mods/</code> or <code>LogicMods/</code>.
		</p>
	</header>

	{#if state}
		<div class="badges">
			<span class="badge" class:on={state.ue4ss_present}>{state.ue4ss_present ? '✓ UE4SS detected' : '✗ UE4SS not yet installed'}</span>
			{#if state.windrose_plus}
				<span class="badge wp">⚓ WindrosePlus detected</span>
			{/if}
			{#if state.ship_active}
				<span class="badge warn">▲ ship is running - UE4SS may overwrite changes on next boot; restart after edits</span>
			{/if}
		</div>
	{/if}

	{#if !loading && !state?.ue4ss_present}
		<div class="warn">
			<strong>UE4SS hasn't been provisioned yet.</strong>
			<p>Start the ship once so SteamCMD lays down the base game files (it will also bundle UE4SS), then come back here to install mods. Or upload a UE4SS release zip directly - it will create the directory.</p>
		</div>
	{/if}

	{#if toast}<p class="toast">{toast}</p>{/if}
	{#if error}<p class="err">error: {error}</p>{/if}

	<!-- Upload zone -->
	<div
		class="drop-zone"
		class:drag={drag_over}
		ondragover={on_drag_over}
		ondragleave={on_drag_leave}
		ondrop={on_drop}
		role="region"
		aria-label="Upload mod package"
	>
		<input
			bind:this={file_input}
			type="file"
			accept=".zip,.lua,.dll,.pak,.ucas,.utoc"
			onchange={on_pick}
			disabled={busy === 'upload'}
			class="hidden-file-input"
		/>

		<div class="drop-icon-wrap" class:busy={busy === 'upload'}>
			{#if busy === 'upload'}
				<span class="spinner" aria-hidden="true"></span>
			{:else}
				<svg class="drop-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17 8 12 3 7 8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
			{/if}
		</div>

		<div class="drop-content">
			<p class="drop-title">{busy === 'upload' ? 'Rigging Mod Package…' : 'Drop Mod Archive or Files Here'}</p>
			<div class="format-pills mono">
				<span class="format-pill"><strong>.zip</strong> bundle</span>
				<span class="format-sep">·</span>
				<span class="format-pill"><strong>.lua / .dll</strong> → UE4SS</span>
				<span class="format-sep">·</span>
				<span class="format-pill"><strong>.pak / .ucas</strong> → Paks</span>
			</div>
		</div>

		<button
			type="button"
			class="btn btn-primary btn-browse"
			onclick={() => file_input?.click()}
			disabled={busy === 'upload'}
		>
			<span>Browse Files</span>
		</button>
	</div>

	<!-- Upload configuration options well -->
	<div class="upload-options">
		<label class="opt-col">
			<span class="opt-label">Mod Name Override</span>
			<input
				class="opt-input"
				bind:value={upload_name}
				placeholder="Auto-detected from file"
				disabled={busy === 'upload'}
			/>
		</label>
		<label class="opt-col">
			<span class="opt-label">Install Target</span>
			<select class="opt-select" bind:value={upload_kind} disabled={busy === 'upload'}>
				<option value="auto">Auto-Detect Folder</option>
				<option value="ue4ss">UE4SS (ue4ss/Mods/)</option>
				<option value="logic-pak">Logic Mod (Paks/LogicMods/)</option>
				<option value="asset-pak">Asset Mod (Paks/~mods/)</option>
			</select>
		</label>
		<div class="opt-col opt-col-check">
			<span class="opt-label">Initial State</span>
			<label class="opt-toggle-box">
				<input
					type="checkbox"
					bind:checked={upload_enable}
					disabled={busy === 'upload'}
				/>
				<span class="opt-toggle-text">{upload_enable ? 'Enable on Install' : 'Keep Disabled'}</span>
			</label>
		</div>
	</div>

	{#if loading}
		<p class="muted">scanning…</p>
	{:else if state?.mods?.length}
		<table class="mods">
			<thead>
				<tr><th>mod</th><th>kind</th><th>type</th><th>size</th><th>state</th><th></th></tr>
			</thead>
			<tbody>
				{#each state.mods as m (`${m.kind}-${m.name}`)}
					<tr>
						<td>
							<span class="m-name">{m.name}</span>
							{#if m.builtin}<span class="b builtin">built-in</span>{/if}
						</td>
						<td class="mono muted">{kind_label(m.kind)}</td>
						<td class="mono muted">
							{#if m.kind === 'ue4ss'}
								{[m.has_lua && 'lua', m.has_dll && 'dll'].filter(Boolean).join(' + ') || 'asset-only'}
							{:else}
								pak{#if m.file && m.file !== `${m.name}.pak`} · {m.file}{/if}
							{/if}
						</td>
						<td class="mono muted">{fmt_size(m.size)}</td>
						<td>
							{#if m.kind === 'ue4ss'}
								<button
									class="toggle"
									class:on={m.enabled}
									onclick={() => toggle(m.name, m.kind, !m.enabled)}
									disabled={busy === `t-${m.name}`}
									title={m.enabled ? 'click to disable' : 'click to enable'}
								>
									<span class="t-dot"></span>
									{busy === `t-${m.name}` ? '…' : (m.enabled ? 'enabled' : 'disabled')}
								</button>
							{:else}
								<span class="toggle on" title="pak files always load - remove to disable">
									<span class="t-dot"></span>
									always loaded
								</span>
							{/if}
						</td>
						<td>
							<button class="btn-mini btn-danger" onclick={() => del(m.name, m.kind, m.builtin)} disabled={busy === `d-${m.name}`}>
								{busy === `d-${m.name}` ? '…' : 'remove'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="muted small">
			UE4SS path: <code>{state.ue4ss_dir}</code><br />
			Paks paths: <code>{state.logic_dir}</code> · <code>{state.asset_dir}</code><br />
			restart the ship for changes to take effect - UE4SS reads <code>mods.json</code> at process start.
		</p>
	{:else if state}
		<p class="muted">no mods installed.</p>
	{/if}
</article>

<style>
	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #ffffff; }
	.card-head p { color: var(--color-ink-2); margin: 0; font-size: 13px; }
	.card-head code, .small code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 4px; color: var(--color-accent-bright); }

	.badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
	.badge {
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-3);
		border: 1px solid var(--color-border-strong);
		padding: 5px 9px;
		border-radius: 4px;
		background: rgba(255,255,255,0.03);
	}
	.badge.on { color: var(--color-sage); border-color: rgba(104, 186, 140, 0.4); background: rgba(104, 186, 140, 0.1); }
	.badge.wp { color: var(--color-accent-bright); border-color: var(--color-accent); background: var(--color-accent-soft); }
	.badge.warn { color: var(--color-rust); border-color: var(--color-rust); background: rgba(192, 112, 74, 0.1); }

	.warn {
		padding: 14px 16px;
		margin-bottom: 18px;
		border: 1px solid var(--color-rust);
		background: rgba(192, 112, 74, 0.12);
		border-radius: 6px;
		font-size: 13px;
	}
	.warn strong { color: var(--color-rust); }
	.warn p { margin: 4px 0 0; color: var(--color-ink-2); }

	.toast {
		background: rgba(204, 185, 157, 0.15);
		border: 1px solid var(--color-accent-bright);
		color: #ffffff;
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 13px;
		margin: 0 0 16px;
	}
	.err { color: var(--color-crimson); margin: 0 0 16px; font-size: 13px; }

	/* ─── Upload zone ─────────────────────────────────────────── */
	.drop-zone {
		border: 1.5px dashed var(--color-border-strong);
		border-radius: 8px;
		padding: 24px 20px;
		text-align: center;
		background: rgba(10, 13, 17, 0.55);
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: center;
		margin-bottom: 14px;
		transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
		position: relative;
	}
	.drop-zone.drag {
		border-color: var(--color-accent-bright);
		background: var(--color-accent-soft);
		box-shadow: 0 0 20px rgba(204, 185, 157, 0.2);
	}
	.hidden-file-input { display: none; }

	.drop-icon-wrap {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(204, 185, 157, 0.1);
		border: 1px solid var(--color-border-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-accent-bright);
	}
	.drop-icon-wrap.busy { border-color: var(--color-accent); }
	.drop-icon { opacity: 0.9; }

	.drop-content { display: flex; flex-direction: column; gap: 6px; align-items: center; }
	.drop-title {
		font: 600 17px/1.2 var(--font-display);
		color: #ffffff;
		margin: 0;
		letter-spacing: 0.02em;
	}

	.format-pills {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--color-ink-3);
		flex-wrap: wrap;
		justify-content: center;
	}
	.format-pill {
		background: rgba(255, 255, 255, 0.04);
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid var(--color-border);
	}
	.format-pill strong { color: var(--color-accent-bright); }
	.format-sep { opacity: 0.3; }

	.btn-browse {
		height: 36px;
		padding: 0 20px;
	}

	/* ─── Upload options well ─────────────────────────────────── */
	.upload-options {
		display: grid;
		grid-template-columns: 1.2fr 1fr auto;
		gap: 14px;
		align-items: flex-end;
		padding: 14px 16px;
		background: rgba(14, 18, 23, 0.6);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		margin-bottom: 22px;
	}
	@media (max-width: 720px) {
		.upload-options { grid-template-columns: 1fr; }
	}

	.opt-col { display: flex; flex-direction: column; gap: 5px; }
	.opt-col-check { justify-content: flex-end; }
	.opt-label {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.opt-input, .opt-select {
		height: 36px;
		font-size: 12.5px;
		padding: 0 10px;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
	}
	.opt-toggle-box {
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		cursor: pointer;
		user-select: none;
	}
	.opt-toggle-box input[type="checkbox"] {
		width: 15px;
		height: 15px;
		accent-color: var(--color-accent);
		cursor: pointer;
		margin: 0;
	}
	.opt-toggle-text {
		font-size: 12px;
		color: var(--color-ink-2);
		font-weight: 500;
		white-space: nowrap;
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid var(--color-border-strong);
		border-top-color: var(--color-accent-bright);
		animation: spin 0.7s linear infinite;
		display: inline-block;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.mods thead th {
		text-align: left;
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-accent);
		padding: 8px 8px 8px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.mods tbody td {
		padding: 10px 8px 10px 0;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}
	.m-name { color: #ffffff; font-weight: 500; }
	.b.builtin {
		display: inline-block;
		font: 700 9px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-3);
		border: 1px solid var(--color-border-strong);
		padding: 2px 6px;
		border-radius: 4px;
		margin-left: 8px;
		background: rgba(255,255,255,0.03);
	}
	.muted { color: var(--color-ink-3); }
	.small { font-size: 11.5px; margin-top: 14px; line-height: 1.7; color: var(--color-ink-3); }

	.toggle {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 5px 12px;
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-3);
		border: 1px solid var(--color-border-strong);
		background: rgba(255,255,255,0.03);
		border-radius: 4px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s, transform 0.1s;
	}
	.toggle .t-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-ink-4); }
	.toggle.on { color: var(--color-sage); border-color: rgba(104, 186, 140, 0.4); background: rgba(104, 186, 140, 0.1); }
	.toggle.on .t-dot { background: var(--color-sage); box-shadow: 0 0 6px var(--color-sage); }
	.toggle:hover:not(:disabled):not(span) { border-color: var(--color-accent); color: #ffffff; transform: translateY(-1px); }
	.toggle:active:not(:disabled):not(span) { transform: scale(0.96); }

	.btn-mini {
		padding: 5px 12px;
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-2);
		background: transparent;
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s, transform 0.1s;
	}
	.btn-mini:hover:not(:disabled) { border-color: var(--color-accent); color: #ffffff; transform: translateY(-1px); }
	.btn-mini:active:not(:disabled) { transform: scale(0.96); }
	.btn-mini.btn-danger { color: var(--color-crimson); border-color: rgba(194, 89, 83, 0.4); }
	.btn-mini.btn-danger:hover:not(:disabled) { background: rgba(194, 89, 83, 0.18); color: #ffffff; border-color: var(--color-crimson); }
	.btn-mini:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
