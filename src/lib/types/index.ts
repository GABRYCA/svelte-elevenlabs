/**
 * Public type surface for `svelte-elevenlabs`.
 *
 * Every shape below mirrors the ElevenLabs Conversational AI WebSocket
 * protocol (v1) or one of this library's public APIs. The interfaces are
 * intentionally hand-written: they document the wire format, keep the client
 * bundle small, and can be updated independently of ElevenLabs' SDK release
 * cadence.
 */

/* -------------------------------------------------------------------------- */
/*                                  Audio                                     */
/* -------------------------------------------------------------------------- */

/**
 * Audio formats supported by the ElevenLabs Conversational AI WebSocket.
 *
 * The server negotiates both directions in its
 * `conversation_initiation_metadata` event. Do not assume 16 kHz: read the
 * negotiated format and pass it to the audio manager.
 */
export type AudioFormatId =
	'pcm_8000' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100' | 'pcm_48000' | 'ulaw_8000';

/** Codec family used by an ElevenLabs audio stream. */
export type AudioEncoding = 'pcm' | 'ulaw';

/**
 * A parsed, validated audio format descriptor.
 *
 * `pcm` audio is signed 16-bit little-endian mono unless stated otherwise by
 * the negotiated event. `ulaw` audio is 8-bit G.711 µ-law mono.
 */
export interface AudioFormat {
	/** Codec family. */
	encoding: AudioEncoding;
	/** Samples per second, e.g. `16000`. */
	sampleRate: number;
	/** ElevenLabs conversational audio is always mono. */
	channels: 1;
}

/* -------------------------------------------------------------------------- */
/*                              Conversation state                            */
/* -------------------------------------------------------------------------- */

/**
 * Connection lifecycle exposed by {@link ConversationController}.
 *
 * - `connecting`: the microphone is being prepared, the signed URL is being
 *   fetched, or the WebSocket handshake is in flight.
 * - `connected`: the server sent its metadata and audio can flow.
 * - `disconnected`: no socket or audio graph is active.
 */
export type ConversationStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * High-level conversation mode derived from audio activity.
 *
 * Use this for a single UI label; use the individual booleans when you need
 * to drive separate animations.
 */
export type ConversationMode = 'disconnected' | 'connecting' | 'ready' | 'listening' | 'speaking';

/** Speaker role attached to a transcript entry. */
export type TranscriptRole = 'user' | 'agent';

/**
 * A single rendered transcript entry.
 *
 * Entries are stable across streaming updates: the same `id` is updated as
 * the agent emits `agent_chat_response_part` deltas.
 */
export interface TranscriptMessage {
	/** Stable client-side identifier. */
	id: string;
	/** Who said it. */
	role: TranscriptRole;
	/** Current text. May be partial while `isFinal` is false. */
	text: string;
	/** Whether the server has finished this turn. */
	isFinal: boolean;
	/** Unix timestamp (milliseconds) when the entry was first created. */
	timestamp: number;
	/** ElevenLabs event id, when the server supplied one. */
	eventId?: number;
}

/** Server-side concurrency queue state, when the agent is waiting for a slot. */
export type QueueStatus = 'waiting' | 'admitted' | 'timed_out';

/* -------------------------------------------------------------------------- */
/*                             Server -> client                               */
/* -------------------------------------------------------------------------- */

/** Fields shared by every server event. */
export interface BaseServerEvent {
	/** Discriminator used by the protocol. */
	type: string;
}

/** Metadata sent immediately after the WebSocket handshake. */
export interface ConversationInitiationMetadata {
	/** ElevenLabs conversation identifier, useful for support and analytics. */
	conversation_id: string;
	/** Format the agent will use for its output stream. */
	agent_output_audio_format: AudioFormatId;
	/** Format the server expects for microphone input. */
	user_input_audio_format: AudioFormatId;
}

/** Negotiated formats for a newly opened conversation. */
export interface ConversationInitiationMetadataEvent extends BaseServerEvent {
	type: 'conversation_initiation_metadata';
	conversation_initiation_metadata_event: ConversationInitiationMetadata;
}

