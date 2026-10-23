<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { docsNav, docsVersion } from '../nav.js';

	let query = $state('');

	const groups = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return docsNav;

		return docsNav
			.map((group) => ({
				...group,
				items: group.items.filter((item) =>
					`${item.label} ${item.description}`.toLowerCase().includes(needle)
				)
			}))
			.filter((group) => group.items.length > 0);
	});
</script>

<nav class="docs-nav" aria-label="Documentation">
	<label class="docs-filter">
		<span class="sr-only">Filter documentation pages</span>
		<span class="docs-filter__mark" aria-hidden="true"></span>
		<input
			type="search"
			bind:value={query}
			placeholder="Filter pages"
			autocomplete="off"
			spellcheck="false"
		/>
	</label>

	{#each groups as group (group.label)}
		<div class="docs-nav__group">
			<p class="docs-nav__label">{group.label}</p>
			<ul class="docs-nav__list">
				{#each group.items as item (item.href)}
					<li>
						<a
							class="docs-nav__link"
							href={resolve(item.href)}
							aria-current={page.route.id === item.href ? 'page' : undefined}
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="docs-nav__empty">No pages match that filter. Clear it and try again.</p>
	{/each}

	<div class="docs-nav__meta">
		<span>Version {docsVersion}</span>
		<span>Community build</span>
		<a href={resolve('/llms.txt')} title="Machine readable documentation index">llms.txt</a>
		<a href={resolve('/llms-full.txt')} title="Complete machine readable documentation">
			llms-full.txt
		</a>
		<a href="https://github.com/GABRYCA/svelte-elevenlabs" rel="noreferrer">Source on GitHub</a>
	</div>
</nav>
