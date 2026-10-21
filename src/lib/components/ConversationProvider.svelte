<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import {
		createConversation,
		type ConversationController
	} from '../runes/useConversation.svelte.js';
	import { setConversationContext } from '../runes/context.svelte.js';
	import type { ConversationOptions } from '../types/index.js';

	/**
	 * Props for {@link ConversationProvider}.
	 */
	interface Props {
		/**
		 * Existing controller to share. When omitted the provider creates one
		 * from `options` and destroys it on unmount.
		 */
		conversation?: ConversationController;
		/** Options used by the provider owned controller. Ignored with `conversation`. */
		options?: ConversationOptions;
		/** Child content that can read the conversation from context. */
		children: Snippet;
	}

	let { conversation, options = {}, children }: Props = $props();

	/*
	 * The provider owns one controller for its lifetime. Reading the props with
	 * untrack makes that ownership explicit instead of silently depending on a
	 * later prop change that cannot replace the context value.
	 */
	const external = untrack(() => conversation);
	const internal = external ? null : createConversation(untrack(() => options));
	const active = external ?? internal!;

	setConversationContext(active);

	$effect(() => {
		if (!internal) return;
		return () => internal.destroy();
	});
</script>

{@render children()}