/** Character-level timing for a synthesized audio chunk. */
export interface AudioAlignment {
	chars: string[];
	char_start_times_ms: number[];
	char_durations_ms: number[];
}

/** A base64-encoded chunk of agent audio. */
export interface AudioEventPayload {
	audio_base_64: string;
	event_id: number;
	/** True on the final chunk of the current response. */
	is_final?: boolean;
	alignment?: AudioAlignment;
}

/** Streamed agent audio. */
export interface AudioServerEvent extends BaseServerEvent {
	type: 'audio';
	audio_event: AudioEventPayload;
}

/** Final transcription of the user's last turn. */
export interface UserTranscriptServerEvent extends BaseServerEvent {
	type: 'user_transcript';
	user_transcription_event: {
		user_transcript: string;
		event_id: number;
	};
}

/** Final agent response text. */
export interface AgentResponseServerEvent extends BaseServerEvent {
	type: 'agent_response';
	agent_response_event: {
		agent_response: string;
		event_id: number;
		response_id?: string;
		response_type?: 'text' | 'voice';
		in_response_to_ids?: string[];
		attachments?: Array<{ url: string; name: string; mime_type?: string }>;
	};
}

/** A correction to a previously delivered agent response. */
export interface AgentResponseCorrectionServerEvent extends BaseServerEvent {
	type: 'agent_response_correction';
	agent_response_correction_event: {
		original_agent_response: string;
		corrected_agent_response: string;
		event_id: number;
		response_id?: string;
	};
}

/** Streaming text part of an agent response, when enabled on the agent. */
export interface AgentChatResponsePartServerEvent extends BaseServerEvent {
	type: 'agent_chat_response_part';
	text_response_part: {
		type: 'start' | 'delta' | 'stop';
		text: string;
		event_id: number;
		response_id: string;
	};
}

/** The agent has finished generating text for a response. */
export interface AgentResponseCompleteServerEvent extends BaseServerEvent {
	type: 'agent_response_complete';
	agent_response_complete_event: {
		event_id: number;
	};
}

/** Optional per-response metadata supplied by the agent. */
export interface AgentResponseMetadataServerEvent extends BaseServerEvent {
	type: 'agent_response_metadata';
	agent_response_metadata_event: {
		metadata: Record<string, unknown>;
		event_id: number;
	};
}

/** The user interrupted the agent; buffers should be flushed immediately. */
export interface InterruptionServerEvent extends BaseServerEvent {
	type: 'interruption';
	interruption_event: {
		event_id: number;
		reason?: string;
	};
}

/** Server-side voice activity score. */
export interface VadScoreServerEvent extends BaseServerEvent {
	type: 'vad_score';
	vad_score_event: {
		vad_score: number;
	};
}

/** Keep-alive request; answer with a `pong` carrying the same event id. */
export interface PingServerEvent extends BaseServerEvent {
	type: 'ping';
	ping_event: {
		event_id: number;
		/** Suggested delay before replying, in milliseconds. */
		ping_ms?: number;
	};
}

/** A recoverable or fatal error reported by the agent. */
export interface ClientErrorServerEvent extends BaseServerEvent {
	type: 'client_error';
	error_event: {
		code: number;
		error_name: string;
		message?: string;
	};
}

/** Queue state when the agent is at its concurrency limit. */
export interface QueueStatusServerEvent extends BaseServerEvent {
	type: 'queue_status';
	queue_status_event: {
		status: QueueStatus;
	};
}

/** A client-side tool invocation that may expect a result. */
export interface ClientToolCallServerEvent extends BaseServerEvent {
	type: 'client_tool_call';
	client_tool_call: ClientToolCallRequest;
}

/** A request from the server to execute a registered agent tool. */
export interface AgentToolRequestServerEvent extends BaseServerEvent {
	type: 'agent_tool_request';
	agent_tool_request: {
		tool_name: string;
		tool_call_id: string;
		tool_type: string;
		event_id: number;
		expects_response: boolean;
		disable_interruptions: boolean;
		response_timeout_secs: number;
		execution_mode: string;
	};
}

