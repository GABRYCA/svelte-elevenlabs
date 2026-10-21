import { BROWSER } from 'esm-env';
import {
	AudioManager,
	AudioManagerError,
	listAudioDevices,
	parseAudioFormat,
	type AudioDeviceInfo
} from '../audio/audioManager.js';
import {
	buildAgentWebSocketUrl,
	closeMessage,
	extractErrorMessage,
	getServerLocationOrigin,
	isAbortError,
	isRecord,
	normalizeWebSocketUrl,
	parseServerEvent,
	resolveConversationTarget,
	roundLevel,
	safeOrigin,
	type ConversationTarget
} from '../protocol/helpers.js';
import {
	ConversationError,
	type AudioFormatId,
	type ClientEvent,
	type ClientToolHandler,
	type ContextUsageServerEvent,
	type ConversationErrorCode,
	type ConversationMode,
	type ConversationOptions,
	type ConversationStatus,
	type DebugEvent,
	type DisconnectDetails,
	type MCPToolApprovalRequest,
	type QueueStatus,
	type ServerEvent,
	type StartConversationOptions,
	type TranscriptMessage
} from '../types/index.js';

const DEFAULT_SIGNED_URL_ENDPOINT = '/api/signed-url';
const HANDSHAKE_TIMEOUT_MS = 15_000;
const MAX_LATENCY_HISTORY = 12;
const USER_ACTIVITY_THROTTLE_MS = 1_000;

