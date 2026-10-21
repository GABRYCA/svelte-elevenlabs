import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Typed, explicit environment variables for the showcase app.
 *
 * SvelteKit 3 replaces the legacy `$env/*` modules with this contract. The
 * API key is deliberately absent here: the signed-URL route reads it from
 * `process.env` on the server and never exposes it to public app code.
 */
export const variables = defineEnvVars({
	PUBLIC_ELEVENLABS_AGENT_ID: {
		public: true,
		description: 'Optional public ElevenLabs agent id used to prefill the demo console.',
		schema: (value) => (value ?? '').trim()
	},
	PUBLIC_HOSTING_MODE: {
		public: true,
		description: 'Use "static" on the GitHub Pages build to hide the server-only signed URL flow.',
		schema: (value) => (value?.trim() === 'static' ? 'static' : 'server')
	}
});
