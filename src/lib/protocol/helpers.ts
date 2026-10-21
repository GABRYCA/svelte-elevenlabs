import { ConversationError, type ServerEvent } from '../types/index.js';

const AGENT_ID_PATTERN = /^(agent|seng)_[A-Za-z0-9]+$/;

/** Default WebSocket origin used for public agent ids. */
export const ELEVENLABS_WEBSOCKET_ORIGIN = 'wss://api.elevenlabs.io';

/**
 * A validated conversation start target.
 *
 * The controller resolves this before it asks for microphone permission so a
 * configuration mistake cannot open a permission prompt for a session that can
 * never connect.
 */
export interface ConversationTarget {
	/** Public agent id or normalized WebSocket URL. */
	value: string;
	/** Whether the target should be exchanged for a signed URL first. */
	signed: boolean;
	/** Whether the target is already a WebSocket URL. */
	websocket: boolean;
}

/** Defaults used while validating a conversation start target. */
export interface ResolveConversationTargetOptions {
	/** Default public agent id. */
	agentId?: string;
	/** Default signed WebSocket URL. */
	signedUrl?: string;
	/** Whether a public agent id should use the signed URL exchange. */
	signed?: boolean;
}

const KNOWN_SERVER_EVENTS = new Set<ServerEvent['type']>([
	'conversation_initiation_metadata',
	'audio',
	'user_transcript',
	'agent_response',
	'agent_response_correction',
	'agent_chat_response_part',
	'agent_response_complete',
	'agent_response_metadata',
	'interruption',
	'vad_score',
	'ping',
	'client_error',
	'queue_status',
	'client_tool_call',
	'agent_tool_request',
	'agent_tool_response',
	'agent_tool_response_full_payload',
	'mcp_tool_call',
	'mcp_connection_status',
	'guardrail_triggered',
	'context_usage'
]);

/**
 * Resolve an explicit target, a configured signed URL, or a configured agent id
 * into a validated start target.
 *
 * @param target - Optional target supplied to `startConversation`.
 * @param options - Configured defaults and the signed mode flag.
 * @returns A normalized target ready for URL resolution.
 * @throws {ConversationError} When no target is configured or it is malformed.
 */
export function resolveConversationTarget(
	target: string | undefined,
	options: ResolveConversationTargetOptions = {}
): ConversationTarget {
	const chosen = target?.trim() || options.signedUrl?.trim() || options.agentId?.trim();
	if (!chosen) {
		throw new ConversationError(
			'invalid-target',
			'Provide an ElevenLabs agent ID or a signed WebSocket URL before starting a conversation.'
		);
	}

	if (/^(wss?|https?):\/\//i.test(chosen)) {
		return {
			value: normalizeWebSocketUrl(chosen),
			signed: false,
			websocket: true
		};
	}

	if (!AGENT_ID_PATTERN.test(chosen)) {
		throw new ConversationError(
			'invalid-target',
			'That does not look like an ElevenLabs agent ID. Agent IDs start with "agent_" (or "seng_" for speech engines).'
		);
	}

	return {
		value: chosen,
		signed: options.signed === true,
		websocket: false
	};
}

/**
 * Normalize http or https URLs to ws or wss and reject every other scheme.
 *
 * @param value - Candidate WebSocket URL.
 * @returns A normalized `ws://` or `wss://` URL string.
 * @throws {ConversationError} When the value is not a supported URL.
 */
export function normalizeWebSocketUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch (cause) {
		throw new ConversationError(
			'invalid-target',
			'That signed URL is not a valid URL. Request a fresh one from the server route.',
			cause
		);
	}

	if (url.protocol === 'https:') url.protocol = 'wss:';
	if (url.protocol === 'http:') url.protocol = 'ws:';
	if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
		throw new ConversationError(
			'invalid-target',
			'The conversation URL must use wss:// (or ws:// for local development).'
		);
	}
	return url.toString();
}

/**
 * Build the public agent WebSocket URL.
 *
 * @param agentId - Validated public agent id.
 * @param origin - WebSocket origin. Defaults to `wss://api.elevenlabs.io`.
 * @returns The conversation URL with an encoded agent id.
 */
export function buildAgentWebSocketUrl(
	agentId: string,
	origin: string = ELEVENLABS_WEBSOCKET_ORIGIN
): string {
	const base = origin.replace(/\/+$/, '');
	return `${base}/v1/convai/conversation?agent_id=${encodeURIComponent(agentId)}`;
}

/**
 * Parse a socket message without trusting its shape.
 *
 * @param data - Raw `MessageEvent.data` value.
 * @returns A known server event, or `null` for unknown or malformed input.
 */
export function parseServerEvent(data: unknown): ServerEvent | null {
	if (typeof data !== 'string') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		return null;
	}

	if (
		!isRecord(parsed) ||
		typeof parsed.type !== 'string' ||
		!KNOWN_SERVER_EVENTS.has(parsed.type as ServerEvent['type'])
	) {
		return null;
	}

	return parsed as unknown as ServerEvent;
}

/** Runtime object guard for untrusted JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract a human message from an API error body without assuming its shape.
 *
 * @param body - Parsed upstream response.
 * @returns The upstream message, or `null` when none is present.
 */
export function extractErrorMessage(body: unknown): string | null {
	if (!isRecord(body)) return null;
	const error = body.error;
	if (isRecord(error) && typeof error.message === 'string') return error.message;
	if (typeof error === 'string') return error;
	if (typeof body.message === 'string') return body.message;
	if (typeof body.detail === 'string') return body.detail;
	return null;
}

/**
 * Redact query strings from logs so signed tokens never reach the console.
 *
 * @param value - WebSocket or HTTP URL.
 * @returns The origin and path without query parameters or fragments.
 */
export function safeOrigin(value: string): string {
	try {
		const url = new URL(value);
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		return 'invalid-url';
	}
}

/**
 * Convert a close code and reason into an actionable message.
 *
 * @param code - WebSocket close code.
 * @param reason - Close reason supplied by the server.
 * @returns A human-readable explanation with a recovery hint when possible.
 */
export function closeMessage(code: number, reason: string): string {
	const detail = reason.trim();
	if (detail) {
		if (code === 1000) return `The conversation ended: ${detail}`;
		return `${detail} (WebSocket code ${code})`;
	}

	switch (code) {
		case 1000:
			return 'The conversation ended.';
		case 1001:
			return 'The agent went offline. Try starting a new conversation.';
		case 1006:
			return 'Lost the connection to ElevenLabs. Check your network and try again.';
		case 1008:
			return 'The agent rejected this session. Check the agent ID and its authentication settings.';
		case 1011:
			return 'The agent encountered an internal error. Try again.';
		case 1012:
			return 'The agent restarted. Start a new conversation to reconnect.';
		case 1013:
			return 'The agent is busy. Try again in a moment.';
		case 4000:
		case 4001:
		case 4002:
			return `The agent could not accept the session (code ${code}). Check the agent ID and signed URL configuration.`;
		default:
			return `The conversation closed unexpectedly (WebSocket code ${code}). Check the browser console for details.`;
	}
}

/**
 * Detect an AbortError without depending on DOMException instanceof quirks.
 *
 * @param value - Unknown thrown value.
 * @returns `true` when the value looks like an abort error.
 */
export function isAbortError(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		'name' in value &&
		(value as { name: unknown }).name === 'AbortError'
	);
}

/**
 * Round levels to three decimals to reduce needless reactive updates.
 *
 * @param value - Normalized level.
 * @returns A clamped value in the `0..1` range.
 */
export function roundLevel(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