/** Clamp a numeric volume to the 0 to 1 range. */
function clampVolume(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

/**
 * Reactive Svelte 5 controller for one ElevenLabs Conversational AI session.
 *
 * The controller owns:
 * - the signed-URL exchange (via your SvelteKit API route);
 * - the WebSocket handshake, keep-alives, and event parser;
 * - the {@link AudioManager} lifecycle;
 * - live transcript reduction, latency measurement, mute, and barge-in state.
 *
 * Create it with {@link useConversation} inside a component so teardown is
 * registered automatically, or with {@link createConversation} when you need
 * to manage the lifecycle yourself.
 */
export class ConversationController {
	/** Current connection lifecycle state. */
	status = $state<ConversationStatus>('disconnected');
	/** True while agent audio is scheduled or playing. */
	isSpeaking = $state(false);
	/** True while the microphone is live and the agent can hear the user. */
	isListening = $state(false);
	/** True while local voice activity detection hears the user speaking. */
	isUserSpeaking = $state(false);
	/** Whether outgoing microphone audio is muted. */
	isMuted = $state(false);
	/** Loudest normalized level across microphone and playback (`0..1`). */
	volume = $state(0);
	/** Normalized microphone RMS level (`0..1`). */
	inputVolume = $state(0);
	/** Normalized agent playback RMS level (`0..1`). */
	outputVolume = $state(0);
	/** Live transcript, including partial agent text when the agent enables it. */
	transcripts = $state<TranscriptMessage[]>([]);
	/** User-facing error message, or `null`. */
	error = $state<string | null>(null);
	/** Stable error category for programmatic UI. */
	errorCode = $state<ConversationErrorCode | null>(null);
	/** Latest time-to-first-audio measurement, in milliseconds. */
	latency = $state<number | null>(null);
	/** Recent latency measurements, oldest first. */
	latencyHistory = $state<number[]>([]);
	/** ElevenLabs conversation id, available after negotiation. */
	conversationId = $state<string | null>(null);
	/** Negotiated microphone format. */
	inputAudioFormat = $state<AudioFormatId | null>(null);
	/** Negotiated agent audio format. */
	outputAudioFormat = $state<AudioFormatId | null>(null);
	/** Concurrency queue state, when the agent is waiting for a slot. */
	queueStatus = $state<QueueStatus | null>(null);
	/** Number of times agent playback was interrupted in this session. */
	interruptions = $state(0);
	/** Number of transcript entries. */
	messageCount = $derived(this.transcripts.length);
	/** Latest transcript entry, or `null` before the first message. */
	message = $state<TranscriptMessage | null>(null);
	/** True while feedback can be sent for the current response. */
	canSendFeedback = $state(false);
	/** Latest server-side voice activity score. */
	vadScore = $state(0);
	/** Latest LLM context window usage reported by the server. */
	contextUsage = $state<ContextUsageServerEvent['context_usage_event'] | null>(null);
	/** Playback gain from `0` to `1`. */
	outputGain = $state(1);
	/** Current microphone device id, when one is configured or selected. */
	inputDeviceId = $state<string | null>(null);
	/** Current output device id, when one is configured or selected. */
	outputDeviceId = $state<string | null>(null);
	/** Single label suitable for a status pill. */
	mode = $derived<ConversationMode>(
		this.status === 'disconnected'
			? 'disconnected'
			: this.status === 'connecting'
				? 'connecting'
				: this.isSpeaking
					? 'speaking'
					: this.isUserSpeaking
						? 'listening'
						: 'ready'
	);
	/** True when a session can be started. */
	canStart = $derived(this.status === 'disconnected');
	/** True when the current or next session runs in text only mode. */
	get isTextOnly(): boolean {
		if (this.sessionTextOnly !== null) return this.sessionTextOnly;
		if (typeof this.options?.textOnly === 'boolean') return this.options.textOnly;
		return this.options?.overrides?.conversation?.text_only === true;
	}

	private readonly options: ConversationOptions;
	private socket: WebSocket | null = null;
	private audio: AudioManager | null = null;
	private sessionToken = 0;
	private intentionalClose = false;
	private destroyed = false;
	private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal timers are not rendered.
	private pingTimers = new Set<ReturnType<typeof setTimeout>>();
	private signedUrlAbort: AbortController | null = null;
	private latencyStartedAt: number | null = null;
	private lastInterruptionEventId = Number.NEGATIVE_INFINITY;
	private lastInterruptionAt = Number.NEGATIVE_INFINITY;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal protocol lookup is not rendered.
	private agentStreamIds = new Map<string, string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Tool handlers are not rendered.
	private clientTools = new Map<string, ClientToolHandler>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Approval bookkeeping is not rendered.
	private mcpApprovals = new Map<
		string,
		{ state: 'pending' | 'settled' | 'stale'; controller: AbortController }
	>();
	private currentEventId: number | null = null;
	private sessionTextOnly: boolean | null = null;
	private lastUserActivityAt = Number.NEGATIVE_INFINITY;
	private lastMode: ConversationMode = 'disconnected';
	private lastErrorKey = '';
	private lastErrorAt = 0;
	private pageHideHandler = (): void => this.stopConversation();

	/**
	 * @param options - Defaults and callbacks. Every network and audio method
	 * still works with an empty options object.
	 */
	constructor(options: ConversationOptions = {}) {
		this.options = options;
		for (const [name, handler] of Object.entries(options.clientTools ?? {})) {
			if (name.trim() && typeof handler === 'function') {
				this.clientTools.set(name.trim(), handler);
			}
		}
		this.inputDeviceId = options.inputDeviceId?.trim() || null;
		this.outputDeviceId = options.outputDeviceId?.trim() || null;
		this.outputGain = clampVolume(options.outputVolume ?? 1);
		this.isMuted = options.micMuted === true;
	}

	/**
	 * Start a conversation.
	 *
	 * Preparation order is deliberate: microphone permission and audio
	 * contexts are obtained inside the originating user gesture, then the
	 * signed URL is fetched, then the WebSocket handshake runs. This prevents
	 * browsers from suspending playback behind an autoplay gate.
	 *
	 * @param agentIdOrSignedUrl - A public `agent_…` id, a `wss://` signed URL,
	 * or `undefined` to use the configured default.
	 * @param startOptions - Set `signed: true` to exchange a public agent id for
	 * a signed URL through `signedUrlEndpoint`.
	 * @returns A promise that resolves after metadata negotiation or after a
	 * start failure. It never rejects; failures are published through `error`,
	 * `errorCode`, and `onError`, so `void conversation.startConversation(...)`
	 * is safe without an extra catch.
	 */
	async startConversation(
		agentIdOrSignedUrl?: string,
		startOptions: StartConversationOptions = {}
	): Promise<void> {
		if (this.destroyed) {
			this.publishError(
				new ConversationError('not-supported', 'This conversation controller has been destroyed.')
			);
			return;
		}
		if (!BROWSER) {
			this.publishError(
				new ConversationError('not-supported', 'Conversations can only be started in a browser.')
			);
			return;
		}
		if (this.status !== 'disconnected') {
			this.debugLog('session:ignored', 'startConversation() called while a session is active.');
			return;
		}
		this.sessionTextOnly = startOptions.textOnly ?? null;
		if (this.options.connectionType && this.options.connectionType !== 'websocket') {
			this.fail(
				new ConversationError(
					'not-supported',
					'This package uses the WebSocket transport. Omit connectionType or set it to "websocket".'
				)
			);
			return;
		}

		let target: ConversationTarget;
		try {
			target = this.resolveTarget(agentIdOrSignedUrl, startOptions);
		} catch (cause) {
			this.fail(
				cause instanceof ConversationError
					? cause
					: new ConversationError('invalid-target', 'The conversation target is not valid.', cause)
			);
			return;
		}

		const token = ++this.sessionToken;
		this.resetForStart();
		this.setStatus('connecting');
		this.intentionalClose = false;
		window.addEventListener('pagehide', this.pageHideHandler, { once: true });

		try {
			if (!this.isTextOnly) {
				const audio = new AudioManager({
					inputChunkDurationMs: this.options.inputChunkDurationMs,
					interruptOnUserSpeech: this.options.interruptOnUserSpeech,
					vadThreshold: this.options.vadThreshold,
					inputDeviceId: this.inputDeviceId ?? undefined,
					outputDeviceId: this.outputDeviceId ?? undefined,
					onInputChunk: (base64) => {
						if (token !== this.sessionToken) return;
						this.send({ user_audio_chunk: base64 });
					},
					onLevels: ({ input, output, combined }) => {
						if (token !== this.sessionToken) return;
						this.inputVolume = roundLevel(input);
						this.outputVolume = roundLevel(output);
						this.volume = roundLevel(combined);
					},
					onUserSpeakingChange: (speaking) => {
						if (token !== this.sessionToken) return;
						this.setUserSpeaking(speaking);
					},
					onPlaybackChange: (playing) => {
						if (token !== this.sessionToken) return;
						this.setSpeaking(playing);
					},
					onLocalInterruption: () => {
						if (token !== this.sessionToken) return;
						this.recordInterruption('local');
						this.debugLog('audio:interruption', 'Local VAD interrupted agent playback.');
					},
					onError: (cause) => {
						if (token !== this.sessionToken) return;
						this.handleAudioError(cause);
					}
				});
				this.audio = audio;

				await audio.prepare();
				if (!this.isCurrent(token)) {
					await audio.close();
					return;
				}
				audio.setOutputVolume(this.outputGain);
				audio.setInputMuted(this.isMuted);
			}

			const url = await this.resolveUrl(target);
			if (!this.isCurrent(token)) {
				await this.audio?.close();
				return;
			}

			this.debugLog('session:connect', 'Opening conversational WebSocket.', {
				origin: safeOrigin(url)
			});
			await this.connect(url, token);
		} catch (cause) {
			if (!this.isCurrent(token)) return;
			this.fail(this.toConversationError(cause, 'connection-failed'));
		}
	}

	/**
	 * End the session immediately.
	 *
	 * This is an alias for {@link stopConversation}, provided for API
	 * familiarity.
	 */
	endSession(): void {
		this.stopConversation();
	}

	/**
	 * End the session immediately.
	 *
	 * Closes the socket with a normal code, stops the microphone, flushes
	 * playback, closes both AudioContexts, clears timers, and resets transient
	 * state. Transcripts are preserved for post-call display.
	 */
	stopConversation(): void {
		const wasActive = this.status !== 'disconnected';
		this.intentionalClose = true;
		this.sessionTextOnly = null;
		this.sessionToken += 1;
		this.clearTimers();
		this.abortSignedUrlRequest();
		this.removePageHideListener();

		const socket = this.socket;
		this.socket = null;
		if (socket) {
			try {
				if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
					socket.close(1000, 'Client ended conversation');
				}
			} catch {
				// The socket may already be closed.
			}
		}

		const audio = this.audio;
		this.audio = null;
		if (audio) void audio.close();

		this.agentStreamIds.clear();
		this.abortMCPApprovals();
		this.latencyStartedAt = null;
		this.lastInterruptionEventId = Number.NEGATIVE_INFINITY;
		this.lastInterruptionAt = Number.NEGATIVE_INFINITY;
		this.currentEventId = null;
		this.setStatus('disconnected');
		this.setSpeaking(false);
		this.isListening = false;
		this.setUserSpeaking(false);
		this.isMuted = false;
		this.volume = 0;
		this.inputVolume = 0;
		this.outputVolume = 0;
		this.vadScore = 0;
		this.contextUsage = null;
		this.setCanSendFeedback(false);
		this.queueStatus = null;
		this.conversationId = null;
		this.inputAudioFormat = null;
		this.outputAudioFormat = null;
		this.error = null;
		this.errorCode = null;

		if (wasActive) {
			this.options.onDisconnect?.({
				code: 1000,
				reason: 'Client ended conversation',
				expected: true
			});
		}
	}

	/**
	 * Toggle outgoing microphone audio.
	 *
	 * Muting does not stop the microphone track or close the audio context;
	 * it only stops sending chunks, so unmuting is instant. Safe to call when
	 * disconnected.
	 */
	toggleMute(): void {
		this.setMuted(!this.isMuted);
	}

	/**
	 * Set the outgoing microphone mute state.
	 *
	 * @param muted - `true` to stop sending microphone audio.
	 */
	setMuted(muted: boolean): void {
		this.isMuted = muted;
		this.audio?.setInputMuted(muted);
		this.isListening = !this.isTextOnly && this.status === 'connected' && !muted;

		if (muted) {
			this.setUserSpeaking(false);
			this.inputVolume = 0;
			this.volume = this.outputVolume;
		}
		this.debugLog('audio:mute', muted ? 'Microphone muted.' : 'Microphone unmuted.');
	}

	/**
	 * Set the playback gain.
	 *
	 * @param volume - Linear gain from `0` to `1`, or an object with a
	 * `volume` property for API familiarity.
	 */
	setVolume(volume: number | { volume: number }): void {
		const value = typeof volume === 'number' ? volume : volume.volume;
		this.outputGain = clampVolume(value);
		this.audio?.setOutputVolume(this.outputGain);
	}

	/** Latest normalized microphone level. */
	getInputVolume(): number {
		return this.audio?.getInputVolume() ?? this.inputVolume;
	}

	/** Latest normalized playback level. */
	getOutputVolume(): number {
		return this.audio?.getOutputVolume() ?? this.outputVolume;
	}

	/**
	 * Read microphone frequency data.
	 *
	 * @param target - Optional reusable buffer.
	 * @returns Filled frequency bytes.
	 */
	getInputByteFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		return this.getInputFrequencyData(target);
	}

	/**
	 * Read playback frequency data.
	 *
	 * @param target - Optional reusable buffer.
	 * @returns Filled frequency bytes.
	 */
	getOutputByteFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		return this.getOutputFrequencyData(target);
	}

	/** The current ElevenLabs conversation id, or `null` before negotiation. */
	getId(): string | null {
		return this.conversationId;
	}

	/**
	 * Send positive or negative feedback for an agent response.
	 *
	 * @param like - `true` for like, `false` for dislike.
	 * @param eventId - Optional response event id. Defaults to the latest agent response.
	 * @returns `true` when the frame was sent.
	 */
	sendFeedback(like: boolean, eventId?: number): boolean {
		if (!this.canSendFeedback) return false;
		const target = eventId ?? this.currentEventId;
		if (target === null) return false;
		return this.send({
			type: 'feedback',
			score: like ? 'like' : 'dislike',
			event_id: target
		});
	}

	/**
	 * Signal user activity. Calls are throttled to one frame per second.
	 *
	 * @returns `true` when a frame was sent.
	 */
	sendUserActivity(): boolean {
		const now = Date.now();
		if (now - this.lastUserActivityAt < USER_ACTIVITY_THROTTLE_MS) return false;
		this.lastUserActivityAt = now;
		return this.send({ type: 'user_activity' });
	}

	/**
	 * Answer an MCP tool approval request manually.
	 *
	 * @param toolCallId - Identifier from the MCP tool call.
	 * @param approved - `true` to allow the tool call.
	 * @returns `true` when the frame was sent.
	 */
	sendMCPToolApprovalResult(toolCallId: string, approved: boolean): boolean {
		const entry = this.mcpApprovals.get(toolCallId);
		if (entry && entry.state !== 'pending') return false;
		if (entry) entry.state = 'settled';
		return this.send({
			type: 'mcp_tool_approval_result',
			tool_call_id: toolCallId,
			is_approved: approved
		});
	}

	/**
	 * Register a named client tool for this controller.
	 *
	 * @param name - Tool name configured on the agent.
	 * @param handler - Handler invoked with the tool parameters.
	 * @returns A function that removes the registration.
	 */
	registerClientTool(name: string, handler: ClientToolHandler): () => void {
		const key = name.trim();
		if (!key) return () => {};
		this.clientTools.set(key, handler);
		return () => {
			if (this.clientTools.get(key) === handler) this.clientTools.delete(key);
		};
	}

	/**
	 * Switch the microphone while a session is running.
	 *
	 * @param deviceId - Target input device, or `undefined` for the default.
	 * @returns `true` when the switch completed.
	 */
	async changeInputDevice(deviceId?: string): Promise<boolean> {
		if (this.isTextOnly) {
			this.publishError(
				new ConversationError('not-supported', 'Input devices are not available in text only mode.')
			);
			return false;
		}
		if (!this.audio) {
			this.publishError(
				new ConversationError(
					'not-supported',
					'Start a voice conversation before switching input devices.'
				)
			);
			return false;
		}
		try {
			await this.audio.changeInputDevice(deviceId);
			this.inputDeviceId = this.audio.inputDeviceId;
			this.debugLog('audio:device', 'Input device changed.', { inputDeviceId: this.inputDeviceId });
			return true;
		} catch (cause) {
			this.publishError(this.toAudioConversationError(cause, 'device-switch-failed'));
			return false;
		}
	}

	/**
	 * Route playback to a specific output device.
	 *
	 * @param deviceId - Target output device, or `undefined` for the default.
	 * @returns `true` when the switch completed.
	 */
	async changeOutputDevice(deviceId?: string): Promise<boolean> {
		if (this.isTextOnly) {
			this.publishError(
				new ConversationError(
					'not-supported',
					'Output devices are not available in text only mode.'
				)
			);
			return false;
		}
		if (!this.audio) {
			this.publishError(
				new ConversationError(
					'not-supported',
					'Start a voice conversation before switching output devices.'
				)
			);
			return false;
		}
		try {
			await this.audio.changeOutputDevice(deviceId);
			this.outputDeviceId = this.audio.outputDeviceId;
			this.debugLog('audio:device', 'Output device changed.', {
				outputDeviceId: this.outputDeviceId
			});
			return true;
		} catch (cause) {
			this.publishError(this.toAudioConversationError(cause, 'device-switch-failed'));
			return false;
		}
	}

	/**
	 * List the audio input and output devices the browser exposes.
	 *
	 * @returns Devices reported by `navigator.mediaDevices.enumerateDevices`.
	 */
	async listAudioDevices(): Promise<AudioDeviceInfo[]> {
		return listAudioDevices();
	}

	/**
	 * Inject non-interrupting context into the conversation.
	 *
	 * @param text - Context the agent should consider on its next turn.
	 * @param contextId - Optional identifier used by the server to replace older context.
	 * @returns `true` when the frame was sent.
	 */
	sendContextualUpdate(text: string, contextId?: string): boolean {
		const value = text.trim();
		if (!value) return false;
		return this.send({
			type: 'contextual_update',
			text: value,
			...(contextId?.trim() ? { context_id: contextId.trim() } : {})
		});
	}

	/**
	 * Send a text user message over the same WebSocket.
	 *
	 * @param text - Message text.
	 * @returns `true` when the frame was sent.
	 */
	sendUserMessage(text: string): boolean {
		const value = text.trim();
		if (!value) return false;
		return this.send({ type: 'user_message', text: value });
	}

	/** Clear the local transcript without affecting the server conversation. */
	clearTranscripts(): void {
		this.transcripts = [];
		this.agentStreamIds.clear();
	}

	/** Clear the last error banner. */
	clearError(): void {
		this.error = null;
		this.errorCode = null;
	}

	/**
	 * Read the current microphone frequency bins for a canvas or CSS meter.
	 *
	 * The returned values are bytes from an `AnalyserNode` (0 to 255) and are all
	 * zero when the microphone is not active. Pass a reusable buffer to avoid
	 * allocating on every animation frame; it must have at least 512 entries.
	 *
	 * @param target - Optional reusable buffer at least as long as
	 * `AnalyserNode.frequencyBinCount` (512 for this library).
	 * @returns Filled frequency data.
	 */
	getInputFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		if (this.audio) return this.audio.getInputFrequencyData(target);
		const buffer = target ?? new Uint8Array(512);
		buffer.fill(0);
		return buffer;
	}

	/**
	 * Read the current agent playback frequency bins for a canvas or CSS meter.
	 *
	 * The returned values are bytes from an `AnalyserNode` (0 to 255) and are all
	 * zero when no audio graph is active.
	 *
	 * @param target - Optional reusable buffer at least 512 entries long.
	 * @returns Filled frequency data.
	 */
	getOutputFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		if (this.audio) return this.audio.getOutputFrequencyData(target);
		const buffer = target ?? new Uint8Array(512);
		buffer.fill(0);
		return buffer;
	}

	/**
	 * Destroy the controller and release every resource.
	 *
	 * Called automatically by {@link useConversation}'s `$effect` teardown.
	 * Idempotent.
	 */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.stopConversation();
	}

	/**
	 * Validate a start target before microphone access is requested.
	 *
	 * Normalizing URLs here keeps obvious configuration mistakes synchronous
	 * and avoids a permission prompt for a session that cannot connect.
	 */
	private resolveTarget(
		target: string | undefined,
		startOptions: StartConversationOptions
	): ConversationTarget {
		return resolveConversationTarget(target, {
			agentId: this.options.agentId,
			signedUrl: this.options.signedUrl,
			signed: startOptions.signed === true
		});
	}

	/** Turn a validated target into a WebSocket URL. */
	private async resolveUrl(target: ConversationTarget): Promise<string> {
		if (target.websocket) return target.value;
		if (target.signed) return this.fetchSignedUrl(target.value);
		const origin = this.options.origin ?? getServerLocationOrigin(this.options.serverLocation);
		return buildAgentWebSocketUrl(target.value, origin);
	}

	/** Exchange an agent id for a signed URL through the app server. */
	private async fetchSignedUrl(agentId: string): Promise<string> {
		if (!BROWSER) {
			throw new ConversationError('not-supported', 'Signed URLs must be fetched from a browser.');
		}

		const endpoint = this.options.signedUrlEndpoint ?? DEFAULT_SIGNED_URL_ENDPOINT;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- This URL is never rendered.
		const url = new URL(endpoint, window.location.href);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new ConversationError(
				'signed-url-failed',
				'The signed URL endpoint must use HTTP or HTTPS.'
			);
		}
		url.searchParams.set('agent_id', agentId);

		const abort = new AbortController();
		this.signedUrlAbort = abort;
		const timeout = setTimeout(() => abort.abort(), 12_000);

		try {
			const response = await fetch(url, {
				headers: { accept: 'application/json' },
				signal: abort.signal
			});
			const body: unknown = await response.json().catch(() => null);

			if (!response.ok) {
				const upstreamMessage = extractErrorMessage(body);
				throw new ConversationError(
					'signed-url-failed',
					upstreamMessage ??
						`The server could not create a signed URL (HTTP ${response.status}). Check ELEVENLABS_API_KEY and try again.`
				);
			}

			const signedUrl =
				isRecord(body) && typeof body.signed_url === 'string' ? body.signed_url : null;
			if (!signedUrl) {
				throw new ConversationError(
					'signed-url-failed',
					'The signed URL endpoint returned an unexpected response. Expected { "signed_url": "wss://…" }.'
				);
			}
			return normalizeWebSocketUrl(signedUrl);
		} catch (cause) {
			if (cause instanceof ConversationError) throw cause;
			if (isAbortError(cause)) {
				throw new ConversationError(
					'signed-url-failed',
					'The request for a signed URL timed out. Check your server route and network connection.',
					cause
				);
			}
			throw new ConversationError(
				'signed-url-failed',
				'Could not reach the signed URL endpoint. Make sure the SvelteKit server route is running.',
				cause
			);
		} finally {
			clearTimeout(timeout);
			if (this.signedUrlAbort === abort) this.signedUrlAbort = null;
		}
	}

	/** Open the socket and wait for the metadata handshake. */
	private async connect(url: string, token: number): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			let socket: WebSocket;
			try {
				// The public protocol expects the `convai` subprotocol. Some
				// self-hosted proxies reject subprotocols, so retry bare.
				socket = new WebSocket(url, ['convai']);
			} catch (cause) {
				try {
					socket = new WebSocket(url);
				} catch {
					reject(
						new ConversationError(
							'connection-failed',
							'Could not create the WebSocket connection. Check the signed URL or agent ID.',
							cause
						)
					);
					return;
				}
			}

			this.socket = socket;
			let settled = false;

			const failHandshake = (error: ConversationError): void => {
				if (settled) return;
				settled = true;
				if (this.handshakeTimer) {
					clearTimeout(this.handshakeTimer);
					this.handshakeTimer = null;
				}
				try {
					socket.close(1000, 'Handshake failed');
				} catch {
					// Ignore.
				}
				reject(error);
			};

			this.handshakeTimer = setTimeout(() => {
				failHandshake(
					new ConversationError(
						'connection-timeout',
						'The agent did not complete the handshake within 15 seconds. Check your network and agent configuration.'
					)
				);
			}, HANDSHAKE_TIMEOUT_MS);

			socket.addEventListener('open', () => {
				this.debugLog('socket:open', 'WebSocket open; sending initiation payload.');
				const initiation: ClientEvent = {
					type: 'conversation_initiation_client_data',
					conversation_config_override: this.buildOverrides(),
					dynamic_variables: this.options.dynamicVariables,
					user_id: this.options.userId
				};
				if (!this.send(initiation)) {
					failHandshake(
						new ConversationError(
							'connection-failed',
							'The WebSocket opened but the initiation payload could not be sent.'
						)
					);
				}
			});

			socket.addEventListener('message', (event: MessageEvent<unknown>) => {
				const parsed = parseServerEvent(event.data);
				if (!parsed) {
					this.debugLog('socket:message', 'Ignored an unknown or malformed server event.');
					return;
				}

				this.options.onIncomingEvent?.(parsed);

				if (parsed.type === 'conversation_initiation_metadata' && !settled) {
					settled = true;
					if (this.handshakeTimer) {
						clearTimeout(this.handshakeTimer);
						this.handshakeTimer = null;
					}
					void this.handleMetadata(parsed, token).then(resolve, reject);
					return;
				}

				if (token === this.sessionToken) {
					void this.dispatch(parsed).catch((cause: unknown) => {
						if (token !== this.sessionToken) return;
						this.debugLog('socket:event', 'Failed to handle a server event.', {
							type: parsed.type,
							error: cause instanceof Error ? cause.message : String(cause)
						});
						this.publishError(
							new ConversationError(
								'protocol-error',
								'The agent sent an event this client could not read. Restart the session if audio stops.'
							)
						);
					});
				}
			});

			socket.addEventListener('error', () => {
				this.debugLog('socket:error', 'The browser reported a WebSocket error.');
				if (!settled) {
					failHandshake(
						new ConversationError(
							'connection-failed',
							'Could not connect to ElevenLabs. Check your network connection, agent ID, and signed URL.'
						)
					);
				}
			});

			socket.addEventListener('close', (event: CloseEvent) => {
				if (this.handshakeTimer) {
					clearTimeout(this.handshakeTimer);
					this.handshakeTimer = null;
				}

				if (!settled) {
					failHandshake(
						new ConversationError('connection-failed', closeMessage(event.code, event.reason), {
							code: event.code,
							reason: event.reason
						})
					);
					return;
				}

				if (this.socket === socket) {
					this.handleDisconnect(event, token);
				}
			});
		});
	}

	/** Negotiate formats, start the microphone, and mark the session connected. */
	private async handleMetadata(
		event: Extract<ServerEvent, { type: 'conversation_initiation_metadata' }>,
		token: number
	): Promise<void> {
		const metadata = event.conversation_initiation_metadata_event;
		if (!metadata || typeof metadata.conversation_id !== 'string') {
			throw new ConversationError(
				'protocol-error',
				'The agent sent invalid conversation metadata. Try starting a new session.'
			);
		}

		const textOnly = this.isTextOnly;
		let inputFormat: AudioFormatId | null;
		let outputFormat: AudioFormatId | null;

		if (textOnly) {
			inputFormat = metadata.user_input_audio_format ?? null;
			outputFormat = metadata.agent_output_audio_format ?? null;
		} else {
			try {
				inputFormat = metadata.user_input_audio_format ?? 'pcm_16000';
				outputFormat = metadata.agent_output_audio_format ?? 'pcm_16000';
				// Validate early so an unsupported format fails with a clear message.
				parseAudioFormat(inputFormat);
				parseAudioFormat(outputFormat);
			} catch (cause) {
				throw new ConversationError(
					'protocol-error',
					'The agent negotiated an audio format this browser cannot play.',
					cause
				);
			}
		}

		if (token !== this.sessionToken) return;

		this.conversationId = metadata.conversation_id;
		this.inputAudioFormat = inputFormat;
		this.outputAudioFormat = outputFormat;
		this.options.onConversationMetadata?.(metadata);
		this.options.onConversationId?.(metadata.conversation_id);

		if (textOnly) {
			this.setStatus('connected');
			this.isListening = false;
			this.latencyStartedAt = performance.now();
			this.setCanSendFeedback(true);
			this.options.onConnect?.({ conversationId: metadata.conversation_id });
			this.debugLog('session:ready', 'Text only conversation metadata negotiated.', {
				conversationId: metadata.conversation_id
			});
			return;
		}

		if (!this.audio) {
			throw new ConversationError('audio-failed', 'The audio manager was not initialised.');
		}

		await this.audio.startInput(inputFormat as AudioFormatId);
		if (token !== this.sessionToken) return;

		this.setStatus('connected');
		this.isListening = !this.isMuted;
		this.latencyStartedAt = performance.now();
		this.setCanSendFeedback(true);
		this.options.onConnect?.({ conversationId: metadata.conversation_id });
		this.debugLog('session:ready', 'Conversation metadata negotiated.', {
			conversationId: metadata.conversation_id,
			inputFormat,
			outputFormat
		});
	}

	/** Route one known server event. */
	private async dispatch(event: ServerEvent): Promise<void> {
		switch (event.type) {
			case 'conversation_initiation_metadata':
				return;
			case 'audio':
				this.handleAudio(event);
				return;
			case 'user_transcript':
				this.handleUserTranscript(event);
				return;
			case 'agent_response':
				this.handleAgentResponse(event);
				return;
			case 'agent_response_correction':
				this.handleAgentCorrection(event);
				return;
			case 'agent_chat_response_part':
				this.handleAgentPart(event);
				return;
			case 'agent_response_complete':
				this.options.onAgentResponseComplete?.(event.agent_response_complete_event.event_id);
				return;
			case 'agent_response_metadata':
				this.options.onAgentResponseMetadata?.(event.agent_response_metadata_event);
				return;
			case 'interruption':
				this.handleInterruption(event);
				return;
			case 'vad_score':
				this.handleVadScore(event);
				return;
			case 'ping':
				this.handlePing(event);
				return;
			case 'client_error':
			case 'error':
				this.handleServerError(event);
				return;
			case 'queue_status':
				this.handleQueueStatus(event);
				return;
			case 'client_tool_call':
				await this.handleClientToolCall(event);
				return;
			case 'agent_tool_request':
				this.options.onAgentToolRequest?.(event.agent_tool_request);
				return;
			case 'agent_tool_response':
				this.handleAgentToolResponse(event);
				return;
			case 'agent_tool_response_full_payload':
				this.handleAgentToolResponseFullPayload(event);
				return;
			case 'mcp_tool_call':
				await this.handleMCPToolCall(event);
				return;
			case 'mcp_connection_status':
				this.options.onMCPConnectionStatus?.(event.mcp_connection_status);
				return;
			case 'guardrail_triggered':
				this.options.onGuardrailTriggered?.(event.guardrail_triggered_event);
				return;
			case 'context_usage':
				this.handleContextUsage(event);
				return;
			default:
				this.debugLog('socket:event', 'Received an unhandled server event.', { event });
		}
	}

	/** Play an agent audio chunk and record time-to-first-audio. */
	private handleAudio(event: Extract<ServerEvent, { type: 'audio' }>): void {
		const payload = event.audio_event;
		if (payload.event_id < this.lastInterruptionEventId) return;

		if (payload.audio_base_64) {
			this.options.onAudio?.(payload.audio_base_64);
		}
		if (payload.alignment) {
			this.options.onAudioAlignment?.(payload.alignment);
		}
		if (!payload.audio_base_64 || !this.outputAudioFormat || !this.audio) return;

		const played = this.audio.playAudioChunk(payload.audio_base_64, this.outputAudioFormat);
		if (!played) return;

		this.setSpeaking(true);
		if (this.latencyStartedAt !== null) {
			this.recordLatency();
		}
	}

	/** Upsert a final user transcript and begin a new latency window. */
	private handleUserTranscript(event: Extract<ServerEvent, { type: 'user_transcript' }>): void {
		const text = event.user_transcription_event.user_transcript.trim();
		if (!text) return;
		const eventId = event.user_transcription_event.event_id;
		this.upsertTranscript(`user-${eventId}`, 'user', text, true, eventId);
		this.latencyStartedAt = performance.now();
		this.debugLog('transcript:user', 'User transcript received.', {
			eventId,
			characters: text.length
		});
	}

	/** Upsert a final agent transcript. */
	private handleAgentResponse(event: Extract<ServerEvent, { type: 'agent_response' }>): void {
		const payload = event.agent_response_event;
		const text = payload.agent_response.trim();
		this.currentEventId = payload.event_id;
		if (!text) return;
		const responseId = payload.response_id ?? `event-${payload.event_id}`;
		const id = this.agentStreamIds.get(responseId) ?? `agent-${responseId}`;
		this.agentStreamIds.set(responseId, id);
		this.upsertTranscript(id, 'agent', text, true, payload.event_id, {
			responseId,
			attachments: payload.attachments
		});
		this.debugLog('transcript:agent', 'Agent response received.', {
			responseId,
			characters: text.length
		});
	}

	/** Apply a server-side transcript correction. */
	private handleAgentCorrection(
		event: Extract<ServerEvent, { type: 'agent_response_correction' }>
	): void {
		const payload = event.agent_response_correction_event;
		this.options.onAgentResponseCorrection?.(payload);
		const corrected = payload.corrected_agent_response.trim();
		if (!corrected) return;
		const responseId = payload.response_id ?? `event-${payload.event_id}`;
		const id = this.agentStreamIds.get(responseId) ?? `agent-${responseId}`;
		this.agentStreamIds.set(responseId, id);
		this.upsertTranscript(id, 'agent', corrected, true, payload.event_id, { responseId });
	}

	/** Append a streaming agent response part. */
	private handleAgentPart(event: Extract<ServerEvent, { type: 'agent_chat_response_part' }>): void {
		const part = event.text_response_part;
		this.options.onAgentChatResponsePart?.(part);
		const responseId = part.response_id ?? `event-${part.event_id}`;
		const id = this.agentStreamIds.get(responseId) ?? `agent-${responseId}`;
		this.agentStreamIds.set(responseId, id);
		const existing = this.transcripts.find((message) => message.id === id);

		if (part.type === 'start') {
			if (existing) {
				this.updateTranscript(id, { text: part.text, isFinal: false, eventId: part.event_id });
			} else {
				this.pushTranscript({
					id,
					role: 'agent',
					text: part.text,
					isFinal: false,
					timestamp: Date.now(),
					eventId: part.event_id
				});
			}
			return;
		}

		if (part.type === 'delta') {
			const nextText = `${existing?.text ?? ''}${part.text}`;
			if (existing) {
				this.updateTranscript(id, { text: nextText, isFinal: false, eventId: part.event_id });
			} else {
				this.pushTranscript({
					id,
					role: 'agent',
					text: nextText,
					isFinal: false,
					timestamp: Date.now(),
					eventId: part.event_id
				});
			}
			return;
		}

		if (existing) {
			this.updateTranscript(id, { isFinal: true, eventId: part.event_id });
		}
	}

	/** Flush playback when the server detects an interruption. */
	private handleInterruption(event: Extract<ServerEvent, { type: 'interruption' }>): void {
		const eventId = event.interruption_event.event_id;
		if (eventId <= this.lastInterruptionEventId) return;
		this.lastInterruptionEventId = eventId;
		this.audio?.flushPlayback();
		this.setSpeaking(false);
		this.recordInterruption('server');
		this.debugLog('audio:interruption', 'Server interruption; playback flushed.', { eventId });
	}

	/** Count a barge-in once when local VAD and the server report the same event. */
	private recordInterruption(source: 'local' | 'server'): void {
		const now = performance.now();
		if (now - this.lastInterruptionAt < 1_000) {
			this.debugLog('audio:interruption', 'Ignored a duplicate interruption signal.', { source });
			return;
		}

		this.lastInterruptionAt = now;
		this.interruptions += 1;
		this.options.onInterruption?.();
	}

	/** Store the server voice activity score and notify listeners. */
	private handleVadScore(event: Extract<ServerEvent, { type: 'vad_score' }>): void {
		this.vadScore = event.vad_score_event.vad_score;
		this.options.onVadScore?.(this.vadScore);
	}

	/** Store LLM context usage and notify listeners. */
	private handleContextUsage(event: Extract<ServerEvent, { type: 'context_usage' }>): void {
		this.contextUsage = event.context_usage_event;
		this.options.onContextUsage?.(event.context_usage_event);
	}

	/** Notify listeners about an agent tool call and honor the end call tool. */
	private handleAgentToolResponse(
		event: Extract<ServerEvent, { type: 'agent_tool_response' }>
	): void {
		const payload = event.agent_tool_response;
		this.options.onAgentToolResponse?.(payload);
		if (payload.tool_name === 'end_call') {
			this.debugLog('tool:agent', 'The agent ended the conversation.', {
				toolCallId: payload.tool_call_id
			});
			this.stopConversation();
		}
	}

	/** Notify listeners about an agent tool call with its full payload. */
	private handleAgentToolResponseFullPayload(
		event: Extract<ServerEvent, { type: 'agent_tool_response_full_payload' }>
	): void {
		const payload = event.agent_tool_response_full_payload;
		this.options.onAgentToolResponse?.(payload);
		if (payload.tool_name === 'end_call') {
			this.debugLog('tool:agent', 'The agent ended the conversation.', {
				toolCallId: payload.tool_call_id
			});
			this.stopConversation();
		}
	}

	/** Dispatch an MCP tool call and settle approval requests exactly once. */
	private async handleMCPToolCall(
		event: Extract<ServerEvent, { type: 'mcp_tool_call' }>
	): Promise<void> {
		const call = event.mcp_tool_call;
		this.options.onMCPToolCall?.(call);

		if (call.state !== 'awaiting_approval') {
			this.markMCPApprovalStale(call.tool_call_id);
			return;
		}

		const handler = this.options.onMCPToolApprovalRequest;
		if (!handler || this.status !== 'connected') return;
		if (this.mcpApprovals.has(call.tool_call_id)) {
			this.debugLog('tool:mcp', 'Ignored a repeated MCP approval request.', {
				toolCallId: call.tool_call_id
			});
			return;
		}

		const controller = new AbortController();
		this.mcpApprovals.set(call.tool_call_id, { state: 'pending', controller });
		let approved = false;

		try {
			const value = await handler(call as MCPToolApprovalRequest, {
				signal: controller.signal
			});
			if (typeof value !== 'boolean') {
				this.publishError(
					new ConversationError(
						'protocol-error',
						'The MCP approval handler must resolve to a boolean. The tool call was denied.'
					)
				);
			} else {
				approved = value;
			}
		} catch (cause) {
			if (!controller.signal.aborted) {
				this.publishError(
					new ConversationError(
						'protocol-error',
						'The MCP approval handler failed. The tool call was denied.',
						cause
					)
				);
			}
		}

		this.settleMCPApproval(call.tool_call_id, approved);
	}

	/** Send the one approval result a tool call id is allowed to receive. */
	private settleMCPApproval(toolCallId: string, approved: boolean): void {
		const entry = this.mcpApprovals.get(toolCallId);
		if (!entry || entry.state !== 'pending') return;
		entry.state = 'settled';
		this.send({
			type: 'mcp_tool_approval_result',
			tool_call_id: toolCallId,
			is_approved: approved
		});
	}

	/** Abort a pending approval that can no longer affect the server. */
	private markMCPApprovalStale(toolCallId: string): void {
		const entry = this.mcpApprovals.get(toolCallId);
		if (!entry || entry.state !== 'pending') return;
		entry.state = 'stale';
		entry.controller.abort();
	}

	/** Abort every pending approval and clear the ledger for the next session. */
	private abortMCPApprovals(): void {
		for (const toolCallId of this.mcpApprovals.keys()) {
			this.markMCPApprovalStale(toolCallId);
		}
		this.mcpApprovals.clear();
	}

	/** Answer keep-alive pings with the requested delay. */
	private handlePing(event: Extract<ServerEvent, { type: 'ping' }>): void {
		const eventId = event.ping_event.event_id;
		this.options.onPing?.(event.ping_event);
		const delay = Math.max(0, Math.min(30_000, event.ping_event.ping_ms ?? 0));
		const timer = setTimeout(() => {
			this.pingTimers.delete(timer);
			this.send({ type: 'pong', event_id: eventId });
		}, delay);
		this.pingTimers.add(timer);
	}

	/** Surface an agent-reported error without destroying the socket. */
	private handleServerError(event: Extract<ServerEvent, { type: 'client_error' | 'error' }>): void {
		const payload = event.error_event;
		const label = payload.error_type || payload.error_name || 'an error';
		const message =
			payload.message?.trim() ||
			payload.reason?.trim() ||
			`ElevenLabs reported ${label} (code ${payload.code}).`;
		this.publishError(new ConversationError('protocol-error', message));
	}

	/** Reflect concurrency queue state and timeouts. */
	private handleQueueStatus(event: Extract<ServerEvent, { type: 'queue_status' }>): void {
		this.queueStatus = event.queue_status_event.status;
		if (this.queueStatus === 'timed_out') {
			this.publishError(
				new ConversationError(
					'server-closed',
					'The agent is at capacity and the wait queue timed out. Try again in a moment.'
				)
			);
		}
	}

	/** Execute a client tool and reply when the server expects a result. */
	private async handleClientToolCall(
		event: Extract<ServerEvent, { type: 'client_tool_call' }>
	): Promise<void> {
		const call = event.client_tool_call;
		const named = this.clientTools.get(call.tool_name);
		const fallback = this.options.onClientToolCall;
		let result: string;
		let isError = false;

		if (!named && !fallback) {
			this.options.onUnhandledClientToolCall?.(call);
			result = `No handler is registered for client tool "${call.tool_name}".`;
			isError = true;
		} else {
			try {
				const value = named ? await named(call.parameters, call) : await fallback?.(call);
				result = this.stringifyToolResult(value);
			} catch (cause) {
				isError = true;
				result = cause instanceof Error ? cause.message : 'Client tool execution failed.';
			}
		}

		if (call.expects_response !== false) {
			this.send({
				type: 'client_tool_result',
				tool_call_id: call.tool_call_id,
				result,
				is_error: isError,
				...(isError ? { error_type: 'external_client' as const } : {})
			});
		}

		this.debugLog('tool:client', `Client tool "${call.tool_name}" completed.`, {
			toolCallId: call.tool_call_id,
			isError
		});
	}

	/** Convert a client tool return value into the protocol string result. */
	private stringifyToolResult(value: unknown): string {
		if (typeof value === 'string') return value;
		if (value === undefined || value === null) return 'Client tool execution successful.';
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	/** Close an active socket normally (used on failure cleanup paths). */
	private closeSocket(code: number, reason: string): void {
		const socket = this.socket;
		this.socket = null;
		if (!socket) return;
		try {
			if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
				socket.close(code, reason);
			}
		} catch {
			// Ignore.
		}
	}

	/** Handle an unexpected socket close after a successful handshake. */
	private handleDisconnect(event: CloseEvent, token: number): void {
		if (token !== this.sessionToken) return;
		this.socket = null;
		this.sessionToken += 1;
		this.sessionTextOnly = null;
		this.clearTimers();
		this.removePageHideListener();

		const audio = this.audio;
		this.audio = null;
		if (audio) void audio.close();

		const expected = this.intentionalClose || event.code === 1000;
		this.agentStreamIds.clear();
		this.abortMCPApprovals();
		this.latencyStartedAt = null;
		this.currentEventId = null;
		this.setStatus('disconnected');
		this.setSpeaking(false);
		this.isListening = false;
		this.setUserSpeaking(false);
		this.volume = 0;
		this.inputVolume = 0;
		this.outputVolume = 0;
		this.vadScore = 0;
		this.contextUsage = null;
		this.setCanSendFeedback(false);
		this.isMuted = false;
		this.conversationId = null;
		this.inputAudioFormat = null;
		this.outputAudioFormat = null;
		this.queueStatus = null;
		this.lastInterruptionAt = Number.NEGATIVE_INFINITY;

		const details: DisconnectDetails = {
			code: event.code,
			reason: event.reason,
			expected
		};
		this.options.onDisconnect?.(details);

		if (!expected) {
			this.publishError(
				new ConversationError('server-closed', closeMessage(event.code, event.reason), {
					code: event.code,
					reason: event.reason
				})
			);
		}
	}

	/** Tear down after an unrecoverable start failure. */
	private fail(error: ConversationError): void {
		this.sessionToken += 1;
		this.sessionTextOnly = null;
		this.clearTimers();
		this.abortSignedUrlRequest();
		this.removePageHideListener();
		this.closeSocket(1000, 'Conversation failed');
		const audio = this.audio;
		this.audio = null;
		if (audio) void audio.close();

		this.agentStreamIds.clear();
		this.abortMCPApprovals();
		this.latencyStartedAt = null;
		this.currentEventId = null;
		this.setStatus('disconnected');
		this.setSpeaking(false);
		this.isListening = false;
		this.setUserSpeaking(false);
		this.isMuted = false;
		this.volume = 0;
		this.inputVolume = 0;
		this.outputVolume = 0;
		this.vadScore = 0;
		this.contextUsage = null;
		this.setCanSendFeedback(false);
		this.conversationId = null;
		this.inputAudioFormat = null;
		this.outputAudioFormat = null;
		this.queueStatus = null;
		this.lastInterruptionAt = Number.NEGATIVE_INFINITY;
		this.publishError(error);
	}

	/** Report a non-fatal audio problem without dropping the session. */
	private handleAudioError(error: AudioManagerError): void {
		this.publishError(this.toAudioConversationError(error, 'audio-failed'));
	}

	/** Map an audio layer failure to the public controller error type. */
	private toAudioConversationError(
		cause: unknown,
		fallback: ConversationErrorCode
	): ConversationError {
		if (!(cause instanceof AudioManagerError)) {
			return new ConversationError(fallback, 'The audio device operation failed.', cause);
		}

		switch (cause.code) {
			case 'permission-denied':
			case 'insecure-context':
				return new ConversationError(cause.code, cause.message, cause);
			case 'device-not-found':
				return new ConversationError('device-not-found', cause.message, cause);
			case 'device-busy':
				return new ConversationError('device-busy', cause.message, cause);
			case 'constraints':
				return new ConversationError('device-constraints', cause.message, cause);
			case 'unsupported':
				return new ConversationError('not-supported', cause.message, cause);
			case 'device-switch-failed':
				return new ConversationError('device-switch-failed', cause.message, cause);
			default:
				return new ConversationError(fallback, cause.message, cause);
		}
	}

	/** Send a client frame if the socket is open. */
	private send(event: ClientEvent): boolean {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		try {
			this.options.onOutgoingEvent?.(event);
			socket.send(JSON.stringify(event));
			return true;
		} catch (cause) {
			this.debugLog('socket:send', 'Could not send a client frame.', {
				error: cause instanceof Error ? cause.message : String(cause)
			});
			return false;
		}
	}

	/** Update one transcript entry and notify listeners. */
	private updateTranscript(
		id: string,
		patch: Partial<Omit<TranscriptMessage, 'id' | 'role'>>
	): void {
		const index = this.transcripts.findIndex((message) => message.id === id);
		if (index === -1) return;
		const current = this.transcripts[index];
		this.transcripts[index] = { ...current, ...patch };
		this.notifyTranscript(this.transcripts[index]);
	}

	/** Insert a transcript entry, enforcing the configured cap. */
	private pushTranscript(message: TranscriptMessage): void {
		this.transcripts.push(message);
		const cap = Math.max(20, this.options.maxTranscripts ?? 250);
		if (this.transcripts.length > cap) {
			this.transcripts.splice(0, this.transcripts.length - cap);
		}
		this.notifyTranscript(message);
	}

	/** Create or update a final transcript entry. */
	private upsertTranscript(
		id: string,
		role: TranscriptMessage['role'],
		text: string,
		isFinal: boolean,
		eventId: number,
		extra?: Pick<TranscriptMessage, 'responseId' | 'attachments'>
	): void {
		const existing = this.transcripts.find((message) => message.id === id);
		if (existing) {
			this.updateTranscript(id, { text, isFinal, eventId, ...extra });
			return;
		}
		this.pushTranscript({
			id,
			role,
			text,
			isFinal,
			timestamp: Date.now(),
			eventId,
			...extra
		});
	}

	/** Invoke the optional transcript callbacks and update the latest message. */
	private notifyTranscript(message: TranscriptMessage): void {
		this.message = message;
		this.options.onTranscript?.(message);
		this.options.onMessage?.(message);
	}

	/** Measure time from user-final (or connect) to first agent audio. */
	private recordLatency(): void {
		if (this.latencyStartedAt === null) return;
		const milliseconds = Math.max(0, Math.round(performance.now() - this.latencyStartedAt));
		this.latencyStartedAt = null;
		this.latency = milliseconds;
		this.latencyHistory = [...this.latencyHistory.slice(-(MAX_LATENCY_HISTORY - 1)), milliseconds];
		this.options.onLatency?.(milliseconds);
	}

	/** Reset transient state before opening a session. */
	private resetForStart(): void {
		if (this.options.resetTranscriptsOnStart !== false) {
			this.transcripts = [];
		}
		this.agentStreamIds.clear();
		this.abortMCPApprovals();
		this.error = null;
		this.errorCode = null;
		this.lastErrorKey = '';
		this.lastErrorAt = 0;
		this.latency = null;
		this.message = null;
		this.conversationId = null;
		this.inputAudioFormat = null;
		this.outputAudioFormat = null;
		this.queueStatus = null;
		this.interruptions = 0;
		this.currentEventId = null;
		this.vadScore = 0;
		this.contextUsage = null;
		this.setCanSendFeedback(false);
		this.setSpeaking(false);
		this.isListening = false;
		this.setUserSpeaking(false);
		this.isMuted = this.options.micMuted === true;
		this.volume = 0;
		this.inputVolume = 0;
		this.outputVolume = 0;
		this.latencyStartedAt = null;
		this.lastInterruptionEventId = Number.NEGATIVE_INFINITY;
		this.lastInterruptionAt = Number.NEGATIVE_INFINITY;
		this.lastUserActivityAt = Number.NEGATIVE_INFINITY;
		this.syncMode();
	}

	/** Publish a human-readable error with deduplicated console output. */
	private publishError(error: ConversationError): void {
		this.error = error.message;
		this.errorCode = error.code;

		const now = Date.now();
		const key = `${error.code}:${error.message}`;
		if (key === this.lastErrorKey && now - this.lastErrorAt < 1_000) return;
		this.lastErrorKey = key;
		this.lastErrorAt = now;

		console.error(`[svelte-elevenlabs] ${error.message}`, error.cause ?? '');
		this.options.onError?.(error);
	}

	/** Set status and notify the consumer once per transition. */
	private setStatus(status: ConversationStatus): void {
		if (this.status === status) return;
		this.status = status;
		this.options.onStatusChange?.(status);
		this.syncMode();
	}

	/** Set the agent playback state and keep the mode label in sync. */
	private setSpeaking(speaking: boolean): void {
		if (this.isSpeaking === speaking) return;
		this.isSpeaking = speaking;
		this.syncMode();
	}

	/** Set the local user speech state and keep the mode label in sync. */
	private setUserSpeaking(speaking: boolean): void {
		if (this.isUserSpeaking === speaking) return;
		this.isUserSpeaking = speaking;
		this.syncMode();
	}

	/** Notify listeners when the derived mode label changes. */
	private syncMode(): void {
		const next = this.mode;
		if (next === this.lastMode) return;
		this.lastMode = next;
		this.options.onModeChange?.(next);
	}

	/** Update feedback availability and notify on transitions. */
	private setCanSendFeedback(canSendFeedback: boolean): void {
		if (this.canSendFeedback === canSendFeedback) return;
		this.canSendFeedback = canSendFeedback;
		this.options.onCanSendFeedbackChange?.(canSendFeedback);
	}

	/** Merge text only mode into the configured conversation overrides. */
	private buildOverrides() {
		const overrides = this.options.overrides;
		const textOnly = this.isTextOnly;
		if (!overrides && !textOnly) return undefined;
		return {
			...overrides,
			conversation: {
				...overrides?.conversation,
				text_only: textOnly
			}
		};
	}

	/** Clear handshake and keep-alive timers. */
	private clearTimers(): void {
		if (this.handshakeTimer) {
			clearTimeout(this.handshakeTimer);
			this.handshakeTimer = null;
		}
		for (const timer of this.pingTimers) {
			clearTimeout(timer);
		}
		this.pingTimers.clear();
	}

	/** Abort an in-flight signed URL request. */
	private abortSignedUrlRequest(): void {
		this.signedUrlAbort?.abort();
		this.signedUrlAbort = null;
	}

	/** Register the pagehide safety net. */
	private removePageHideListener(): void {
		if (BROWSER) window.removeEventListener('pagehide', this.pageHideHandler);
	}

	/** Check whether an async start step is still current. */
	private isCurrent(token: number): boolean {
		return token === this.sessionToken && !this.destroyed;
	}

	/** Structured debug logging gated by `options.debug`. */
	private debugLog(kind: string, message: string, data?: Record<string, unknown>): void {
		if (!this.options.debug) return;
		const event: DebugEvent = { kind, message, data };
		console.debug(`[svelte-elevenlabs] ${message}`, data ?? '');
		this.options.onDebug?.(event);
	}

	/** Convert unknown failures into a public, typed error. */
	private toConversationError(cause: unknown, fallback: ConversationErrorCode): ConversationError {
		if (cause instanceof ConversationError) return cause;
		if (cause instanceof AudioManagerError) {
			return this.toAudioConversationError(cause, fallback);
		}
		return new ConversationError(
			fallback,
			'Could not start the conversation. Check the browser console for details.',
			cause
		);
	}
}