/** Status update for an agent-side tool call. */
export interface AgentToolResponseServerEvent extends BaseServerEvent {
	type: 'agent_tool_response';
	agent_tool_response: {
		tool_name: string;
		tool_call_id: string;
		tool_type: string;
		is_error: boolean;
		is_blocked?: boolean;
		event_id: number;
		is_called: boolean;
		status: 'success' | 'error' | 'blocked' | 'skipped';
	};
}

/** Full payload version of {@link AgentToolResponseServerEvent}. */
export interface AgentToolResponseFullPayloadServerEvent extends BaseServerEvent {
	type: 'agent_tool_response_full_payload';
	agent_tool_response_full_payload: AgentToolResponseServerEvent['agent_tool_response'] & {
		full_tool_result: string;
		truncated?: boolean;
	};
}

/** An MCP tool call lifecycle update. */
export interface McpToolCallServerEvent extends BaseServerEvent {
	type: 'mcp_tool_call';
	mcp_tool_call: {
		service_id: string;
		tool_call_id: string;
		tool_name: string;
		tool_description?: string | null;
		parameters: Record<string, unknown>;
		timestamp?: string;
		state: 'loading' | 'awaiting_approval' | 'success' | 'failure';
		approval_timeout_secs?: number;
		result?: Array<Record<string, unknown>>;
		error_message?: string;
	};
}

/** Connection status for the MCP integrations attached to the agent. */
export interface McpConnectionStatusServerEvent extends BaseServerEvent {
	type: 'mcp_connection_status';
	mcp_connection_status: {
		integrations: Array<{
			integration_id: string;
			integration_type: 'mcp_server' | 'mcp_integration';
			is_connected: boolean;
			tool_count?: number;
		}>;
	};
}

/** A guardrail fired during the conversation. */
export interface GuardrailTriggeredServerEvent extends BaseServerEvent {
	type: 'guardrail_triggered';
	guardrail_triggered_event: {
		guardrail_name: string;
	};
}

/** Token usage for the latest LLM turn. */
export interface ContextUsageServerEvent extends BaseServerEvent {
	type: 'context_usage';
	context_usage_event: {
		event_id: number;
		model: string;
		context_tokens: number;
		context_limit_tokens: number;
	};
}

/**
 * Discriminated union of every server event this library understands.
 *
 * Unknown future events are ignored safely by the parser. The union can be
 * extended without changing the public controller API.
 */
export type ServerEvent =
	| ConversationInitiationMetadataEvent
	| AudioServerEvent
	| UserTranscriptServerEvent
	| AgentResponseServerEvent
	| AgentResponseCorrectionServerEvent
	| AgentChatResponsePartServerEvent
	| AgentResponseCompleteServerEvent
	| AgentResponseMetadataServerEvent
	| InterruptionServerEvent
	| VadScoreServerEvent
	| PingServerEvent
	| ClientErrorServerEvent
	| QueueStatusServerEvent
	| ClientToolCallServerEvent
	| AgentToolRequestServerEvent
	| AgentToolResponseServerEvent
	| AgentToolResponseFullPayloadServerEvent
	| McpToolCallServerEvent
	| McpConnectionStatusServerEvent
	| GuardrailTriggeredServerEvent
	| ContextUsageServerEvent;

/** Payload of a client-side tool invocation. */
export interface ClientToolCallRequest {
	/** Registered tool name. */
	tool_name: string;
	/** Identifier that must be echoed in the result. */
	tool_call_id: string;
	/** JSON-compatible arguments supplied by the agent. */
	parameters: Record<string, unknown>;
	/** Event identifier used for ordering. */
	event_id: number;
	/** Whether the server is waiting for a `client_tool_result`. */
	expects_response: boolean;
}

/* -------------------------------------------------------------------------- */
/*                             Client -> server                               */
/* -------------------------------------------------------------------------- */

