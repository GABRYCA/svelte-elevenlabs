/**
 * Build the machine readable documentation served at `/llms.txt`,
 * `/llms-full.txt`, and `/docs/llms.txt`.
 *
 * The showcase is published to GitHub Pages under a repository base path, so
 * every absolute link in these files has to include that base. `PAGES_BASE_PATH`
 * is the same value the Vite config uses for `paths.base`. When it is not set
 * (the default Node or Bun build) the public GitHub Pages path is assumed, so
 * the files still point at the canonical documentation instead of a localhost
 * origin.
 */
import pkg from '../../../package.json';
import llmsFullSource from './llms-full.md?raw';

const SITE_ORIGIN = 'https://gabryca.github.io';
const DEFAULT_BASE_PATH = '/svelte-elevenlabs';

/** Package version, read from `package.json` so the docs cannot drift. */
export const packageVersion: string = pkg.version;

/** Normalize a GitHub Pages base path to an empty string or `/segment`. */
function normalizeBase(value: string | undefined): string {
	const raw = (value ?? DEFAULT_BASE_PATH).trim();
	if (!raw || raw === '/') return '';
	const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
	return withLeadingSlash.replace(/\/+$/, '');
}

/** Absolute site root, including the deployment base path. */
export const siteUrl = `${SITE_ORIGIN}${normalizeBase(process.env.PAGES_BASE_PATH)}`;

/** Headers shared by every plain text documentation endpoint. */
export const LLM_DOCS_HEADERS: Record<string, string> = {
	'content-type': 'text/plain; charset=utf-8',
	'cache-control': 'public, max-age=3600'
};

/** Replace build placeholders in the long form reference. */
export function buildLlmsFull(): string {
	return llmsFullSource.replaceAll('{{SITE}}', siteUrl).replaceAll('{{VERSION}}', packageVersion);
}

/**
 * Compact index for language models.
 *
 * Follows the llms.txt convention: an H1, a blockquote summary, optional
 * context, then H2 sections containing `[label](url): description` entries.
 */
export function buildLlmsIndex(): string {
	return `# svelte-elevenlabs

> An independent, MIT licensed Svelte 5 library for ElevenLabs Conversational AI. One controller owns the browser side of a session: the WebSocket handshake, microphone capture, agent playback, transcripts, client tools, signed URLs, and teardown.

This file is a compact map for language models and coding agents. The complete reference, including every option, controller field, method, error code, and deployment note, is at ${siteUrl}/llms-full.txt.

- Package: svelte-elevenlabs
- Version: ${packageVersion}
- License: MIT
- Peer dependency: Svelte 5
- Session runtime: browser with WebSocket, and Web Audio for voice
- Server runtime: Node 22.17 or newer, or Bun 1.4 or newer

## Start here

- [Install](${siteUrl}/docs/install): requirements, package setup, server key, and Tailwind 4 discovery.
- [Quickstart](${siteUrl}/docs/quickstart): a first voice session in one Svelte component.

## Guides

- [Sessions](${siteUrl}/docs/sessions): voice and text sessions, mute, feedback, transcripts, and controller lifecycle.
- [Audio](${siteUrl}/docs/audio): supported formats, capture, playback, devices, and analyser data.
- [Client tools](${siteUrl}/docs/client-tools): named tools, provider scoped tools, and MCP approvals.
- [Components](${siteUrl}/docs/components): the visualizer, widget, provider, and theme variables.
- [Signed URLs](${siteUrl}/docs/signed-urls): the server exchange contract and deployment checklist.

## Reference

- [API reference](${siteUrl}/docs/reference): options, reactive controller fields, methods, and public types.
- [Troubleshooting](${siteUrl}/docs/troubleshooting): error codes, browser limits, and common fixes.
- [Full reference](${siteUrl}/llms-full.txt): the complete source text in one Markdown file.

## Project

- [Human documentation](${siteUrl}/docs): the rendered documentation site.
- [Source](${SITE_ORIGIN}/GABRYCA/svelte-elevenlabs): repository, issues, and release notes.
- [npm package](https://www.npmjs.com/package/svelte-elevenlabs): published package.
`;
}
