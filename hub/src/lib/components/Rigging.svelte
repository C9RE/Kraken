<script>
	let { id } = $props();

	/** @type {{ ue4ss_present: boolean, mods_dir: string, mods: any[] } | null} */
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

	function flash(m) { toast = m; setTimeout(() => toast = '', 5000); }

	/** @param {string} name @param {boolean} on */
	async function toggle(name, on) {
		busy = `t-${name}`;
		try {
			const r = await fetch(`/api/fleet/${id}/mods/${encodeURIComponent(name)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: on ? 'enable' : 'disable' }),
			});
			const d = await r.json();
			flash(d.ok ? `${name} → ${on ? 'enabled' : 'disabled'}` : `failed: ${d.error}`);
			await load();
		} finally { busy = ''; }
	}

	/** @param {string} name @param {boolean} builtin */
	async function del(name, builtin) {
		const msg = builtin
			? `Delete UE4SS built-in mod "${name}"?\n\nThis is shipped with UE4SS itself. Removing it can break the loader. Continue?`
			: `Delete mod "${name}"?\n\nThe entire mod folder will be removed. This cannot be undone.`;
		if (!confirm(msg)) return;
		busy = `d-${name}`;
		try {
			const r = await fetch(`/api/fleet/${id}/mods/${encodeURIComponent(name)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete' }),
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
			const r = await fetch(`/api/fleet/${id}/mods`, { method: 'POST', body: fd });
			const d = await r.json();
			if (d.ok) {
				flash(`installed: ${d.name} — ${d.action}${d.enabled ? ' · enabled' : ' · disabled'}`);
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
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<article class="card">
	<header class="card-head">
		<h2 class="serif">rigging</h2>
		<p>UE4SS mods installed under the ship's <code>data/R5/Binaries/Win64/ue4ss/Mods/</code>. drop a .zip, .lua, or .dll to install.</p>
	</header>

	{#if !loading && !state?.ue4ss_present}
		<div class="warn">
			<strong>UE4SS is not installed yet.</strong>
			<p>The mods directory <code>{state?.mods_dir}</code> doesn't exist. Start the server once so SteamCMD lays down the base game files, then upload an UE4SS release zip — the hub will create the directory on first install.</p>
		</div>
	{/if}

	{#if toast}<p class="toast">{toast}</p>{/if}
	{#if error}<p class="err">error: {error}</p>{/if}

	<!-- Upload zone -->
	<div
		class="drop"
		class:drag={drag_over}
		ondragover={on_drag_over}
		ondragleave={on_drag_leave}
		ondrop={on_drop}
		role="region"
		aria-label="upload mod"
	>
		<p class="drop-title">{busy === 'upload' ? 'installing…' : 'drop a mod here'}</p>
		<p class="drop-sub">.zip (UE4SS layout) · .lua → Scripts/main.lua · .dll → dlls/main.dll</p>
		<div class="drop-row">
			<input bind:this={file_input} type="file" accept=".zip,.lua,.dll" onchange={on_pick} disabled={busy === 'upload'} />
		</div>
		<div class="drop-row">
			<label class="inline">
				<span>name override</span>
				<input bind:value={upload_name} placeholder="(auto from filename)" disabled={busy === 'upload'} />
			</label>
			<label class="inline">
				<span>enable on install</span>
				<input type="checkbox" bind:checked={upload_enable} disabled={busy === 'upload'} />
			</label>
		</div>
	</div>

	<!-- Mod list -->
	{#if loading}
		<p class="muted">scanning…</p>
	{:else if state?.mods?.length}
		<table class="mods">
			<thead>
				<tr><th>mod</th><th>type</th><th>size</th><th>state</th><th></th></tr>
			</thead>
			<tbody>
				{#each state.mods as m (m.name)}
					<tr>
						<td>
							<span class="m-name">{m.name}</span>
							{#if m.builtin}<span class="badge">built-in</span>{/if}
						</td>
						<td class="mono muted">
							{[m.has_lua && 'lua', m.has_dll && 'dll'].filter(Boolean).join(' + ') || 'asset-only'}
						</td>
						<td class="mono muted">{fmt_size(m.size)}</td>
						<td>
							<button
								class="toggle"
								class:on={m.enabled}
								onclick={() => toggle(m.name, !m.enabled)}
								disabled={busy === `t-${m.name}`}
								title={m.enabled ? 'click to disable' : 'click to enable'}
							>
								<span class="t-dot"></span>
								{busy === `t-${m.name}` ? '…' : (m.enabled ? 'enabled' : 'disabled')}
							</button>
						</td>
						<td>
							<button class="btn-mini btn-danger" onclick={() => del(m.name, m.builtin)} disabled={busy === `d-${m.name}`}>
								{busy === `d-${m.name}` ? '…' : 'remove'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="muted small">
			path on host: <code>{state.mods_dir}</code> · changes take effect when the ship restarts.
		</p>
	{:else if state}
		<p class="muted">no mods installed.</p>
	{/if}
</article>

<style>
	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
	.card-head p { color: var(--color-ink-3); margin: 0; font-size: 13px; }
	.card-head code, .small code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 2px; color: var(--color-ink-2); }

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
		margin: 0 0 16px;
	}
	.err { color: var(--color-crimson); margin: 0 0 16px; font-size: 13px; }

	.drop {
		border: 1px dashed var(--color-border-strong);
		border-radius: 2px;
		padding: 22px 20px;
		text-align: center;
		background: var(--color-surface-2);
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
		margin-bottom: 22px;
		transition: border-color 0.15s, background 0.15s;
	}
	.drop.drag { border-color: var(--color-accent-bright); background: var(--color-accent-soft); }
	.drop-title {
		font: 500 16px/1 var(--font-display);
		font-style: italic;
		color: var(--color-ink-2);
		margin: 0;
	}
	.drop-sub { margin: 0; font-size: 12px; color: var(--color-ink-3); }
	.drop-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; }
	.drop input[type="file"] { padding: 6px 8px; }
	.inline { flex-direction: row; align-items: center; gap: 8px; }
	.inline span { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-ink-3); }

	.mods {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.mods thead th {
		text-align: left;
		font: 700 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-ink-4);
		padding: 8px 8px 8px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.mods tbody td {
		padding: 10px 8px 10px 0;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}
	.m-name { color: var(--color-ink); font-weight: 500; }
	.badge {
		display: inline-block;
		font: 700 9px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-4);
		border: 1px solid var(--color-border-strong);
		padding: 2px 5px;
		border-radius: 2px;
		margin-left: 8px;
	}
	.muted { color: var(--color-ink-3); }
	.small { font-size: 11px; margin-top: 12px; }

	.toggle {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 4px 10px;
		font: 600 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-4);
		border: 1px solid var(--color-border-strong);
		background: transparent;
		border-radius: 2px;
		transition: all 0.12s;
	}
	.toggle .t-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-ink-4); }
	.toggle.on { color: var(--color-sage); border-color: rgba(123, 156, 131, 0.5); }
	.toggle.on .t-dot { background: var(--color-sage); box-shadow: 0 0 5px rgba(123, 156, 131, 0.5); }
	.toggle:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-ink); }

	.btn-mini {
		padding: 4px 10px;
		font: 600 10px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-3);
		background: transparent;
		border: 1px solid var(--color-border-strong);
		border-radius: 2px;
	}
	.btn-mini.btn-danger { color: var(--color-crimson); border-color: rgba(176, 77, 62, 0.4); }
	.btn-mini.btn-danger:hover:not(:disabled) { background: rgba(176, 77, 62, 0.12); color: var(--color-ink); }
	.btn-mini:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