/** Configuration overrides sent at the start of a session. */
export interface ConversationConfigOverride {
	agent?: {
		first_message?: string;
		language?: string;
		max_conversation_duration_message?: string;
		prompt?: {
			prompt?: string;
			llm?: string;
			tool_ids?: string[];
			knowledge_base?: Array<{
				type: 'file' | 'url' | 'text' | 'folder';
				name: string;
				id: string;
				usage_mode?: 'prompt' | 'auto';
			}>;
		};
	};
	tts?: {
		model_id?: string;
		voice_id?: string;
		stability?: number;
		speed?: number;
		similarity_boost?: number;
	};
	asr?: {
		keywords?: string[];
	};
	turn?: {
		soft_timeout_config?: {
			message?: string;
			additional_soft_timeout_messages?: string[];
		};
	};
	conversation?: {
		text_only?: boolean;
		max_duration_seconds?: number;
	};
}

/**
 * First frame sent by the client. It must be sent immediately after the
 * WebSocket opens, before any microphone audio.
 */
export interface ConversationInitiationClientData {
	type: 'conversation_initiation_client_data';
	conversation_config_override?: ConversationConfigOverride;
	dynamic_variables?: Record<string, string | number | boolean>;
	user_id?: string;
	custom_llm_extra_body?: Record<string, unknown>;
	environment?: string;
}

/** Base64-encoded PCM/µ-law microphone audio. */
export interface UserAudioChunkClientEvent {
	user_audio_chunk: string;
}

/** Keep-alive reply. */
export interface PongClientEvent {
	type: 'pong';
	event_id: number;
}

/** Optional text message injected as a user turn. */
export interface UserMessageClientEvent {
	type: 'user_message';
	text: string;
	user_identifier?: string;
	source_medium?: 'audio' | 'dtmf' | 'text' | 'image' | 'file';
}

/** Signals that the user became active (used by some agent workflows). */
export interface UserActivityClientEvent {
	type: 'user_activity';
}

/** Non-interrupting context injected into the conversation. */
export interface ContextualUpdateClientEvent {
	type: 'contextual_update';
	text: string;
	context_id?: string;
}

/** Result of a client-side tool execution. */
export interface ClientToolResultClientEvent {
	type: 'client_tool_result';
	tool_call_id: string;
	result: string;
	is_error: boolean;
	error_type?:
		| 'user_rejected'
		| 'external_server'
		| 'external_client'
		| 'customer_auth'
		| 'client_timeout'
		| 'unknown';
}

/** User approval decision for an MCP tool call. */
export interface McpToolApprovalResultClientEvent {
	type: 'mcp_tool_approval_result';
	tool_call_id: string;
	is_approved: boolean;
}

/** Every frame this library can send to the agent. */
export type ClientEvent =
	| ConversationInitiationClientData
	| UserAudioChunkClientEvent
	| PongClientEvent
	| UserMessageClientEvent
	| UserActivityClientEvent
	| ContextualUpdateClientEvent
	| ClientToolResultClientEvent
	| McpToolApprovalResultClientEvent;

/* -------------------------------------------------------------------------- */
/*                              Public API types                              */
/* -------------------------------------------------------------------------- */