/**
 * Create a reactive conversation controller tied to the current component.
 *
 * Must be called during component initialisation (top level of `<script>`).
 * A teardown effect closes the socket, microphone, audio contexts, and timers
 * when the component unmounts. Pass `autoCleanup: false` and call
 * {@link ConversationController.destroy} yourself when using the controller
 * outside a component.
 *
 * @param options - Agent defaults, tuning, and callbacks.
 * @returns A reactive controller whose state can be read directly in markup.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { useConversation } from 'svelte-elevenlabs';
 *   const conversation = useConversation({ agentId: 'agent_…' });
 * </script>
 * <button onclick={() => conversation.startConversation()}>Talk</button>
 * ```
 */
export function useConversation(options: ConversationOptions = {}): ConversationController {
	const controller = new ConversationController(options);
	if (options.autoCleanup !== false) {
		$effect(() => {
			return () => {
				controller.destroy();
			};
		});
	}
	return controller;
}

/**
 * Create a conversation controller without registering an `$effect` teardown.
 *
 * Use this in stores, tests, or any context where `$effect` is unavailable.
 * The caller is responsible for calling {@link ConversationController.destroy}.
 *
 * @param options - Agent defaults, tuning, and callbacks.
 * @returns A controller the caller must destroy when finished.
 */
export function createConversation(options: ConversationOptions = {}): ConversationController {
	return new ConversationController(options);
}
