<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let digits = $state(['', '', '', '', '', '']);
	let busy = $state(false);
	let error = $state('');
	let lockout_remaining = $state(0);
	/** @type {HTMLInputElement[]} */
	let inputs = $state([]);

	let pin = $derived(digits.join(''));
	let next = $derived(page.url?.searchParams.get('next') || '/');

	$effect(() => {
		if (!lockout_remaining) return;
		const t = setInterval(() => {
			lockout_remaining = Math.max(0, lockout_remaining - 1);
			if (lockout_remaining === 0) clearInterval(t);
		}, 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		// Focus first empty box on mount
		const first_empty = digits.findIndex(d => !d);
		const idx = first_empty === -1 ? 5 : first_empty;
		setTimeout(() => inputs[idx]?.focus(), 50);
	});

	function on_input(i, e) {
		const v = e.target.value.replace(/\D/g, '').slice(-1);
		digits[i] = v;
		if (v && i < 5) inputs[i + 1]?.focus();
		if (digits.every(d => d) && !busy && !lockout_remaining) submit();
	}

	function on_keydown(i, e) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) {
			inputs[i - 1]?.focus();
			digits[i - 1] = '';
		} else if (e.key === 'ArrowLeft' && i > 0) {
			inputs[i - 1]?.focus();
		} else if (e.key === 'ArrowRight' && i < 5) {
			inputs[i + 1]?.focus();
		} else if (e.key === 'Enter' && pin.length === 6) {
			submit();
		}
	}

	function on_paste(i, e) {
		const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
		if (!text) return;
		e.preventDefault();
		const slice = text.slice(0, 6 - i).split('');
		for (let j = 0; j < slice.length; j++) {
			digits[i + j] = slice[j];
		}
		const last = Math.min(5, i + slice.length);
		inputs[last]?.focus();
		if (digits.every(d => d)) submit();
	}

	function tap(n) {
		if (busy || lockout_remaining) return;
		const idx = digits.findIndex(d => !d);
		if (idx === -1) return;
		digits[idx] = String(n);
		if (idx < 5) inputs[idx + 1]?.focus();
		if (digits.every(d => d)) submit();
	}

	function backspace() {
		if (busy) return;
		const last = [...digits].map((d, i) => d ? i : -1).filter(i => i >= 0).pop();
		const i = last !== undefined ? last : 0;
		digits[i] = '';
		inputs[i]?.focus();
	}

	function clear_all() {
		digits = ['', '', '', '', '', ''];
		error = '';
		inputs[0]?.focus();
	}

	async function submit() {
		if (busy || lockout_remaining || pin.length < 4) return;
		busy = true;
		error = '';
		try {
			const r = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pin }),
			});
			const d = await r.json();
			if (d.ok) {
				goto(next);
			} else {
				error = d.error || `error ${r.status}`;
				if (d.retry_after_ms) lockout_remaining = Math.ceil(d.retry_after_ms / 1000);
				digits = ['', '', '', '', '', ''];
				inputs[0]?.focus();
			}
		} catch (e) {
			error = String(e);
		} finally {
			busy = false;
		}
	}

	function fmt_lockout(secs) {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
	}
</script>

<svelte:head><title>Kraken . sign in</title></svelte:head>

<main class="login">
	<div class="card">
		<header>
			<p class="kicker italic">access</p>
			<h1 class="serif">enter PIN</h1>
		</header>

		<div class="boxes" class:locked={lockout_remaining > 0}>
			{#each digits as d, i}
				<input
					bind:this={inputs[i]}
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength="1"
					value={d}
					disabled={busy || lockout_remaining > 0}
					oninput={(e) => on_input(i, e)}
					onkeydown={(e) => on_keydown(i, e)}
					onpaste={(e) => on_paste(i, e)}
				/>
			{/each}
		</div>

		{#if lockout_remaining > 0}
			<p class="lockout">locked out . try again in {fmt_lockout(lockout_remaining)}</p>
		{:else if error}
			<p class="err">{error}</p>
		{:else}
			<p class="hint">enter your PIN to continue</p>
		{/if}

		<!-- On-screen keypad for mobile / quick taps -->
		<div class="keypad">
			{#each [1,2,3,4,5,6,7,8,9] as n}
				<button class="key" onclick={() => tap(n)} disabled={busy || lockout_remaining > 0}>{n}</button>
			{/each}
			<button class="key key-text" onclick={clear_all} disabled={busy}>clear</button>
			<button class="key" onclick={() => tap(0)} disabled={busy || lockout_remaining > 0}>0</button>
			<button class="key key-text" onclick={backspace} disabled={busy}>back</button>
		</div>
	</div>
</main>

<style>
	.login {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.card {
		width: 100%;
		max-width: 420px;
		padding: 32px 28px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 2px;
	}
	header { text-align: center; margin-bottom: 22px; }
	.kicker { margin: 0; color: var(--color-ink-3); font-family: var(--font-display); font-style: italic; font-size: 13px; }
	h1 { font-size: 38px; font-weight: 600; margin: 4px 0 0; letter-spacing: -0.02em; }

	.boxes {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 8px;
		margin-bottom: 12px;
	}
	.boxes input {
		text-align: center;
		font: 600 28px/1 var(--font-mono);
		padding: 14px 0;
		letter-spacing: 0;
		color: var(--color-ink);
		background: var(--color-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 2px;
		caret-color: var(--color-accent);
	}
	.boxes input:focus { border-color: var(--color-accent); outline: none; background: var(--color-accent-soft); }
	.boxes.locked input { opacity: 0.5; }

	.hint, .err, .lockout { text-align: center; margin: 0 0 16px; font-size: 12px; }
	.hint { color: var(--color-ink-4); }
	.err { color: var(--color-crimson); }
	.lockout { color: var(--color-rust); font-weight: 600; }

	.keypad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.key {
		font: 500 22px/1 var(--font-display);
		padding: 14px 0;
		color: var(--color-ink);
		background: var(--color-surface-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 2px;
		transition: all 0.1s;
	}
	.key:hover:not(:disabled) { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent-bright); }
	.key:active:not(:disabled) { transform: scale(0.97); }
	.key:disabled { opacity: 0.4; cursor: not-allowed; }
	.key-text { font: 600 11px/1 var(--font-body); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-ink-3); }
</style>
