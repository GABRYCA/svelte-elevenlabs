import { createContext } from 'svelte';
import type { ConversationController } from './useConversation.svelte.js';

const conversationContext = createContext<ConversationController>();

/**
 * Read the controller supplied by the nearest {@link ConversationProvider}.
 *
 * Call this during component initialisation, not inside an event handler or
 * after an `await`. The returned controller is reactive, so reading its state
 * in markup updates normally.
 *
 * @throws When the component is not rendered inside a `ConversationProvider`.
 */
export const getConversationContext = conversationContext[0];

/**
 * Supply a controller to descendant components.
 *
 * This is primarily used by {@link ConversationProvider}. Call it during
 * component initialisation, before rendering the children that need the
 * controller.
 *
 * @param conversation - Controller shared with the component subtree.
 * @returns The same controller.
 */
export const setConversationContext = conversationContext[1];
