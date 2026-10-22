<script lang="ts">
	import { highlight } from './highlight.js';

	/** Props for a copyable documentation code sample. */
	interface Props {
		/** Code without surrounding fences. */
		code: string;
		/** Language label shown on the typographic frame. */
		lang?: string;
		/** Optional file name that replaces the language label. */
		filename?: string;
	}

	let { code, lang = 'ts', filename }: Props = $props();

	let state = $state<'idle' | 'copied' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;

	const label = $derived(filename ?? lang.toUpperCase());
	const lines = $derived(highlight(code, lang));

	$effect(() => {
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	async function copy(): Promise<void> {
		try {
			if (!navigator.clipboard) throw new Error('Clipboard access is not available.');
			await navigator.clipboard.writeText(code);
			state = 'copied';
		} catch {
			state = 'failed';
		}

		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			state = 'idle';
			timer = null;
		}, 2_000);
	}
</script>

<div class="docs-code">
	<div class="docs-code__bar">
		<span class="docs-code__label">{label}</span>
		<button
			type="button"
			class="docs-code__copy"
			data-state={state}
			aria-label={state === 'copied' ? 'Code copied' : 'Copy code'}
			onclick={() => void copy()}
		>
			{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
		</button>
	</div>
	<pre><code
			>{#each lines as line, index (index)}<span class="docs-code__line"
					>{#each line as token, tokenIndex (tokenIndex)}<span class={`tok-${token.kind}`}
							>{token.text}</span
						>{/each}</span
				>{/each}</code
		></pre>
</div>
