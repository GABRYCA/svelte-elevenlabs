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
	/** Stable server response id for agent entries. */
	responseId?: string;
	/** Files attached to an agent response. */
	attachments?: AgentResponseAttachment[];
}

/** Server-side concurrency queue state, when the agent is waiting for a slot. */
export type QueueStatus = 'waiting' | 'admitted' | 'timed_out';

/**
 * ElevenLabs data residency location used for public agent ids.
 *
 * Signed URLs already point at the correct region, so this option only applies
 * when the client builds the WebSocket URL itself.
 */
export type ServerLocation = 'us' | 'eu-residency' | 'in-residency' | 'global';

/**
 * Transport requested through {@link ConversationOptions.connectionType}.
 *
 * This package implements the WebSocket transport. `webrtc` is part of the
 * type surface so a misconfigured app fails with a clear message instead of
 * silently changing transport.
 */
export type ConversationConnectionType = 'websocket' | 'webrtc';

/** A file attached to an agent response. */
export interface AgentResponseAttachment {
	/** Public or signed file URL. */
	url: string;
	/** Display name supplied by the agent. */
	name: string;
	/** Optional MIME type. */
	mime_type?: string | null;
}

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
	/** Token used to resume a persistent session, when the agent enables one. */
	persistent_session_token?: string;
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
		attachments?: AgentResponseAttachment[];
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
		response_id?: string;
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

/** Payload for an error reported by the agent. */
export interface ServerErrorPayload {
	/** WebSocket error or close code. */
	code: number;
	/** Legacy error name used by older protocol versions. */
	error_name?: string;
	/** Current protocol error category. */
	error_type?: string;
	/** Human-readable summary. */
	message?: string;
	/** Alternative human-readable reason. */
	reason?: string;
	/** Developer-facing diagnostic detail. */
	debug_message?: string;
	/** Structured error details, when the server supplies them. */
	details?: Record<string, unknown>;
}

/** A recoverable or fatal error reported by the agent. */
export interface ClientErrorServerEvent extends BaseServerEvent {
	type: 'client_error';
	error_event: ServerErrorPayload;
}

