import { buildLlmsIndex, LLM_DOCS_HEADERS } from '../../_content/llms.js';
import type { RequestHandler } from './$types';

/**
 * Docs scoped alias of the compact index.
 *
 * Agents often look for `/docs/llms.txt` next to the documentation they are
 * reading, so the same file is served from both locations.
 */
export const prerender = true;

export const GET: RequestHandler = () => {
	return new Response(buildLlmsIndex(), { headers: LLM_DOCS_HEADERS });
};
