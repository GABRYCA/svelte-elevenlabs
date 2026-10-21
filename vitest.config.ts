import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		svelte({
			configFile: false,
			compilerOptions: {
				runes: true
			}
		})
	],
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Live ElevenLabs tests consume quota. Run them through vitest.live.config.ts.
		exclude: [...configDefaults.exclude, 'tests/live/**']
	}
});
