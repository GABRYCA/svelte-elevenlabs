import { buildLlmsIndex, LLM_DOCS_HEADERS } from '../_content/llms.js';
import type { RequestHandler } from './$types';

/**
 * Compact documentation index for language models.
 *
 * Prerendered so the file exists in the Node, Bun, and static builds alike.
 */
export const prerender = true;

export const GET: RequestHandler = () => {
	return new Response(buildLlmsIndex(), { headers: LLM_DOCS_HEADERS });
};
