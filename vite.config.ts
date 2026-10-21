import tailwindcss from '@tailwindcss/vite';
import adapterBun from '@sveltejs/adapter-bun';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Normalize a GitHub Pages base path.
 *
 * GitHub project sites live under `/<repository>`. User sites and custom
 * domains live at `/`. An empty value or a single slash both mean the root.
 */
function normalizeBase(value: string | undefined): '' | `/${string}` {
	const raw = (value ?? '').trim();
	if (!raw || raw === '/') return '';

	const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
	return withLeadingSlash.replace(/\/+$/, '') as `/${string}`;
}

export default defineConfig(({ mode }) => {
	const pages = mode === 'pages';
	const bun = mode === 'bun';

	// The static target must never expose the signed URL server route. Force the
	// public flag even when a local build omitted it from the environment.
	if (pages) process.env.PUBLIC_HOSTING_MODE = 'static';

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in Svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: pages ? adapterStatic({ strict: false }) : bun ? adapterBun() : adapterNode(),
				paths: {
					// Read the base from the environment rather than `mode`: SvelteKit
					// reloads this config after the build, without the original mode.
					base: normalizeBase(process.env.PAGES_BASE_PATH)
				}
			})
		]
	};
});
