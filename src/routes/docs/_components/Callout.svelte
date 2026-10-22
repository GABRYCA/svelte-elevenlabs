<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Visual tone for a documentation note. */
	type Tone = 'note' | 'warning' | 'security';

	/** Props for a short note inside long-form documentation. */
	interface Props {
		/** Tone marker and default label. */
		tone?: Tone;
		/** Custom label. Defaults to the tone name. */
		title?: string;
		/** Note content. */
		children: Snippet;
	}

	let { tone = 'note', title, children }: Props = $props();

	const defaultLabels: Record<Tone, string> = {
		note: 'Note',
		warning: 'Heads up',
		security: 'Security'
	};
</script>

<aside class="docs-callout" data-tone={tone}>
	<p class="docs-callout__label">{title ?? defaultLabels[tone]}</p>
	<div class="docs-callout__body">
		{@render children()}
	</div>
</aside>
