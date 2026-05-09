<script>
	let { id } = $props();

	/** @type {any} */
	let state = $state(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state('');
	let toast = $state('');

	/** @type {any} */
	let world = $state(null);     // the active draft, mutable
	/** @type {string} */
	let active_world_id = $state('');

	async function load() {
		try {
			const r = await fetch(`/api/fleet/${id}/voyage`);
			if (!r.ok) {
				const d = await r.json().catch(() => ({}));
				error = d.error || `status ${r.status}`;
				return;
			}
			error = '';
			state = await r.json();

			// Pick the first world if we don't have one selected, or refresh draft
			// only if the user hasn't started editing.
			if (state.worlds?.length) {
				const pick = active_world_id
					? state.worlds.find(w => w.island_id === active_world_id)
					: state.worlds[0];
				if (pick) {
					active_world_id = pick.island_id;
					if (!world || world.island_id !== pick.island_id) {
						world = JSON.parse(JSON.stringify(pick));
					}
				}
			}
		} finally {
			loading = false;
		}
	}

	$effect(() => { load(); });

	function flash(m) { toast = m; setTimeout(() => toast = '', 5000); }

	function pick_world(w) {
		active_world_id = w.island_id;
		world = JSON.parse(JSON.stringify(w));
	}

	function apply_preset_local(name) {
		const p = state?.presets?.[name];
		if (!p || !world) return;
		world.preset = name;
		world.combat = p.combat;
		world.floats = { ...p.floats };
		world.bools = { ...p.bools };
		flash(`${name.toLowerCase()} preset loaded - review then save`);
	}

	async function save() {
		if (!world) return;
		busy = 'save';
		try {
			const r = await fetch(`/api/fleet/${id}/voyage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					island_id: world.island_id,
					preset: world.preset,
					combat: world.combat,
					floats: world.floats,
					bools:  world.bools,
				}),
			});
			const d = await r.json();
			if (d.ok) {
				flash('voyage settings saved');
				await load();
			} else {
				flash(`save failed: ${d.error}`);
			}
		} finally { busy = ''; }
	}

	function fmt_float(v) {
		const n = Number(v);
		return Number.isFinite(n) ? n.toFixed(2) : '-';
	}
</script>

<article class="card">
	<header class="card-head">
		<h2 class="serif">voyage</h2>
		<p>
			per-world gameplay - combat preset, mob/ship multipliers, coop scaling, easy explore.
			edits land in <code>WorldDescription.json</code>; the game must be stopped to save.
		</p>
	</header>

	{#if loading}
		<p class="muted">scanning save profiles…</p>
	{:else if error}
		<p class="err">error: {error}</p>
	{:else if !state?.worlds?.length}
		<div class="warn">
			<strong>No worlds laid down yet.</strong>
			<p>start the ship at least once so it generates a save profile, then come back here to tune voyage settings.</p>
		</div>
	{:else}
		{#if state.ship_active}
			<div class="warn">
				<strong>▲ ship is running</strong>
				<p>the game holds <code>WorldDescription.json</code> open and rewrites it on world flush, so your edits will be clobbered. stop the ship before saving.</p>
			</div>
		{/if}

		{#if state.worlds.length > 1}
			<div class="world-picker">
				<span class="label">world</span>
				{#each state.worlds as w}
					<button class="pill"
						class:active={w.island_id === active_world_id}
						onclick={() => pick_world(w)}>
						{w.world_name || w.island_id.slice(0, 8)} <span class="mono muted">· {w.preset}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if world}
			<div class="head-row">
				<div>
					<h3 class="serif">{world.world_name || 'unnamed'}</h3>
					<p class="muted mono">{world.island_id}</p>
				</div>
				<span class="preset-tag mono">{world.preset}</span>
			</div>

			<!-- Preset selector -->
			<section class="block">
				<header class="block-head">
					<h4>difficulty preset</h4>
					<p>load Windrose's built-in defaults; tweak from there.</p>
				</header>
				<div class="preset-row">
					{#each ['Easy', 'Medium', 'Hard'] as p}
						<button class="preset"
							class:active={world.preset === p}
							onclick={() => apply_preset_local(p)}>
							<span class="p-name serif">{p.toLowerCase()}</span>
							<span class="p-desc">
								{p === 'Easy'   ? 'forgiving - strong ship, weak mobs' :
								 p === 'Medium' ? 'baseline - every multiplier 1.0×'   :
								                  'hostile - buffed mobs, fragile ship'}
							</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- Combat preset -->
			<section class="block">
				<header class="block-head"><h4>combat difficulty</h4></header>
				<div class="combat-row">
					{#each ['Easy', 'Normal', 'Hard'] as c}
						<button class="combat"
							class:active={world.combat === c}
							onclick={() => { world.combat = c; world.preset = 'Custom'; }}>
							{c.toLowerCase()}
						</button>
					{/each}
				</div>
			</section>

			<!-- Multipliers -->
			<section class="block">
				<header class="block-head">
					<h4>multipliers</h4>
					<p>1.00× is vanilla. drag any slider and the preset flips to <em>custom</em>.</p>
				</header>
				<div class="sliders">
					{#each state.float_knobs as k}
						<label class="slider">
							<span class="s-label">
								<span>{k.label}</span>
								<span class="mono s-val">{fmt_float(world.floats[k.tag])}×</span>
							</span>
							<input type="range" min={k.min} max={k.max} step={k.step}
								bind:value={world.floats[k.tag]}
								onchange={() => world.preset = 'Custom'} />
							<span class="s-range mono">{k.min} - {k.max}</span>
						</label>
					{/each}
				</div>
			</section>

			<!-- Toggles -->
			<section class="block">
				<header class="block-head"><h4>flags</h4></header>
				<div class="bools">
					{#each state.bool_knobs as k}
						<label class="bool">
							<input type="checkbox" bind:checked={world.bools[k.tag]}
								onchange={() => world.preset = 'Custom'} />
							<span>{k.label}</span>
							<span class="muted mono">{k.tag.split('.').pop()}</span>
						</label>
					{/each}
				</div>
			</section>

			{#if toast}<p class="toast">{toast}</p>{/if}

			<footer class="form-foot">
				<span class="hint mono">
					{state.ship_active ? '▲ ship running - stop first' : '○ ready to save'}
				</span>
				<button class="btn btn-primary" disabled={busy === 'save' || state.ship_active} onclick={save}>
					{busy === 'save' ? 'saving…' : 'Save voyage'}
				</button>
			</footer>
		{/if}
	{/if}
</article>

<style>
	.card-head { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.card-head h2 { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
	.card-head p { color: var(--color-ink-3); margin: 0; font-size: 13px; }
	.card-head code { font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-2); padding: 1px 5px; border-radius: 2px; color: var(--color-ink-2); }

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
	.warn code { font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.2); padding: 1px 5px; border-radius: 2px; }

	.toast {
		background: var(--color-accent-soft);
		border: 1px solid var(--color-accent);
		color: var(--color-accent-bright);
		padding: 10px 14px;
		border-radius: 2px;
		font-size: 13px;
		margin: 18px 0 0;
	}
	.err { color: var(--color-crimson); }
	.muted { color: var(--color-ink-3); }

	.world-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); }
	.world-picker .label { color: var(--color-accent); margin-right: 4px; }
	.pill {
		font: 600 11px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		padding: 6px 12px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-ink-3);
		border-radius: 2px;
	}
	.pill:hover { color: var(--color-ink); border-color: var(--color-accent); }
	.pill.active { color: var(--color-ink); border-color: var(--color-accent); background: var(--color-accent-soft); }

	.head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
	.head-row h3 { font: 500 24px/1.2 var(--font-display); margin: 0; }
	.head-row p { font-size: 11px; margin: 4px 0 0; }
	.preset-tag {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-accent-bright);
		border: 1px solid var(--color-accent);
		padding: 4px 10px;
		border-radius: 2px;
	}

	.block { margin-bottom: 22px; }
	.block-head { margin-bottom: 12px; }
	.block-head h4 { font: 600 11px/1 var(--font-body); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-accent); margin: 0 0 4px; }
	.block-head p { font-size: 12px; margin: 0; color: var(--color-ink-3); }
	.block-head em { color: var(--color-accent-bright); font-style: italic; }

	.preset-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
	.preset {
		display: flex; flex-direction: column; gap: 4px;
		padding: 14px 16px;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		text-align: left;
		border-radius: 2px;
		transition: all 0.12s;
	}
	.preset:hover { border-color: var(--color-accent); background: var(--color-accent-soft); }
	.preset.active { border-color: var(--color-accent); background: var(--color-accent-soft); }
	.preset .p-name { font-size: 18px; color: var(--color-ink); }
	.preset .p-desc { font-size: 12px; color: var(--color-ink-3); }

	.combat-row { display: flex; gap: 8px; }
	.combat {
		flex: 1;
		padding: 10px 14px;
		font: 600 11px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.16em;
		border: 1px solid var(--color-border-strong);
		background: transparent;
		color: var(--color-ink-3);
		border-radius: 2px;
		transition: all 0.12s;
	}
	.combat:hover { color: var(--color-ink); border-color: var(--color-accent); }
	.combat.active { color: var(--color-ink); border-color: var(--color-accent); background: var(--color-accent-soft); }

	.sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px 22px; }
	.slider { display: flex; flex-direction: column; gap: 4px; }
	.s-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--color-ink-2); }
	.s-label > span:first-child { letter-spacing: 0.04em; }
	.s-val { color: var(--color-accent-bright); font-weight: 600; }
	.s-range { font-size: 10px; color: var(--color-ink-4); }
	.slider input[type="range"] { width: 100%; padding: 0; background: transparent; border: 0; height: 18px; accent-color: var(--color-accent); }

	.bools { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 18px; }
	.bool { display: flex; flex-direction: row; align-items: center; gap: 10px; }
	.bool input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--color-accent); }
	.bool > span:nth-child(2) { color: var(--color-ink-2); font-size: 13px; }
	.bool > span:nth-child(3) { font-size: 10px; }

	.form-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 18px; margin-top: 22px; border-top: 1px solid var(--color-border); }
	.hint { font-size: 11px; color: var(--color-ink-3); letter-spacing: 0.06em; }
</style>
