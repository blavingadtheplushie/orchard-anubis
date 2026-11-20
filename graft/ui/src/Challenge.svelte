<script lang="ts">
	import type { HostApi } from '@orchardlabs/graft-sdk/client';
	import {
		Alert,
		Button,
		FormActions,
		SectionCard,
		SettingRow,
		SettingsList,
		Spinner,
		StatusBadge,
		statusMeta,
		Textarea,
		ToggleRow
	} from '@orchardlabs/graft-ui';
	import { getState, setState, type Domain, type State } from './api';

	let { host, deploymentId }: { host: HostApi; deploymentId: string } = $props();
	const uid = $props.id();

	let state = $state<State | null>(null);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let pending = $state<boolean | null>(null);
	let paths = $state('');

	const lines = (v: string) =>
		v
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);

	function load() {
		error = null;
		getState(host, deploymentId)
			.then((s) => {
				state = s;
				paths = s.excludedPaths.join('\n');
			})
			.catch((e: Error) => (error = e.message));
	}

	$effect(load);

	const enabled = $derived(pending ?? !!state?.enabled);
	const dirty = $derived(!!state && lines(paths).join('\n') !== state.excludedPaths.join('\n'));
	const locked = $derived(!state?.canEdit || saving);

	async function push(next: { enabled: boolean; excludedPaths: string[] }, okMsg: string) {
		saving = true;
		try {
			state = await setState(host, deploymentId, next);
			paths = state.excludedPaths.join('\n');
			host.toast(okMsg, 'success');
		} catch (e) {
			host.toast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}

	async function toggle(next: boolean) {
		if (!state || next === state.enabled) return;
		if (!next) {
			const ok = await host.confirm({
				title: 'Turn off the challenge?',
				body: 'Visitors and bots will reach the app directly again.',
				confirmLabel: 'Turn off',
				danger: true
			});
			if (!ok) return;
		}
		pending = next;
		try {
			await push(
				{ enabled: next, excludedPaths: state.excludedPaths },
				next ? 'Challenge is on' : 'Challenge is off'
			);
		} finally {
			pending = null;
		}
	}

	const save = () =>
		state && push({ enabled: state.enabled, excludedPaths: lines(paths) }, 'Excluded paths saved');
	const discard = () => state && (paths = state.excludedPaths.join('\n'));

	function domainMeta(d: Domain) {
		if (d.reason) return statusMeta('warning', `Not covered: ${d.reason}`);
		if (d.protected) return statusMeta('success', 'Protected');
		return statusMeta('neutral', 'Open');
	}
	const label = (d: Domain) => d.host + (d.path === '/' ? '' : d.path);
</script>

<div class="anubis">
	<SectionCard
		title="Bot challenge"
		description="Visitors solve a short proof-of-work in their browser before they reach this app. Search engines and /robots.txt still get through."
	>
		{#if error}
			<Alert tone="error" title="Couldn't load the challenge settings">
				{error}
				{#snippet actions()}
					<Button size="sm" variant="secondary" onclick={load}>Retry</Button>
				{/snippet}
			</Alert>
		{:else if !state}
			<div class="loading"><Spinner size={16} label="Loading challenge settings" /></div>
		{:else}
			<div class="body">
				<SettingsList>
					<ToggleRow
						label="Challenge visitors"
						hint="Powered by Anubis"
						disabled={locked}
						bind:checked={() => enabled, toggle}
					/>
					<SettingRow
						label="Excluded paths"
						for="{uid}-paths"
						stack
						hint="One path prefix per line. Exclude APIs, webhooks and anything a script calls, since scripts can't solve the challenge."
					>
						<Textarea
							id="{uid}-paths"
							rows={3}
							mono
							autoGrow
							placeholder={'/api\n/webhooks'}
							disabled={locked}
							bind:value={paths}
						/>
					</SettingRow>
				</SettingsList>

				{#if state.canEdit}
					<FormActions>
						<Button variant="ghost" disabled={!dirty || saving} onclick={discard}>Discard</Button>
						<Button variant="primary" loading={saving && !pending} disabled={!dirty} onclick={save}
							>Save</Button
						>
					</FormActions>
				{:else}
					<Alert tone="info">You need edit access to this project to change these settings.</Alert>
				{/if}
			</div>
		{/if}
	</SectionCard>

	{#if state}
		<SectionCard title="Domains" description="Where the challenge applies.">
			{#if state.domains.length}
				<SettingsList>
					{#each state.domains as d (d.host + d.path)}
						<SettingRow label={label(d)}>
							<StatusBadge meta={domainMeta(d)} />
						</SettingRow>
					{/each}
				</SettingsList>
			{:else}
				<p class="empty">This app has no domain yet. Add one in the Network tab.</p>
			{/if}
		</SectionCard>
	{/if}
</div>

<style>
	.anubis {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.loading {
		display: flex;
		align-items: center;
		color: var(--text-faint);
	}
	.empty {
		margin: 0;
		color: var(--text-muted);
	}
</style>
