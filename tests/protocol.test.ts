import { describe, expect, it } from 'vitest';
import {
	buildAgentWebSocketUrl,
	closeMessage,
	ELEVENLABS_WEBSOCKET_ORIGIN,
	extractErrorMessage,
	getServerLocationOrigin,
	isAbortError,
	isRecord,
	isServerLocation,
	normalizeWebSocketUrl,
	parseServerEvent,
	resolveConversationTarget,
	roundLevel,
	safeOrigin,
	SERVER_LOCATIONS
} from '../src/lib/protocol/helpers.js';
import { ConversationError } from '../src/lib/types/index.js';

describe('resolveConversationTarget', () => {
	it('accepts a public agent id and keeps the signed flag', () => {
		expect(resolveConversationTarget('agent_abc123', { signed: true })).toEqual({
			value: 'agent_abc123',
			signed: true,
			websocket: false
		});
	});

	it('accepts a speech engine id', () => {
		expect(resolveConversationTarget('seng_abc123')).toEqual({
			value: 'seng_abc123',
			signed: false,
			websocket: false
		});
	});

	it('prefers an explicit target over configured defaults', () => {
		expect(
			resolveConversationTarget(' agent_explicit ', {
				agentId: 'agent_default',
				signedUrl: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_configured'
			})
		).toEqual({
			value: 'agent_explicit',
			signed: false,
			websocket: false
		});
	});

	it('falls back to a configured signed URL before a configured agent id', () => {
		const target = resolveConversationTarget(undefined, {
			agentId: 'agent_default',
			signedUrl: 'https://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_signed'
		});

		expect(target).toEqual({
			value: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_signed',
			signed: false,
			websocket: true
		});
	});

	it('falls back to a configured agent id', () => {
		expect(resolveConversationTarget(undefined, { agentId: 'agent_default' })).toEqual({
			value: 'agent_default',
			signed: false,
			websocket: false
		});
	});

	it('normalizes HTTP and HTTPS conversation URLs', () => {
		expect(resolveConversationTarget('https://example.com/session?token=abc')).toEqual({
			value: 'wss://example.com/session?token=abc',
			signed: false,
			websocket: true
		});
		expect(resolveConversationTarget('http://localhost:8787/session')).toEqual({
			value: 'ws://localhost:8787/session',
			signed: false,
			websocket: true
		});
	});

	it('rejects missing, malformed, and non-WebSocket targets', () => {
		expect(() => resolveConversationTarget(undefined)).toThrow(ConversationError);
		expect(() => resolveConversationTarget('agent-abc')).toThrow(/does not look like/);
		expect(() => resolveConversationTarget('ftp://example.com/socket')).toThrow(
			/does not look like/
		);
		expect(() => resolveConversationTarget('not a url')).toThrow(/does not look like/);
	});

	it('reports invalid-target for empty input', () => {
		try {
			resolveConversationTarget('   ');
			throw new Error('Expected resolveConversationTarget to throw.');
		} catch (cause) {
			expect(cause).toBeInstanceOf(ConversationError);
			expect((cause as ConversationError).code).toBe('invalid-target');
		}
	});
});

