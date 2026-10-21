import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * This route is intentionally server-only: it is the only place in the demo
 * that reads `ELEVENLABS_API_KEY`. The key is never returned to the browser
 * and never included in a signed URL.
 */
const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io';
const AGENT_ID_PATTERN = /^(agent|seng)_[A-Za-z0-9]+$/;

export const prerender = false;

/**
 * Exchange a public agent id for a short-lived ElevenLabs WebSocket URL.
 *
 * Query parameters:
 * - `agent_id`: a public `agent_…` or `seng_…` id.
 *
 * Success response: `{ signed_url: string }`
 * Error response: `{ error: { message: string } }`
 */
export const GET: RequestHandler = async ({ url, fetch, request, setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store, max-age=0'
	});

	const agentId = url.searchParams.get('agent_id')?.trim() ?? '';

	if (!agentId) {
		return json(
			{ error: { message: 'Add an agent_id query parameter before requesting a signed URL.' } },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	if (!AGENT_ID_PATTERN.test(agentId)) {
		return json(
			{
				error: {
					message:
						'That agent id is not valid. Public ElevenLabs agent ids start with "agent_" (or "seng_").'
				}
			},
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	/*
	 * Read the secret from the server environment only. On Bun the value is
	 * normally loaded from `.env` by the runtime; on Node it comes from the
	 * process environment. Never expose this through a PUBLIC_* variable.
	 */
	const apiKey = process.env.ELEVENLABS_API_KEY?.trim() ?? '';
	if (!apiKey) {
		console.error(
			'[svelte-elevenlabs] ELEVENLABS_API_KEY is not set. Add it to .env or the deployment environment.'
		);
		return json(
			{
				error: {
					message:
						'The server is missing ELEVENLABS_API_KEY. Add it to .env (or your deployment secrets) and restart the server.'
				}
			},
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}

	try {
		const upstreamUrl = new URL('/v1/convai/conversation/get-signed-url', ELEVENLABS_ORIGIN);
		upstreamUrl.searchParams.set('agent_id', agentId);

		const upstream = await fetch(upstreamUrl, {
			method: 'GET',
			headers: {
				accept: 'application/json',
				'xi-api-key': apiKey
			},
			signal: request.signal
		});

		if (!upstream.ok) {
			const upstreamBody = await safeJson(upstream);
			const upstreamMessage = readUpstreamMessage(upstreamBody);
			console.error(
				`[svelte-elevenlabs] Signed URL request failed with HTTP ${upstream.status}${
					upstreamMessage ? `: ${upstreamMessage}` : '.'
				}`
			);

			if (upstream.status === 401 || upstream.status === 403) {
				return json(
					{
						error: {
							message:
								'ElevenLabs rejected the server API key. Check ELEVENLABS_API_KEY and make sure it belongs to the workspace that owns this agent.'
						}
					},
					{ status: 502, headers: { 'cache-control': 'no-store' } }
				);
			}

			if (upstream.status === 404) {
				return json(
					{
						error: {
							message:
								'That agent was not found. Check the agent id and that the API key can access the agent.'
						}
					},
					{ status: 404, headers: { 'cache-control': 'no-store' } }
				);
			}

			if (upstream.status === 429) {
				return json(
					{
						error: {
							message:
								'ElevenLabs is rate limiting signed URL requests. Wait a moment and try again.'
						}
					},
					{ status: 503, headers: { 'cache-control': 'no-store' } }
				);
			}

			return json(
				{
					error: {
						message:
							upstreamMessage ??
							'ElevenLabs could not create a signed URL. Check the server console for details.'
					}
				},
				{ status: 502, headers: { 'cache-control': 'no-store' } }
			);
		}

		const body = await safeJson(upstream);
		const signedUrl = readSignedUrl(body);

		if (!signedUrl) {
			console.error(
				'[svelte-elevenlabs] ElevenLabs returned an unexpected signed URL payload.',
				body
			);
			return json(
				{
					error: {
						message:
							'ElevenLabs returned an unexpected response instead of a signed URL. Check the agent configuration.'
					}
				},
				{ status: 502, headers: { 'cache-control': 'no-store' } }
			);
		}

		return json({ signed_url: signedUrl }, { headers: { 'cache-control': 'no-store, max-age=0' } });
	} catch (cause) {
		if (request.signal.aborted) {
			return json(
				{ error: { message: 'The signed URL request was cancelled.' } },
				{ status: 499, headers: { 'cache-control': 'no-store' } }
			);
		}

		console.error('[svelte-elevenlabs] Could not reach the ElevenLabs API.', cause);
		return json(
			{
				error: {
					message:
						'Could not reach ElevenLabs from the server. Check the network connection and try again.'
				}
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}
};

/** Parse JSON without assuming the upstream content type. */
async function safeJson(response: Response): Promise<unknown> {
	try {
		return (await response.json()) as unknown;
	} catch {
		return null;
	}
}

/** Read `signed_url` from a trusted-ish upstream payload. */
function readSignedUrl(body: unknown): string | null {
	if (!isRecord(body) || typeof body.signed_url !== 'string') return null;

	try {
		const parsed = new URL(body.signed_url);
		if (parsed.protocol !== 'wss:') return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

/** Extract a safe human message from an ElevenLabs error body. */
function readUpstreamMessage(body: unknown): string | null {
	if (!isRecord(body)) return null;

	if (isRecord(body.error) && typeof body.error.message === 'string') {
		return body.error.message.trim() || null;
	}
	if (typeof body.error === 'string') return body.error.trim() || null;
	if (typeof body.detail === 'string') return body.detail.trim() || null;
	if (typeof body.message === 'string') return body.message.trim() || null;
	return null;
}

/** Runtime object guard used for untrusted JSON. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