/** Options accepted by {@link useConversation} and {@link ConversationController}. */
export interface ConversationOptions {
	/** Default public agent id, used when `startConversation()` gets no target. */
	agentId?: string;
	/** Default signed WebSocket URL, used when no target is supplied. */
	signedUrl?: string;
	/**
	 * Same-origin route that exchanges an agent id for a signed URL.
	 * Defaults to `/api/signed-url` when signed mode is requested.
	 */
	signedUrlEndpoint?: string;
	/** WebSocket origin for public agents. Defaults to `wss://api.elevenlabs.io`. */
	origin?: string;
	/** Variables available to the ElevenLabs agent prompt. */
	dynamicVariables?: Record<string, string | number | boolean>;
	/** Stable end-user identifier for analytics and memory. */
	userId?: string;
	/** Per-session conversation configuration overrides. */
	overrides?: ConversationConfigOverride;
	/** Handler for `client_tool_call` events. Return a string or JSON value. */
	onClientToolCall?: (
		call: ClientToolCallRequest
	) =>
		| string
		| Record<string, unknown>
		| unknown[]
		| Promise<string | Record<string, unknown> | unknown[]>;
	/** Microphone chunk duration in milliseconds. Clamped to 50–250. Defaults to 100. */
	inputChunkDurationMs?: number;
	/** Flush agent audio locally as soon as the user starts speaking. Defaults to `true`. */
	interruptOnUserSpeech?: boolean;
	/** Normalized RMS threshold (0–1) for local voice activity detection. Defaults to `0.075`. */
	vadThreshold?: number;
	/** Maximum retained transcript entries. Defaults to `250`. */
	maxTranscripts?: number;
	/** Clear transcripts when a new session starts. Defaults to `true`. */
	resetTranscriptsOnStart?: boolean;
	/** Register an `$effect` teardown that destroys the controller on unmount. Defaults to `true`. */
	autoCleanup?: boolean;
	/** Emit verbose protocol logs through `console.debug`. Defaults to `false`. */
	debug?: boolean;
	/** Called whenever the connection status changes. */
	onStatusChange?: (status: ConversationStatus) => void;
	/** Called when a transcript entry is created or updated. */
	onTranscript?: (message: TranscriptMessage) => void;
	/** Called with a human-readable error after the controller has cleaned up. */
	onError?: (error: ConversationError) => void;
	/** Called with the latest time-to-first-audio measurement, in milliseconds. */
	onLatency?: (milliseconds: number) => void;
	/** Called when agent playback is interrupted (server or local VAD). */
	onInterruption?: () => void;
	/** Called when the conversation ends, including a client-initiated stop. */
	onDisconnect?: (details: DisconnectDetails) => void;
	/** Called once the negotiation metadata supplies the conversation id. */
	onConversationId?: (conversationId: string) => void;
	/** Low-level protocol diagnostics, useful in development. */
	onDebug?: (event: DebugEvent) => void;
}

/** Optional per-call overrides for {@link ConversationController.startConversation}. */
export interface StartConversationOptions {
	/**
	 * Fetch a signed URL from `signedUrlEndpoint` before connecting.
	 * Ignored when the target is already a `ws://` or `wss://` URL.
	 */
	signed?: boolean;
}

/** Why and how a conversation socket closed. */
export interface DisconnectDetails {
	/** WebSocket close code. */
	code: number;
	/** Close reason supplied by the server, if any. */
	reason: string;
	/** True when the client initiated the close. */
	expected: boolean;
}

/** A low-level, redacted debug event. */
export interface DebugEvent {
	/** Short machine-readable category, e.g. `socket:message`. */
	kind: string;
	/** Human-readable description without transcript or credential data. */
	message: string;
	/** Optional structured data safe to print. */
	data?: Record<string, unknown>;
}

/** Machine-readable failure categories surfaced by the controller. */
export type ConversationErrorCode =
	| 'not-supported'
	| 'insecure-context'
	| 'permission-denied'
	| 'audio-failed'
	| 'invalid-target'
	| 'signed-url-failed'
	| 'connection-failed'
	| 'connection-timeout'
	| 'server-closed'
	| 'protocol-error';

/**
 * Error thrown internally and surfaced through `error` / `onError`.
 *
 * The message is safe to show to an end user; the `cause` is intended for
 * developers and may contain browser or network details.
 */
export class ConversationError extends Error {
	/** Stable category for branching in UI code. */
	readonly code: ConversationErrorCode;
	/** Original error, when one exists. */
	readonly cause?: unknown;

	/**
	 * @param code - Stable failure category.
	 * @param message - Human-readable message safe for UI display.
	 * @param cause - Optional original error for debugging.
	 */
	constructor(code: ConversationErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = 'ConversationError';
		this.code = code;
		this.cause = cause;
	}
}
