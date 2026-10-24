import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { buildLlmsFull, buildLlmsIndex, siteUrl } from '../src/routes/_content/llms.js';

describe('LLM documentation', () => {
	it('builds an index with canonical absolute links and the package version', () => {
		const index = buildLlmsIndex();

		expect(index).toContain('# svelte-elevenlabs');
		expect(index).toContain(`Version: ${pkg.version}`);
		expect(index).toContain(`${siteUrl}/llms-full.txt`);
		expect(index).toContain(`${siteUrl}/docs/reference`);
		expect(index).toContain(`${siteUrl}/docs/agents`);
		expect(index).toContain(`${siteUrl}/demo`);
		expect(index).toContain('bunx svelte-elevenlabs agents install');
		expect(index).not.toContain('{{');
	});

	it('builds a full reference without unresolved placeholders', () => {
		const full = buildLlmsFull();

		expect(full).toContain(`Canonical documentation: ${siteUrl}/docs`);
		expect(full).toContain(`Package version: ${pkg.version}`);
		expect(full).toContain(`${siteUrl}/docs/agents`);
		expect(full).toContain(`${siteUrl}/demo`);
		expect(full).not.toContain('{{SITE}}');
		expect(full).not.toContain('{{VERSION}}');
	});
});
