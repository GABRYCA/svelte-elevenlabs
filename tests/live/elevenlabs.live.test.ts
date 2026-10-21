import { beforeAll, describe, expect, it } from 'vitest';
import type { ConversationInitiationMetadataEvent } from '../../src/lib/types/index.js';

const API_ORIGIN = 'https://api.elevenlabs.io';
const LIVE = process.env.ELEVENLABS_LIVE_TESTS === '1';
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim() ?? '';
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID?.trim() ?? '';
const RUN_CONVERSATION = process.env.ELEVENLABS_LIVE_CONVERSATION === '1';
const REQUEST_TIMEOUT_MS = 20_000;

function authHeaders(): Record<string, string> {
	return {
		accept: 'application/json',
		'xi-api-key': API_KEY
	};
}

async function requestSignedUrl(): Promise<string> {
	const url = new URL('/v1/convai/conversation/get-signed-url', API_ORIGIN);
	url.searchParams.set('agent_id', AGENT_ID);

	const response = await fetch(url, {
		headers: authHeaders(),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	expect(response.ok, `Signed URL request failed with HTTP ${response.status}.`).toBe(true);

	const body = (await response.json()) as { signed_url?: unknown };
	expect(typeof body.signed_url).toBe('string');
	expect(String(body.signed_url)).toMatch(/^wss:\/\//);
	return String(body.signed_url);
}

describe('ElevenLabs live API', () => {
	beforeAll(() => {
		expect(
			LIVE,
			'Live tests are disabled. Set ELEVENLABS_LIVE_TESTS=1 before running bun run test:live.'
		).toBe(true);
		expect(API_KEY, 'Set ELEVENLABS_API_KEY before running the live tests.').not.toBe('');
		expect(
			AGENT_ID,
			'Set ELEVENLABS_AGENT_ID to a public or workspace agent before running the live tests.'
		).not.toBe('');
	});

	it('returns the configured agent from the REST API', async () => {
		const response = await fetch(`${API_ORIGIN}/v1/convai/agents/${encodeURIComponent(AGENT_ID)}`, {
			headers: authHeaders(),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		expect(response.ok, `Agent request failed with HTTP ${response.status}.`).toBe(true);
		const body = (await response.json()) as { agent_id?: string };
		expect(body.agent_id).toBe(AGENT_ID);
	});

	it('mints a signed WebSocket URL for the configured agent', async () => {
		const signedUrl = await requestSignedUrl();
		const parsed = new URL(signedUrl);

		expect(parsed.protocol).toBe('wss:');
		expect(parsed.searchParams.get('agent_id')).toBe(AGENT_ID);
	});

	it.runIf(RUN_CONVERSATION)(
		'opens a conversation and receives the initiation metadata',
		async () => {
			expect(typeof WebSocket, 'This runtime does not provide a WebSocket client.').toBe(
				'function'
			);
			const signedUrl = await requestSignedUrl();

			const metadata = await new Promise<ConversationInitiationMetadataEvent>((resolve, reject) => {
				const socket = new WebSocket(signedUrl, ['convai']);
				let settled = false;

				const finish = (error?: Error): void => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					socket.removeEventListener('open', onOpen);
					socket.removeEventListener('message', onMessage);
					socket.removeEventListener('error', onError);
					socket.removeEventListener('close', onClose);

					if (error) {
						try {
							socket.close(1000, 'Live test failed');
						} catch {
							// The socket may already be closed.
						}
						reject(error);
					}
				};

				const timer = setTimeout(() => {
					finish(new Error('The agent did not send conversation metadata within 20 seconds.'));
				}, REQUEST_TIMEOUT_MS);

				const onOpen = (): void => {
					socket.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
				};

				const onMessage = (event: MessageEvent): void => {
					let parsed: unknown;
					try {
						parsed = JSON.parse(String(event.data));
					} catch {
						return;
					}

					if (
						typeof parsed === 'object' &&
						parsed !== null &&
						(parsed as { type?: unknown }).type === 'conversation_initiation_metadata'
					) {
						finish();
						resolve(parsed as ConversationInitiationMetadataEvent);
					}
				};

				const onError = (): void => {
					finish(new Error('The live WebSocket reported an error before metadata.'));
				};

				const onClose = (event: CloseEvent): void => {
					finish(new Error(`The live WebSocket closed before metadata (code ${event.code}).`));
				};

				socket.addEventListener('open', onOpen);
				socket.addEventListener('message', onMessage);
				socket.addEventListener('error', onError);
				socket.addEventListener('close', onClose);
			});

			expect(metadata.conversation_initiation_metadata_event.conversation_id).toBeTruthy();
			expect(
				metadata.conversation_initiation_metadata_event.agent_output_audio_format
			).toBeTruthy();
		}
	);
});
