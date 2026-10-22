<script lang="ts">
	import { onMount } from 'svelte';

	/** Storage key shared by the inline bootstrap script in `app.html`. */
	const STORAGE_KEY = 'svelte-elevenlabs-theme';

	type Theme = 'light' | 'dark';

	let theme = $state<Theme>('light');

	const nextLabel = $derived(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
		syncThemeColor(theme);
	});

	function syncThemeColor(value: Theme): void {
		const color = value === 'dark' ? '#14140f' : '#e9e2d3';

		for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
			tag.setAttribute('content', color);
		}
	}

	function toggle(): void {
		const next: Theme = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		document.documentElement.dataset.theme = next;
		syncThemeColor(next);

		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Private browsing can reject writes. The active theme still applies.
		}
	}
</script>

<button
	type="button"
	class="theme-toggle"
	aria-pressed={theme === 'dark'}
	aria-label={nextLabel}
	title={nextLabel}
	onclick={toggle}
>
	<span class="theme-toggle__icon" aria-hidden="true">
		{#if theme === 'dark'}
			<svg viewBox="0 0 24 24" focusable="false">
				<circle cx="12" cy="12" r="4" />
				<path
					d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" focusable="false">
				<path d="M20.3 14.4A8.4 8.4 0 0 1 9.6 3.7 8.5 8.5 0 1 0 20.3 14.4Z" />
			</svg>
		{/if}
	</span>
	<span class="sr-only">{nextLabel}</span>
</button>

<style>
	.theme-toggle {
		display: inline-grid;
		place-items: center;
		width: 1.72rem;
		height: 1.72rem;
		flex: 0 0 auto;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--ink) 28%, transparent);
		border-radius: 0;
		background: transparent;
		color: var(--ink-soft);
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			color 150ms ease;
	}

	.theme-toggle:hover {
		border-color: var(--ink);
		background: color-mix(in srgb, var(--ink) 7%, transparent);
		color: var(--ink);
	}

	.theme-toggle:focus-visible {
		outline: 2px solid var(--signal-deep);
		outline-offset: 2px;
	}

	.theme-toggle__icon {
		display: grid;
		place-items: center;
		width: 0.82rem;
		height: 0.82rem;
	}

	.theme-toggle svg {
		width: 100%;
		height: 100%;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}

	.theme-toggle svg circle {
		fill: currentColor;
		stroke: none;
	}

	.theme-toggle svg path {
		vector-effect: non-scaling-stroke;
	}

	@media (prefers-reduced-motion: reduce) {
		.theme-toggle {
			transition: none;
		}
	}
</style>
