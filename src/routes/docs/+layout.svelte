<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DocsBrand from './_components/DocsBrand.svelte';
	import DocsSidebar from './_components/DocsSidebar.svelte';
	import { docsVersion } from './nav.js';
	import './docs.css';

	let { children } = $props();

	let menuOpen = $state(false);

	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#e9e2d3" />
</svelte:head>

<a class="docs-skip" href="#docs-content">Skip to documentation</a>

<div class="docs-shell">
	<header class="docs-topbar">
		<div class="docs-wrap docs-topbar__inner">
			<DocsBrand />
			<span class="docs-brand__tag">Docs</span>

			<nav class="docs-topbar__nav" aria-label="Site">
				<a href={resolve('/')}>Home</a>
				<a href={resolve('/#console')}>Console</a>
				<a href="https://github.com/GABRYCA/svelte-elevenlabs" rel="noreferrer">GitHub ↗</a>
				<span class="docs-topbar__version">v{docsVersion}</span>
			</nav>

			<button
				type="button"
				class="docs-menu-toggle"
				aria-expanded={menuOpen}
				aria-controls="docs-mobile-nav"
				aria-label={menuOpen ? 'Close documentation menu' : 'Open documentation menu'}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span class="docs-menu-toggle__icon" aria-hidden="true">
					<span></span>
					<span></span>
				</span>
				<span>{menuOpen ? 'Close' : 'Menu'}</span>
			</button>
		</div>

		<div
			id="docs-mobile-nav"
			class={['docs-mobile-nav', { 'is-open': menuOpen }]}
			inert={!menuOpen}
		>
			<DocsSidebar />
		</div>
	</header>

	<div class="docs-wrap docs-layout">
		<aside class="docs-rail">
			<DocsSidebar />
		</aside>

		<main class="docs-main">
			{@render children()}
		</main>
	</div>

	<footer class="docs-footer">
		<div class="docs-wrap docs-footer__inner">
			<p>
				Community documentation for svelte-elevenlabs. Independent project, not affiliated with or
				endorsed by ElevenLabs Inc.
			</p>
			<nav class="docs-footer__links" aria-label="Documentation footer">
				<a href={resolve('/')}>Showcase</a>
				<a href={resolve('/docs/quickstart')}>Quickstart</a>
				<a href={resolve('/docs/reference')}>API reference</a>
				<a href="https://github.com/GABRYCA/svelte-elevenlabs" rel="noreferrer">GitHub ↗</a>
			</nav>
		</div>
	</footer>
</div>
