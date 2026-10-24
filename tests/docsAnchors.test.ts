import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsRoot = fileURLToPath(new URL('../src/routes/docs', import.meta.url));

/** Every `+page.svelte` under the documentation route. */
function pageFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return pageFiles(path);
		return entry.name === '+page.svelte' ? [path] : [];
	});
}

/** Capture the first group of every match for a global pattern. */
function capture(source: string, pattern: RegExp): string[] {
	return [...source.matchAll(pattern)].map((match) => match[1] ?? '');
}

describe('documentation anchors', () => {
	it('has a heading for every table of contents entry', () => {
		const failures: string[] = [];

		for (const file of pageFiles(docsRoot)) {
			const source = readFileSync(file, 'utf8');
			const toc = capture(source, /id:\s*'([^']+)',\s*label:/g);
			const headings = new Set(capture(source, /<h[23]\s+id="([^"]+)"/g));
			const missing = toc.filter((id) => !headings.has(id));

			if (missing.length > 0) {
				failures.push(`${relative(docsRoot, file)}: ${missing.join(', ')}`);
			}
		}

		expect(failures).toEqual([]);
	});

	it('uses every heading id at most once per page', () => {
		const failures: string[] = [];

		for (const file of pageFiles(docsRoot)) {
			const source = readFileSync(file, 'utf8');
			const headings = capture(source, /<h[23]\s+id="([^"]+)"/g);
			const duplicates = headings.filter((id, index) => headings.indexOf(id) !== index);

			if (duplicates.length > 0) {
				failures.push(`${relative(docsRoot, file)}: ${[...new Set(duplicates)].join(', ')}`);
			}
		}

		expect(failures).toEqual([]);
	});
});
