<script lang="ts">
	import type { HostApi } from '@orchardlabs/graft-sdk/client';
	import { getState, setState, type State } from './api';

	let { host, deploymentId }: { host: HostApi; deploymentId: string } = $props();
	let state = $state<State | null>(null);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let enabled = $state(false);
	let paths = $state('');

	function apply(s: State) {
		state = s;
		enabled = s.enabled;
		paths = s.excludedPaths.join('\n');
	}

	$effect(() => {
		getState(host, deploymentId)
			.then(apply)
			.catch((e: Error) => (error = e.message));
	});

	const dirty = $derived(
		!!state && (enabled !== state.enabled || paths.trim() !== state.excludedPaths.join('\n'))
	);

	async function save() {
		if (!state) return;
		if (state.enabled && !enabled) {
			const ok = await host.confirm({
				title: 'Turn off the challenge?',
				body: 'Visitors and bots will reach the app directly again.',
				confirmLabel: 'Turn off',
				danger: true
			});
			if (!ok) return;
		}
		saving = true;
		try {
			const list = paths.split('\n').map((p) => p.trim()).filter(Boolean);
			apply(await setState(host, deploymentId, { enabled, excludedPaths: list }));
			host.toast(enabled ? 'Challenge is on' : 'Challenge is off', 'success');
		} catch (e) {
			host.toast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}
</script>

<section class="card">
	<header>
		<h2>Bot challenge</h2>
		<p class="muted">
			Visitors solve a short proof-of-work in their browser before they reach this app, powered by
			<a href="https://anubis.techaro.lol" target="_blank" rel="noreferrer">Anubis</a>. Search engines and
			<code>/robots.txt</code> still get through.
		</p>
	</header>

	{#if error}
		<p class="error">{error}</p>
	{:else if !state}
		<p class="muted">Loading…</p>
	{:else}
		<label class="toggle">
			<input type="checkbox" bind:checked={enabled} disabled={!state.canEdit || saving} />
			<span>Challenge visitors</span>
		</label>

		<div class="field">
			<label for="anubis-paths">Excluded paths</label>
			<textarea
				id="anubis-paths"
				rows="4"
				placeholder={'/api\n/webhooks'}
				bind:value={paths}
				disabled={!state.canEdit || saving}
			></textarea>
			<p class="muted small">One per line. APIs, webhooks and anything a script calls must be excluded, since scripts can't solve the challenge.</p>
		</div>

		{#if state.domains.length}
			<ul class="domains">
				{#each state.domains as d (d.host + d.path)}
					<li>
						<code>{d.host}{d.path === '/' ? '' : d.path}</code>
						{#if d.reason}
							<span class="muted small">not covered: {d.reason}</span>
						{:else if d.protected}
							<span class="ok small">protected</span>
						{:else}
							<span class="muted small">open</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted small">This app has no domain yet.</p>
		{/if}

		{#if state.canEdit}
			<div class="actions">
				<button type="button" onclick={save} disabled={!dirty || saving}>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		{:else}
			<p class="muted small">You need edit access to this project to change this.</p>
		{/if}
	{/if}
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border: 1px solid var(--border, rgba(127, 127, 127, 0.25));
		border-radius: 0.75rem;
		background: var(--bg-surface, transparent);
		max-width: 46rem;
	}
	h2 { margin: 0 0 0.25rem; font-size: 1rem; }
	p { margin: 0; }
	.muted { color: var(--text-muted, #888); }
	.small { font-size: 0.8125rem; }
	.error { color: var(--danger, #d33); }
	.ok { color: var(--success, #2a8); }
	.toggle { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; }
	.field { display: flex; flex-direction: column; gap: 0.375rem; }
	.field label { font-weight: 500; font-size: 0.875rem; }
	textarea {
		font: inherit; font-family: var(--font-mono, monospace); font-size: 0.8125rem;
		padding: 0.5rem; border-radius: 0.5rem; resize: vertical;
		border: 1px solid var(--border, rgba(127, 127, 127, 0.35));
		background: var(--bg-input, transparent); color: inherit;
	}
	.domains { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
	.domains li { display: flex; gap: 0.75rem; align-items: baseline; }
	.actions { display: flex; justify-content: flex-end; }
	button {
		font: inherit; font-weight: 500; padding: 0.4rem 1rem; border-radius: 0.5rem; cursor: pointer;
		border: 1px solid transparent; background: var(--accent, #111); color: var(--accent-fg, #fff);
	}
	button:disabled { opacity: 0.5; cursor: default; }
</style>
