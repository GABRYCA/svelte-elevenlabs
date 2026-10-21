import type { ClientToolHandler } from '../types/index.js';
import { getConversationContext } from './context.svelte.js';

/**
 * Register a named client tool for the surrounding {@link ConversationProvider}.
 *
 * The registration is tied to the component lifecycle and is removed when the
 * component unmounts. Call this during component initialisation, directly
 * inside `<script>`, so Svelte can create the teardown effect.
 *
 * @param name - Tool name configured on the ElevenLabs agent.
 * @param handler - Function invoked with the tool parameters and full call payload.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { useConversationClientTool } from 'svelte-elevenlabs';
 *
 *   useConversationClientTool('get_weather', async ({ city }) => {
 *     return { city, temperature: 21 };
 *   });
 * </script>
 * ```
 */
export function useConversationClientTool(name: string, handler: ClientToolHandler): void {
	const conversation = getConversationContext();

	$effect(() => {
		const toolName = name.trim();
		if (!toolName) return;
		return conversation.registerClientTool(toolName, handler);
	});
}
