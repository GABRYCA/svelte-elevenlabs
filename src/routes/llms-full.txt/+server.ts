import { buildLlmsFull, LLM_DOCS_HEADERS } from '../_content/llms.js';
import type { RequestHandler } from './$types';

/**
 * Complete documentation for language models in one Markdown file.
 *
 * Prerendered so the file exists in the Node, Bun, and static builds alike.
 */
export const prerender = true;

export const GET: RequestHandler = () => {
	return new Response(buildLlmsFull(), { headers: LLM_DOCS_HEADERS });
};
