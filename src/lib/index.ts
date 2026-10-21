/**
 * `svelte-elevenlabs` public entry point.
 *
 * The package ships a reactive Svelte 5 rune, a framework-agnostic audio
 * engine, optional ready-made UI, and the complete TypeScript surface for the
 * ElevenLabs Conversational AI protocol.
 *
 * @packageDocumentation
 */

export {
	ConversationController,
	createConversation,
	useConversation
} from './runes/useConversation.svelte.js';

export { getConversationContext, setConversationContext } from './runes/context.svelte.js';
export { useConversationClientTool } from './runes/useConversationClientTool.svelte.js';

export {
	AudioManager,
	AudioManagerError,
	decodeAudioChunk,
	decodePcm16,
	decodeUlaw,
	encodePcm16Base64,
	listAudioDevices,
	parseAudioFormat,
	resampleLinear,
	type AudioDeviceInfo,
	type AudioLevels,
	type AudioManagerErrorCode,
	type AudioManagerOptions
} from './audio/audioManager.js';

export { default as AudioVisualizer } from './components/AudioVisualizer.svelte';
export { default as ConversationProvider } from './components/ConversationProvider.svelte';
export { default as ConversationWidget } from './components/ConversationWidget.svelte';

export type {
	AgentChatResponsePartServerEvent,
	AgentResponseAttachment,
	AgentResponseCompleteServerEvent,
	AgentResponseCorrectionServerEvent,
	AgentResponseMetadataServerEvent,
	AgentResponseServerEvent,
	AgentToolRequestServerEvent,
	AgentToolResponseFullPayloadServerEvent,
	AgentToolResponseServerEvent,
	AudioAlignment,
	AudioEncoding,
	AudioEventPayload,
	AudioFormat,
	AudioFormatId,
	AudioServerEvent,
	BaseServerEvent,
	ClientErrorServerEvent,
	ClientEvent,
	ClientToolCallRequest,
	ClientToolCallServerEvent,
	ClientToolHandler,
	ClientToolResultClientEvent,
	ContextUsageServerEvent,
	ContextualUpdateClientEvent,
	ConversationConfigOverride,
	ConversationConnectionType,
	ConversationErrorCode,
	ConversationInitiationClientData,
	ConversationInitiationMetadata,
	ConversationInitiationMetadataEvent,
	ConversationMode,
	ConversationOptions,
	ConversationStatus,
	DebugEvent,
	DisconnectDetails,
	ErrorServerEvent,
	FeedbackClientEvent,
	GuardrailTriggeredServerEvent,
	InterruptionServerEvent,
	MCPToolApprovalHandler,
	MCPToolApprovalRequest,
	MCPToolApprovalRequestContext,
	McpConnectionStatusServerEvent,
	McpToolApprovalResultClientEvent,
	McpToolCallServerEvent,
	PingServerEvent,
	PongClientEvent,
	QueueStatus,
	QueueStatusServerEvent,
	ServerErrorPayload,
	ServerEvent,
	ServerLocation,
	StartConversationOptions,
	TranscriptMessage,
	TranscriptRole,
	UserActivityClientEvent,
	UserAudioChunkClientEvent,
	UserMessageClientEvent,
	UserTranscriptServerEvent,
	VadScoreServerEvent
} from './types/index.js';

export { ConversationError } from './types/index.js';