describe('normalizeWebSocketUrl', () => {
	it('returns WebSocket URLs unchanged', () => {
		expect(normalizeWebSocketUrl('wss://api.elevenlabs.io/session?token=abc')).toBe(
			'wss://api.elevenlabs.io/session?token=abc'
		);
	});

	it('preserves query strings and ports while changing the scheme', () => {
		expect(normalizeWebSocketUrl('https://example.com:8443/session?token=abc')).toBe(
			'wss://example.com:8443/session?token=abc'
		);
	});

	it('rejects malformed URLs and unsupported schemes', () => {
		expect(() => normalizeWebSocketUrl('not-a-url')).toThrow(/not a valid URL/);
		expect(() => normalizeWebSocketUrl('file:///tmp/socket')).toThrow(/must use wss:\/\//);
	});
});

describe('buildAgentWebSocketUrl', () => {
	it('uses the default origin and encodes the agent id', () => {
		expect(buildAgentWebSocketUrl('agent_abc123')).toBe(
			`${ELEVENLABS_WEBSOCKET_ORIGIN}/v1/convai/conversation?agent_id=agent_abc123`
		);
	});

	it('trims trailing slashes from a custom origin', () => {
		expect(buildAgentWebSocketUrl('agent_abc123', 'ws://localhost:8787///')).toBe(
			'ws://localhost:8787/v1/convai/conversation?agent_id=agent_abc123'
		);
	});
});

describe('server locations', () => {
	it('maps every supported location to a WebSocket origin', () => {
		expect(getServerLocationOrigin('us')).toBe(ELEVENLABS_WEBSOCKET_ORIGIN);
		expect(getServerLocationOrigin('global')).toBe(ELEVENLABS_WEBSOCKET_ORIGIN);
		expect(getServerLocationOrigin('eu-residency')).toBe('wss://api.eu.residency.elevenlabs.io');
		expect(getServerLocationOrigin('in-residency')).toBe('wss://api.in.residency.elevenlabs.io');
		expect(getServerLocationOrigin(undefined)).toBe(ELEVENLABS_WEBSOCKET_ORIGIN);
	});

	it('recognizes only documented residency values', () => {
		for (const location of SERVER_LOCATIONS) {
			expect(isServerLocation(location)).toBe(true);
		}

		expect(isServerLocation('us-east')).toBe(false);
		expect(isServerLocation('')).toBe(false);
		expect(isServerLocation(null)).toBe(false);
	});

	it('falls back to the US origin for an unknown runtime value', () => {
		expect(getServerLocationOrigin('us-east' as never)).toBe(ELEVENLABS_WEBSOCKET_ORIGIN);
	});
});

describe('parseServerEvent', () => {
	it('parses known events and keeps their payload', () => {
		const event = parseServerEvent(
			JSON.stringify({ type: 'ping', ping_event: { event_id: 7, ping_ms: 100 } })
		);

		expect(event).toEqual({ type: 'ping', ping_event: { event_id: 7, ping_ms: 100 } });
	});

	it('parses metadata and tool events', () => {
		expect(
			parseServerEvent(
				JSON.stringify({
					type: 'conversation_initiation_metadata',
					conversation_initiation_metadata_event: {
						conversation_id: 'conv_123',
						agent_output_audio_format: 'pcm_16000',
						user_input_audio_format: 'pcm_16000'
					}
				})
			)?.type
		).toBe('conversation_initiation_metadata');

		expect(
			parseServerEvent(
				JSON.stringify({
					type: 'client_tool_call',
					client_tool_call: {
						tool_name: 'lookup_order',
						tool_call_id: 'call_1',
						parameters: {},
						event_id: 2,
						expects_response: true
					}
				})
			)?.type
		).toBe('client_tool_call');
	});

	it('parses current protocol error events', () => {
		const event = parseServerEvent(
			JSON.stringify({
				type: 'error',
				error_event: {
					code: 1002,
					error_type: 'max_duration_exceeded',
					message: 'Maximum call duration reached.'
				}
			})
		);

		expect(event).toEqual({
			type: 'error',
			error_event: {
				code: 1002,
				error_type: 'max_duration_exceeded',
				message: 'Maximum call duration reached.'
			}
		});
	});

	it('ignores unknown, malformed, and non-string messages', () => {
		expect(parseServerEvent(JSON.stringify({ type: 'future_event' }))).toBeNull();
		expect(parseServerEvent('{')).toBeNull();
		expect(parseServerEvent('')).toBeNull();
		expect(parseServerEvent(null)).toBeNull();
		expect(parseServerEvent(42)).toBeNull();
		expect(parseServerEvent(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(parseServerEvent(JSON.stringify(['ping']))).toBeNull();
		expect(parseServerEvent(JSON.stringify({ type: 42 }))).toBeNull();
		expect(parseServerEvent(JSON.stringify({ ping_event: { event_id: 1 } }))).toBeNull();
	});
});

describe('extractErrorMessage', () => {
	it('reads every supported upstream error shape', () => {
		expect(extractErrorMessage({ error: { message: ' Nested ' } })).toBe(' Nested ');
		expect(extractErrorMessage({ error: 'String error' })).toBe('String error');
		expect(extractErrorMessage({ message: 'Top level' })).toBe('Top level');
		expect(extractErrorMessage({ detail: 'Detail' })).toBe('Detail');
	});

	it('returns null for unknown shapes', () => {
		expect(extractErrorMessage(null)).toBeNull();
		expect(extractErrorMessage('error')).toBeNull();
		expect(extractErrorMessage([])).toBeNull();
		expect(extractErrorMessage({ error: { code: 401 } })).toBeNull();
	});
});

describe('safeOrigin', () => {
	it('removes signed query strings before logging', () => {
		expect(safeOrigin('wss://api.elevenlabs.io/v1/convai/conversation?token=secret')).toBe(
			'wss://api.elevenlabs.io/v1/convai/conversation'
		);
	});

	it('handles invalid input without throwing', () => {
		expect(safeOrigin('not a url')).toBe('invalid-url');
	});
});

describe('closeMessage', () => {
	it('uses the server reason when one is supplied', () => {
		expect(closeMessage(1000, ' Normal close ')).toBe('The conversation ended: Normal close');
		expect(closeMessage(4000, 'Bad request')).toBe('Bad request (WebSocket code 4000)');
	});

	it('maps common close codes to actionable messages', () => {
		expect(closeMessage(1000, '')).toBe('The conversation ended.');
		expect(closeMessage(1001, '')).toMatch(/went offline/);
		expect(closeMessage(1006, '')).toMatch(/Lost the connection/);
		expect(closeMessage(1008, '')).toMatch(/rejected this session/);
		expect(closeMessage(1011, '')).toMatch(/internal error/);
		expect(closeMessage(1012, '')).toMatch(/restarted/);
		expect(closeMessage(1013, '')).toMatch(/busy/);
		expect(closeMessage(4001, '')).toMatch(/could not accept/);
		expect(closeMessage(4999, '')).toMatch(/unexpectedly/);
	});
});

describe('small guards', () => {
	it('detects abort errors without relying on DOMException', () => {
		expect(isAbortError({ name: 'AbortError' })).toBe(true);
		expect(isAbortError(new Error('AbortError'))).toBe(false);
		expect(isAbortError(null)).toBe(false);
		expect(isAbortError('AbortError')).toBe(false);
	});

	it('clamps and rounds reactive levels', () => {
		expect(roundLevel(-1)).toBe(0);
		expect(roundLevel(0.12345)).toBe(0.123);
		expect(roundLevel(0.9999)).toBe(1);
		expect(roundLevel(Number.POSITIVE_INFINITY)).toBe(1);
	});

	it('recognizes records only', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord([])).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord('value')).toBe(false);
	});
});
