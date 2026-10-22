import { describe, expect, it } from 'vitest';
import { highlight, type Token } from '../src/routes/docs/_components/highlight.js';

function flat(code: string, lang: string): Token[] {
	return highlight(code, lang).flat();
}

function find(tokens: Token[], text: string): Token | undefined {
	return tokens.find((token) => token.text === text);
}

describe('highlight', () => {
	it('colors TypeScript keywords, strings, types, and comments', () => {
		const tokens = flat(
			"import type { ConversationOptions } from 'svelte-elevenlabs';\n// note\nconst value: number = 1;",
			'ts'
		);

		expect(find(tokens, 'import')?.kind).toBe('keyword');
		expect(find(tokens, 'type')?.kind).toBe('keyword');
		expect(find(tokens, "'svelte-elevenlabs'")?.kind).toBe('string');
		expect(find(tokens, 'number')?.kind).toBe('type');
		expect(find(tokens, '// note')?.kind).toBe('comment');
		expect(find(tokens, '1')?.kind).toBe('number');
	});

	it('colors Svelte tags, attributes, and block directives', () => {
		const tokens = flat(
			'<script lang="ts">\n{#if conversation.error}<p role="alert">{conversation.error}</p>{/if}\n</script>',
			'svelte'
		);

		expect(find(tokens, '<script')?.kind).toBe('tag');
		expect(find(tokens, 'lang')?.kind).toBe('attr');
		expect(find(tokens, 'role')?.kind).toBe('attr');
		expect(find(tokens, '{#if')?.kind).toBe('keyword');
		expect(find(tokens, '{/if')?.kind).toBe('keyword');
		expect(find(tokens, '<p')?.kind).toBe('tag');
	});

	it('keeps adjacent Svelte directives intact', () => {
		const tokens = flat('{#if conversation.error}{conversation.error}{/if}', 'svelte');

		expect(find(tokens, '{#if')?.kind).toBe('keyword');
		expect(find(tokens, '{/if')?.kind).toBe('keyword');
		expect(find(tokens, 'if')).toBeUndefined();
	});

	it('keeps shell commands and hyphenated package names readable', () => {
		const lines = highlight('bun add svelte-elevenlabs\nnpm install svelte-elevenlabs', 'sh');
		const tokens = lines.flat();

		expect(find(tokens, 'bun')?.kind).toBe('function');
		expect(find(tokens, 'npm')?.kind).toBe('function');
		expect(tokens.some((token) => token.kind === 'attr' && token.text.includes('elevenlabs'))).toBe(
			false
		);
		expect(lines.map((line) => line.map((token) => token.text).join('')).join('\n')).toBe(
			'bun add svelte-elevenlabs\nnpm install svelte-elevenlabs'
		);
	});

	it('still colors shell flags, variables, and comments', () => {
		const tokens = flat('# run it\nPUBLIC_ID=agent_123 bun run dev --filter docs', 'sh');

		expect(find(tokens, '# run it')?.kind).toBe('comment');
		expect(find(tokens, 'PUBLIC_ID')?.kind).toBe('property');
		expect(find(tokens, '--filter')?.kind).toBe('attr');
	});

	it('colors JSON properties, string values, numbers, and literals', () => {
		const tokens = flat('{ "signed_url": "wss://example.test", "ok": true, "count": 2 }', 'json');

		expect(find(tokens, '"signed_url"')?.kind).toBe('property');
		expect(find(tokens, '"wss://example.test"')?.kind).toBe('string');
		expect(find(tokens, 'true')?.kind).toBe('keyword');
		expect(find(tokens, '2')?.kind).toBe('number');
	});

	it('colors HTTP methods, paths, and status codes', () => {
		const tokens = flat('GET /api/signed-url?agent_id=agent_test\n\nHTTP/1.1 200 OK', 'http');

		expect(find(tokens, 'GET')?.kind).toBe('keyword');
		expect(find(tokens, '/api/signed-url?agent_id=agent_test')?.kind).toBe('string');
		expect(find(tokens, 'HTTP/1.1')?.kind).toBe('meta');
		expect(find(tokens, '200')?.kind).toBe('number');
	});

	it('colors CSS at-rules, custom properties, and colors', () => {
		const tokens = flat('@theme {\n  --paper: #fff;\n}', 'css');

		expect(find(tokens, '@theme')?.kind).toBe('keyword');
		expect(find(tokens, '--paper')?.kind).toBe('property');
		expect(find(tokens, '#fff')?.kind).toBe('number');
	});

	it('preserves unknown languages and blank lines as plain text', () => {
		const lines = highlight('first\n\nthird', 'text');

		expect(lines).toHaveLength(3);
		expect(lines.flat().every((token) => token.kind === 'plain')).toBe(true);
		expect(lines.map((line) => line.map((token) => token.text).join('')).join('\n')).toBe(
			'first\n\nthird'
		);
	});
});
