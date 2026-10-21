import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Opt-in configuration for tests that talk to the real ElevenLabs API.
 *
 * These tests consume quota. Run them with `bun run test:live` after setting
 * `ELEVENLABS_LIVE_TESTS=1`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_AGENT_ID`.
 * They are never part of the default test run or the release workflow.
 */
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
		include: ['tests/live/**/*.test.ts'],
		exclude: configDefaults.exclude,
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