/** Current protocol name for an agent-reported error. */
export interface ErrorServerEvent extends BaseServerEvent {
	type: 'error';
	error_event: ServerErrorPayload;
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
	| ErrorServerEvent
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
	/**
	 * Whether the server is waiting for a `client_tool_result`.
	 *
	 * The current protocol sends this flag. Older payloads may omit it, in
	 * which case the controller still sends a result.
	 */
	expects_response?: boolean;
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

/** Positive or negative feedback for the current agent response. */
export interface FeedbackClientEvent {
	type: 'feedback';
	score: 'like' | 'dislike' | null;
	event_id: number;
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
	| McpToolApprovalResultClientEvent
	| FeedbackClientEvent;

/**
 * Handler for one named client tool.
 *
 * The first argument is the tool parameter object. The second argument is the
 * full protocol payload, which includes the call id and the `expects_response`
 * flag.
 */
export type ClientToolHandler = (
	parameters: Record<string, unknown>,
	call: ClientToolCallRequest
) => unknown | Promise<unknown>;

/**
 * An MCP tool call in the only state that can be answered with an approval.
 */
export interface MCPToolApprovalRequest {
	/** MCP service identifier. */
	service_id: string;
	/** Identifier echoed in `mcp_tool_approval_result`. */
	tool_call_id: string;
	/** Tool name shown to the user. */
	tool_name: string;
	/** Optional tool description. */
	tool_description?: string | null;
	/** Arguments the agent wants to pass to the tool. */
	parameters: Record<string, unknown>;
	/** Server timestamp, when supplied. */
	timestamp?: string;
	/** This request is always in the approval state. */
	state: 'awaiting_approval';
	/** Seconds before the server stops waiting for a decision. */
	approval_timeout_secs?: number;
	/** Existing result rows, if the server supplied them with the request. */
	result?: Array<Record<string, unknown>>;
	/** Existing error message, if the server supplied one. */
	error_message?: string;
}

/** Context passed to an MCP approval handler. */
export interface MCPToolApprovalRequestContext {
	/**
	 * Aborted when the decision can no longer reach the server, for example
	 * when the session ends or the tool call leaves the approval state.
	 */
	signal: AbortSignal;
}

/** Decides whether an MCP tool call may proceed. */
export type MCPToolApprovalHandler = (
	call: MCPToolApprovalRequest,
	context: MCPToolApprovalRequestContext
) => boolean | Promise<boolean>;

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
	/**
	 * Explicit WebSocket origin for public agents. Takes precedence over
	 * `serverLocation`. Defaults to the origin for `serverLocation`.
	 */
	origin?: string;
	/** Data residency used when building a URL for a public agent id. */
	serverLocation?: ServerLocation;
	/**
	 * Requested transport. Only `websocket` is implemented. Requesting
	 * `webrtc` fails with a `not-supported` error before microphone access.
	 */
	connectionType?: ConversationConnectionType;
	/**
	 * Run a text only session. Microphone permission and Web Audio contexts are
	 * skipped, and messages are exchanged as text over the WebSocket.
	 */
	textOnly?: boolean;
	/** Variables available to the ElevenLabs agent prompt. */
	dynamicVariables?: Record<string, string | number | boolean>;
	/** Stable end-user identifier for analytics and memory. */
	userId?: string;
	/** Per-session conversation configuration overrides. */
	overrides?: ConversationConfigOverride;
	/**
	 * Named client tools. The key is the tool name configured on the agent.
	 * Registered tools take precedence over {@link onClientToolCall}.
	 */
	clientTools?: Record<string, ClientToolHandler>;
	/**
	 * Fallback handler for `client_tool_call` events that do not match a named
	 * client tool. Return a string or a JSON serializable value.
	 */
	onClientToolCall?: (
		call: ClientToolCallRequest
	) =>
		| string
		| Record<string, unknown>
		| unknown[]
		| Promise<string | Record<string, unknown> | unknown[]>;
	/** Preferred microphone device id. */
	inputDeviceId?: string;
	/** Preferred output device id, when the browser supports output routing. */
	outputDeviceId?: string;
	/** Start the session with the microphone muted. */
	micMuted?: boolean;
	/** Initial playback gain from `0` to `1`. Defaults to `1`. */
	outputVolume?: number;
	/** Microphone chunk duration in milliseconds. Clamped to 50 to 250. Defaults to 100. */
	inputChunkDurationMs?: number;
	/** Flush agent audio locally as soon as the user starts speaking. Defaults to `true`. */
	interruptOnUserSpeech?: boolean;
	/** Normalized RMS threshold (0 to 1) for local voice activity detection. Defaults to `0.075`. */
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
	/** Called once the handshake metadata is available. */
	onConnect?: (details: { conversationId: string }) => void;
	/** Called when a transcript entry is created or updated. */
	onTranscript?: (message: TranscriptMessage) => void;
	/**
	 * Called with each transcript update. This is an alias for
	 * {@link onTranscript}, provided for API familiarity.
	 */
	onMessage?: (message: TranscriptMessage) => void;
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
	/** Called whenever the high-level conversation mode changes. */
	onModeChange?: (mode: ConversationMode) => void;
	/** Called when feedback becomes available or unavailable. */
	onCanSendFeedbackChange?: (canSendFeedback: boolean) => void;
	/** Called for the server side voice activity score. */
	onVadScore?: (score: number) => void;
	/** Called with every agent audio chunk before playback. */
	onAudio?: (base64: string) => void;
	/** Called when an audio chunk includes character timing data. */
	onAudioAlignment?: (alignment: AudioAlignment) => void;
	/** Called for each streaming part of an agent text response. */
	onAgentChatResponsePart?: (part: AgentChatResponsePartServerEvent['text_response_part']) => void;
	/** Called when the server corrects a previous agent response. */
	onAgentResponseCorrection?: (
		payload: AgentResponseCorrectionServerEvent['agent_response_correction_event']
	) => void;
	/** Called when the agent finishes a response. */
	onAgentResponseComplete?: (eventId: number) => void;
	/** Called when the agent sends response metadata. */
	onAgentResponseMetadata?: (
		metadata: AgentResponseMetadataServerEvent['agent_response_metadata_event']
	) => void;
	/** Called for each keep-alive ping. The client answers automatically. */
	onPing?: (ping: PingServerEvent['ping_event']) => void;
	/** Called when the server reports LLM context window usage. */
	onContextUsage?: (usage: ContextUsageServerEvent['context_usage_event']) => void;
	/** Called for every MCP tool call lifecycle update. */
	onMCPToolCall?: (call: McpToolCallServerEvent['mcp_tool_call']) => void;
	/** Called when MCP integration connection status changes. */
	onMCPConnectionStatus?: (status: McpConnectionStatusServerEvent['mcp_connection_status']) => void;
	/**
	 * Decides whether an MCP tool call in `awaiting_approval` may proceed.
	 * The controller sends exactly one `mcp_tool_approval_result` for each call.
	 */
	onMCPToolApprovalRequest?: MCPToolApprovalHandler;
	/** Called when the agent requests a server side tool. */
	onAgentToolRequest?: (request: AgentToolRequestServerEvent['agent_tool_request']) => void;
	/** Called when an agent tool call finishes. */
	onAgentToolResponse?: (
		response:
			| AgentToolResponseServerEvent['agent_tool_response']
			| AgentToolResponseFullPayloadServerEvent['agent_tool_response_full_payload']
	) => void;
	/** Called when a guardrail fires. */
	onGuardrailTriggered?: (
		event: GuardrailTriggeredServerEvent['guardrail_triggered_event']
	) => void;
	/** Called with the initiation metadata before audio starts. */
	onConversationMetadata?: (metadata: ConversationInitiationMetadata) => void;
	/** Called for every parsed incoming protocol event. */
	onIncomingEvent?: (event: ServerEvent) => void;
	/** Called for every outgoing protocol event. */
	onOutgoingEvent?: (event: ClientEvent) => void;
	/** Called when a client tool has no matching named or fallback handler. */
	onUnhandledClientToolCall?: (call: ClientToolCallRequest) => void;
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
	/**
	 * Run this session in text only mode, overriding the controller default.
	 * Microphone permission and Web Audio contexts are skipped.
	 */
	textOnly?: boolean;
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
	| 'protocol-error'
	| 'device-not-found'
	| 'device-busy'
	| 'device-constraints'
	| 'device-switch-failed';

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
