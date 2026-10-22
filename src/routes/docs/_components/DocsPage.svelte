<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { docsNavFlat } from '../nav.js';

	/** A heading shown in the "On this page" rail. */
	interface TocItem {
		/** Heading id. */
		id: string;
		/** Heading label. */
		label: string;
	}

	/** Props for one documentation article. */
	interface Props {
		/** Article title, also used in the document title. */
		title: string;
		/** One paragraph summary shown below the title. */
		summary: string;
		/** Optional in-page heading list. */
		toc?: TocItem[];
		/** Article body. */
		children: Snippet;
	}

	let { title, summary, toc = [], children }: Props = $props();

	const currentIndex = $derived(docsNavFlat.findIndex((item) => item.href === page.route.id));
	const previous = $derived(currentIndex > 0 ? (docsNavFlat[currentIndex - 1] ?? null) : null);
	const next = $derived(currentIndex >= 0 ? (docsNavFlat[currentIndex + 1] ?? null) : null);
	const sourceHref = $derived.by(() => {
		const routeId = page.route.id;
		const file =
			!routeId || routeId === '/docs'
				? 'src/routes/docs/+page.svelte'
				: `src/routes${routeId}/+page.svelte`;
		return `https://github.com/GABRYCA/svelte-elevenlabs/blob/main/${file}`;
	});
</script>

<svelte:head>
	<title>{title} | svelte-elevenlabs docs</title>
	<meta name="description" content={summary} />
</svelte:head>

<article class="docs-article" id="docs-content">
	<header class="docs-article__head">
		<p class="docs-crumbs">
			<a href={resolve('/docs')}>Docs</a>
			<span class="docs-crumbs__mark" aria-hidden="true"></span>
			<span>{title}</span>
		</p>
		<h1 class="docs-article__title">{title}</h1>
		<p class="docs-lede">{summary}</p>
	</header>

	<div class="docs-prose">
		{@render children()}
	</div>

	<nav class="docs-pager" aria-label="Documentation pages">
		{#if previous}
			<a class="docs-pager__link" href={resolve(previous.href)}>
				<span class="docs-pager__label">Previous</span>
				<span class="docs-pager__title">{previous.label}</span>
			</a>
		{:else}
			<span class="docs-pager__spacer" aria-hidden="true"></span>
		{/if}

		{#if next}
			<a class="docs-pager__link docs-pager__link--next" href={resolve(next.href)}>
				<span class="docs-pager__label">Next</span>
				<span class="docs-pager__title">{next.label}</span>
			</a>
		{:else}
			<span class="docs-pager__spacer" aria-hidden="true"></span>
		{/if}
	</nav>

	<p class="docs-edit">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external repository URL -->
		<a href={sourceHref} rel="noreferrer">Edit this page on GitHub</a>
	</p>
</article>

{#if toc.length > 0}
	<aside class="docs-toc" aria-label="On this page">
		<p class="docs-toc__label">On this page</p>
		<ol class="docs-toc__list">
			{#each toc as item (item.id)}
				<li><a href={`#${item.id}`}>{item.label}</a></li>
			{/each}
		</ol>
	</aside>
{/if}
