import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/routes/api/signed-url/+server.js';

type SignedUrlEvent = {
	url: URL;
	fetch: typeof fetch;
	request: Request;
	setHeaders: (headers: Record<string, string>) => void;
};

const handler = GET as unknown as (event: SignedUrlEvent) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function mockFetch(response: Response | Error) {
	return vi.fn<typeof fetch>().mockImplementation(async () => {
		if (response instanceof Error) throw response;
		return response;
	});
}

function createEvent(
	agentId: string | null,
	fetchImpl: typeof fetch,
	options: { aborted?: boolean } = {}
): SignedUrlEvent {
	const url = new URL('http://localhost/api/signed-url');
	if (agentId !== null) url.searchParams.set('agent_id', agentId);

	const abort = new AbortController();
	const request = new Request(url, { signal: abort.signal });
	if (options.aborted) abort.abort();

	return {
		url,
		fetch: fetchImpl,
		request,
		setHeaders: () => {
			// Header assertions use the actual Response object.
		}
	};
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
	return (await response.json()) as Record<string, unknown>;
}

describe('GET /api/signed-url', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.stubEnv('ELEVENLABS_API_KEY', 'test_key_123');
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		errorSpy.mockRestore();
	});

	it('rejects a missing agent id before calling ElevenLabs', async () => {
		const fetchMock = mockFetch(jsonResponse({}));
		const response = await handler(createEvent(null, fetchMock));

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(await readBody(response)).toEqual({
			error: { message: 'Add an agent_id query parameter before requesting a signed URL.' }
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects malformed agent ids without exposing the API key', async () => {
		const fetchMock = mockFetch(jsonResponse({}));
		const response = await handler(createEvent('agent-bad', fetchMock));
		const body = JSON.stringify(await readBody(response));

		expect(response.status).toBe(400);
		expect(body).toMatch(/not valid/);
		expect(body).not.toContain('test_key_123');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a clear server error when the API key is missing', async () => {
		vi.stubEnv('ELEVENLABS_API_KEY', '  ');
		const fetchMock = mockFetch(jsonResponse({}));
		const response = await handler(createEvent('agent_abc123', fetchMock));
		const body = (await readBody(response)) as { error: { message: string } };

		expect(response.status).toBe(500);
		expect(body.error.message).toMatch(/ELEVENLABS_API_KEY/);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledOnce();
	});

	it('exchanges a trimmed agent id for a signed URL', async () => {
		const signedUrl = 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_abc123';
		const fetchMock = mockFetch(jsonResponse({ signed_url: signedUrl }));
		const event = createEvent('  agent_abc123  ', fetchMock);
		const response = await handler(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toContain('no-store');
		const body = await readBody(response);
		expect(body).toEqual({ signed_url: signedUrl });
		expect(JSON.stringify(body)).not.toContain('test_key_123');
		expect(fetchMock).toHaveBeenCalledOnce();

		const [upstreamUrl, init] = fetchMock.mock.calls[0];
		expect(String(upstreamUrl)).toBe(
			'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_abc123'
		);
		expect(init?.method).toBe('GET');
		expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('test_key_123');
		expect(init?.signal).toBe(event.request.signal);
	});

	it('maps upstream authentication failures to a useful message', async () => {
		for (const status of [401, 403]) {
			const fetchMock = mockFetch(jsonResponse({ detail: 'Invalid API key' }, status));
			const response = await handler(createEvent('agent_abc123', fetchMock));
			const body = (await readBody(response)) as { error: { message: string } };

			expect(response.status).toBe(502);
			expect(body.error.message).toMatch(/rejected the server API key/);
			expect(JSON.stringify(body)).not.toContain('test_key_123');
		}
	});

	it('maps a missing agent to 404', async () => {
		const fetchMock = mockFetch(jsonResponse({ detail: 'Not found' }, 404));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(404);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/was not found/
		);
	});

	it('maps rate limits to 503', async () => {
		const fetchMock = mockFetch(jsonResponse({ detail: 'Slow down' }, 429));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(503);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/rate limiting/
		);
	});

	it('preserves a safe upstream message for other failures', async () => {
		const fetchMock = mockFetch(jsonResponse({ error: { message: 'Agent is disabled' } }, 500));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(502);
		expect(await readBody(response)).toEqual({
			error: { message: 'Agent is disabled' }
		});
	});

	it('uses a generic message when the upstream body is not JSON', async () => {
		const fetchMock = mockFetch(new Response('<html>bad gateway</html>', { status: 500 }));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(502);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/could not create a signed URL/
		);
	});

	it('rejects an unexpected success payload', async () => {
		const fetchMock = mockFetch(jsonResponse({ signed_url: 42 }));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(502);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/unexpected response/
		);
	});

	it('rejects a signed URL that is not wss', async () => {
		const fetchMock = mockFetch(
			jsonResponse({ signed_url: 'https://api.elevenlabs.io/v1/convai/conversation' })
		);
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(502);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/unexpected response/
		);
	});

	it('returns 502 when ElevenLabs cannot be reached', async () => {
		const fetchMock = mockFetch(new Error('network down'));
		const response = await handler(createEvent('agent_abc123', fetchMock));

		expect(response.status).toBe(502);
		expect(((await readBody(response)) as { error: { message: string } }).error.message).toMatch(
			/Could not reach ElevenLabs/
		);
		expect(errorSpy).toHaveBeenCalled();
	});

	it('returns 499 when the caller aborts the request', async () => {
		const fetchMock = mockFetch(new Error('aborted'));
		const response = await handler(createEvent('agent_abc123', fetchMock, { aborted: true }));

		expect(response.status).toBe(499);
		expect(await readBody(response)).toEqual({
			error: { message: 'The signed URL request was cancelled.' }
		});
	});
});
