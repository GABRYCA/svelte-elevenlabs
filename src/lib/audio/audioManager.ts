import { BROWSER } from 'esm-env';
import type { AudioEncoding, AudioFormat, AudioFormatId } from '../types/index.js';

/**
 * Failure categories emitted by {@link AudioManager}.
 *
 * These are deliberately more specific than the browser's `DOMException`
 * names so UI code can present a useful recovery path.
 */
export type AudioManagerErrorCode =
	| 'unsupported'
	| 'insecure-context'
	| 'permission-denied'
	| 'device-not-found'
	| 'device-busy'
	| 'constraints'
	| 'context-failed'
	| 'worklet-failed'
	| 'decode-failed'
	| 'unsupported-format'
	| 'device-switch-failed'
	| 'closed';

/**
 * Typed error thrown by the audio layer.
 *
 * `message` is written for humans; `cause` is the original browser error and
 * is intended for the console, not for the UI.
 */
export class AudioManagerError extends Error {
	/** Stable failure category. */
	readonly code: AudioManagerErrorCode;
	/** Original error, when one exists. */
	readonly cause?: unknown;

	/**
	 * @param code - Stable failure category.
	 * @param message - Human-readable explanation and recovery hint.
	 * @param cause - Optional original browser error.
	 */
	constructor(code: AudioManagerErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = 'AudioManagerError';
		this.code = code;
		this.cause = cause;
	}
}

/** Normalized levels, all in the `0..1` range. */
export interface AudioLevels {
	/** Microphone RMS level. Zero while muted. */
	input: number;
	/** Playback RMS level. */
	output: number;
	/** The louder of the two, useful for a single reactive value. */
	combined: number;
}

/** One audio input or output device exposed by the browser. */
export interface AudioDeviceInfo {
	/** Stable device id. It can change after the page reloads. */
	deviceId: string;
	/** Human readable label, often empty before permission is granted. */
	label: string;
	/** Device direction. */
	kind: 'audioinput' | 'audiooutput';
	/** Group id shared by devices on the same physical hardware. */
	groupId: string;
}

/** Callbacks and tuning knobs for {@link AudioManager}. */
export interface AudioManagerOptions {
	/** Called with base64 PCM16 little-endian mono chunks for the socket. */
	onInputChunk?: (base64: string) => void;
	/** Called at roughly 30 fps with smoothed input/output levels. */
	onLevels?: (levels: AudioLevels) => void;
	/** Called when local voice activity starts or ends. */
	onUserSpeakingChange?: (speaking: boolean) => void;
	/** Called when agent playback starts or drains. */
	onPlaybackChange?: (playing: boolean) => void;
	/** Called after a local barge-in flush. */
	onLocalInterruption?: () => void;
	/** Called for audio-layer failures that do not tear down the socket. */
	onError?: (error: AudioManagerError) => void;
	/** Microphone chunk duration in milliseconds. Clamped to 50 to 250. Defaults to 100. */
	inputChunkDurationMs?: number;
	/** Flush playback when the local VAD detects speech. Defaults to `true`. */
	interruptOnUserSpeech?: boolean;
	/** Normalized RMS threshold for speech detection. Defaults to `0.075`. */
	vadThreshold?: number;
	/** Preferred microphone device id. */
	inputDeviceId?: string;
	/** Preferred output device id, when the browser supports output routing. */
	outputDeviceId?: string;
}

/** Internal playback bookkeeping for one scheduled audio chunk. */
interface PlaybackEntry {
	source: AudioBufferSourceNode;
	gain: GainNode;
}

const CAPTURE_WORKLET_NAME = 'svelte-elevenlabs-capture';
const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHUNK_MS = 100;
const VAD_ATTACK_FRAMES = 2;
const VAD_RELEASE_FRAMES = 8;
/** Keep dropping agent chunks for a moment after a barge-in or user speech. */
const PLAYBACK_SUPPRESSION_MS = 300;
/**
 * Wait this long after the last scheduled chunk before reporting idle.
 * TTS streams sentence by sentence, and the gap between sentences can be
 * close to a second, so a short gap does not mean the response is finished.
 */
const PLAYBACK_IDLE_GRACE_MS = 1_000;

/** Stop every track on a media stream, even after the manager was closed. */
function stopStream(stream: MediaStream | null): void {
	if (!stream) return;
	for (const track of stream.getTracks()) {
		try {
			track.stop();
		} catch {
			// The track may already have ended.
		}
	}
}

/**
 * Inline AudioWorklet source.
 *
 * It accumulates raw float samples and transfers a fixed-size buffer to the
 * main thread. Resampling and base64 encoding happen off the audio thread,
 * which keeps the worklet trivial and avoids GC pauses in the render quantum.
 */
const CAPTURE_WORKLET_SOURCE = `
class SvelteElevenLabsCapture extends AudioWorkletProcessor {
	constructor() {
		super();
		this.chunkFrames = 2048;
		this.buffer = new Float32Array(this.chunkFrames);
		this.offset = 0;
		this.muted = false;
		this.port.onmessage = (event) => {
			const data = event.data || {};
			if (data.type === 'config' && Number.isFinite(data.chunkFrames)) {
				this.chunkFrames = Math.max(128, Math.floor(data.chunkFrames));
				this.buffer = new Float32Array(this.chunkFrames);
				this.offset = 0;
			} else if (data.type === 'muted') {
				this.muted = Boolean(data.muted);
				if (this.muted) this.offset = 0;
			}
		};
	}

	process(inputs) {
		const input = inputs[0];
		const channel = input && input[0];
		if (!channel || this.muted) return true;

		let read = 0;
		while (read < channel.length) {
			const remaining = this.chunkFrames - this.offset;
			const take = Math.min(remaining, channel.length - read);
			this.buffer.set(channel.subarray(read, read + take), this.offset);
			this.offset += take;
			read += take;

			if (this.offset === this.chunkFrames) {
				const chunk = this.buffer;
				this.port.postMessage({ type: 'chunk', buffer: chunk }, [chunk.buffer]);
				this.buffer = new Float32Array(this.chunkFrames);
				this.offset = 0;
			}
		}
		return true;
	}
}

registerProcessor('__SVELTE_ELEVENLABS_CAPTURE__', SvelteElevenLabsCapture);
`;

/**
 * Parse an ElevenLabs audio format id (e.g. `pcm_16000`) into a descriptor.
 *
 * @param format - Wire format id from the initiation metadata.
 * @returns A validated mono audio format.
 * @throws {AudioManagerError} When the format is malformed or unsupported.
 */
export function parseAudioFormat(format: AudioFormatId | string): AudioFormat {
	const match = /^(pcm|ulaw)_(\d{4,5})$/.exec(format);
	if (!match) {
		throw new AudioManagerError(
			'unsupported-format',
			`Unsupported audio format "${format}". Expected pcm_<rate> or ulaw_8000.`
		);
	}

	const sampleRate = Number.parseInt(match[2], 10);
	if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 48_000) {
		throw new AudioManagerError(
			'unsupported-format',
			`Unsupported sample rate in "${format}". Supported rates are 8000 to 48000 Hz.`
		);
	}
	if (match[1] === 'ulaw' && sampleRate !== 8_000) {
		throw new AudioManagerError(
			'unsupported-format',
			`Unsupported format "${format}". G.711 µ-law audio is only valid at 8000 Hz.`
		);
	}

	return {
		encoding: match[1] as AudioEncoding,
		sampleRate,
		channels: 1
	};
}

/**
 * Enumerate the audio input and output devices the browser exposes.
 *
 * Labels can be empty until the user grants microphone permission. Output
 * devices are only listed by browsers that support audio output routing.
 *
 * @returns Audio devices in the order reported by the browser.
 */
export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
	if (
		!BROWSER ||
		typeof navigator === 'undefined' ||
		typeof navigator.mediaDevices?.enumerateDevices !== 'function'
	) {
		return [];
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices
		.filter(
			(device): device is MediaDeviceInfo & { kind: 'audioinput' | 'audiooutput' } =>
				device.kind === 'audioinput' || device.kind === 'audiooutput'
		)
		.map((device) => ({
			deviceId: device.deviceId,
			label: device.label || (device.kind === 'audioinput' ? 'Microphone' : 'Speaker'),
			kind: device.kind,
			groupId: device.groupId
		}));
}

/**
 * Resample mono float audio with linear interpolation.
 *
 * The capture graph applies a low-pass filter before decimation, so this
 * function is only responsible for the rate change itself. Linear
 * interpolation is cheap, deterministic, and more than adequate for 16 kHz
 * voice after the anti-aliasing filter.
 *
 * @param samples - Source samples in the `-1..1` range.
 * @param sourceRate - Source sample rate in Hz.
 * @param targetRate - Destination sample rate in Hz.
 * @returns A new array at the target rate. Returns a copy when the rates match.
 */
export function resampleLinear(
	samples: Float32Array,
	sourceRate: number,
	targetRate: number
): Float32Array<ArrayBuffer> {
	if (samples.length === 0 || sourceRate === targetRate) {
		return new Float32Array(samples);
	}
	if (sourceRate <= 0 || targetRate <= 0) {
		throw new AudioManagerError('unsupported-format', 'Sample rates must be positive numbers.');
	}

	const ratio = sourceRate / targetRate;
	const outputLength = Math.max(1, Math.round(samples.length / ratio));
	const output = new Float32Array(outputLength);
	const lastIndex = samples.length - 1;

	for (let i = 0; i < outputLength; i += 1) {
		const position = i * ratio;
		const index = Math.floor(position);
		const fraction = position - index;
		const a = samples[Math.min(index, lastIndex)];
		const b = samples[Math.min(index + 1, lastIndex)];
		output[i] = a + (b - a) * fraction;
	}

	return output;
}

/**
 * Encode mono float samples as base64 PCM16 little-endian.
 *
 * This is the exact payload ElevenLabs expects in `user_audio_chunk`.
 *
 * @param samples - Samples in the `-1..1` range.
 * @returns Base64 string without a data-URL prefix.
 */
export function encodePcm16Base64(samples: Float32Array): string {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);

	for (let i = 0; i < samples.length; i += 1) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
		view.setInt16(i * 2, int16, true);
	}

	return bytesToBase64(bytes);
}

/**
 * Decode base64 PCM16 little-endian audio into float samples.
 *
 * @param base64 - Payload from an `audio` event.
 * @returns Mono samples in the `-1..1` range.
 * @throws {AudioManagerError} When the payload is not valid base64 or is empty.
 */
export function decodePcm16(base64: string): Float32Array<ArrayBuffer> {
	const bytes = base64ToBytes(base64);
	if (bytes.byteLength < 2) {
		throw new AudioManagerError('decode-failed', 'Received an empty audio chunk.');
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const sampleCount = Math.floor(bytes.byteLength / 2);
	const output = new Float32Array(sampleCount);

	for (let i = 0; i < sampleCount; i += 1) {
		output[i] = view.getInt16(i * 2, true) / 0x8000;
	}

	return output;
}

/**
 * Decode 8-bit G.711 µ-law audio into float samples.
 *
 * @param bytes - Raw µ-law bytes.
 * @returns Mono samples in the `-1..1` range.
 */
export function decodeUlaw(bytes: Uint8Array): Float32Array<ArrayBuffer> {
	const output = new Float32Array(bytes.length);

	for (let i = 0; i < bytes.length; i += 1) {
		const value = ~bytes[i] & 0xff;
		const sign = value & 0x80 ? -1 : 1;
		const exponent = (value & 0x70) >> 4;
		const mantissa = value & 0x0f;
		const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
		output[i] = (sign * magnitude) / 0x8000;
	}

	return output;
}

/**
 * Decode any negotiated agent audio chunk into float samples.
 *
 * @param base64 - Base64 payload from the socket.
 * @param format - Negotiated output format.
 * @returns Mono samples in the `-1..1` range.
 */
export function decodeAudioChunk(base64: string, format: AudioFormat): Float32Array<ArrayBuffer> {
	if (format.encoding === 'ulaw') {
		return decodeUlaw(base64ToBytes(base64));
	}
	return decodePcm16(base64);
}

/** Convert bytes to base64 without overflowing the argument stack. */
function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;

	for (let i = 0; i < bytes.length; i += chunkSize) {
		const end = Math.min(i + chunkSize, bytes.length);
		for (let j = i; j < end; j += 1) {
			binary += String.fromCharCode(bytes[j]);
		}
	}

	return btoa(binary);
}

/** Convert base64 to bytes with a clear error on malformed input. */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
	if (!base64) {
		throw new AudioManagerError('decode-failed', 'Received an empty audio payload.');
	}

	try {
		const binary = atob(base64.replace(/\s/g, ''));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	} catch (cause) {
		throw new AudioManagerError(
			'decode-failed',
			'Could not decode the audio chunk. The payload was not valid base64.',
			cause
		);
	}
}

/**
 * Low-level Web Audio manager for one conversation.
 *
 * Responsibilities:
 * - request microphone access with sensible echo-cancellation constraints;
 * - capture at the browser's native rate, anti-alias, and resample to the
 *   negotiated ElevenLabs input rate;
 * - schedule agent PCM/µ-law chunks through a single playback clock so
 *   chunks never overlap;
 * - expose analyser data for visualizers;
 * - flush queued playback immediately on barge-in;
 * - close every track, node, worklet, timer and context on teardown.
 *
 * Create one instance per conversation. The class is browser-only.
 */
export class AudioManager {
	#options: AudioManagerOptions;
	#inputContext: AudioContext | null = null;
	#outputContext: AudioContext | null = null;
	#inputStream: MediaStream | null = null;
	#inputSource: MediaStreamAudioSourceNode | null = null;
	#inputFilter: BiquadFilterNode | null = null;
	#inputAnalyser: AnalyserNode | null = null;
	#inputCapture: AudioWorkletNode | ScriptProcessorNode | null = null;
	#inputSink: GainNode | null = null;
	#inputWorkletUrl: string | null = null;
	#fallbackBuffer: Float32Array<ArrayBuffer> | null = null;
	#fallbackOffset = 0;
	#outputGain: GainNode | null = null;
	#outputAnalyser: AnalyserNode | null = null;
	#playback = new Set<PlaybackEntry>();
	#playbackGeneration = 0;
	#nextStartTime = 0;
	#idleTimer: ReturnType<typeof setTimeout> | null = null;
	#outputActive = false;
	#inputDeviceId: string | null = null;
	#outputDeviceId: string | null = null;
	#captureGeneration = 0;
	#inputFormat: AudioFormat | null = null;
	#inputActualRate = DEFAULT_SAMPLE_RATE;
	#muted = false;
	#prepared = false;
	#closed = false;
	#inputStarted = false;
	#raf = 0;
	#lastFrameTime = 0;
	#inputVolume = 0;
	#outputVolume = 0;
	#inputTimeData: Uint8Array<ArrayBuffer> | null = null;
	#outputTimeData: Uint8Array<ArrayBuffer> | null = null;
	#userSpeaking = false;
	#speechFrames = 0;
	#silenceFrames = 0;
	#suppressPlaybackUntil = 0;
	#lastReportedKey = '';
	#lastReportedAt = 0;

	/**
	 * @param options - Callbacks and audio tuning. All callbacks are optional.
	 */
	constructor(options: AudioManagerOptions = {}) {
		this.#options = options;
		this.#inputDeviceId = options.inputDeviceId?.trim() || null;
		this.#outputDeviceId = options.outputDeviceId?.trim() || null;
	}

	/**
	 * Whether this browser exposes the APIs required by the manager.
	 *
	 * A `true` result does not guarantee microphone permission; it only means
	 * the platform can run the audio graph.
	 */
	static isSupported(): boolean {
		return (
			BROWSER &&
			typeof window !== 'undefined' &&
			typeof AudioContext !== 'undefined' &&
			typeof navigator !== 'undefined' &&
			typeof navigator.mediaDevices?.getUserMedia === 'function'
		);
	}

	/** Whether microphone chunks are currently suppressed. */
	get isInputMuted(): boolean {
		return this.#muted;
	}

	/** Whether agent audio is currently scheduled or playing. */
	get isOutputActive(): boolean {
		return this.#outputActive;
	}

	/** Actual sample rate of the capture context (may differ from the target). */
	get inputSampleRate(): number {
		return this.#inputActualRate;
	}

	/** Actual sample rate of the playback context. */
	get outputSampleRate(): number {
		return this.#outputContext?.sampleRate ?? 0;
	}

	/** Preferred microphone device id, when one is configured. */
	get inputDeviceId(): string | null {
		return this.#inputDeviceId;
	}

	/** Preferred output device id, when one is configured. */
	get outputDeviceId(): string | null {
		return this.#outputDeviceId;
	}

	/**
	 * Request microphone access and create both audio contexts.
	 *
	 * Call this from a user gesture (a click or key press) so browsers allow
	 * playback to start. Safe to call more than once.
	 *
	 * @throws {AudioManagerError} When the browser is unsupported, the page is
	 * not a secure context, or microphone permission is denied.
	 */
	async prepare(): Promise<void> {
		if (this.#closed) {
			throw new AudioManagerError('closed', 'This AudioManager has already been closed.');
		}
		if (this.#prepared) {
			await this.#resumeContexts();
			return;
		}
		if (!AudioManager.isSupported()) {
			throw new AudioManagerError(
				'unsupported',
				'This browser does not support the Web Audio and microphone APIs required for voice conversations.'
			);
		}
		if (typeof window !== 'undefined' && !window.isSecureContext) {
			throw new AudioManagerError(
				'insecure-context',
				'Microphone access requires HTTPS or localhost. Open this page over a secure context and try again.'
			);
		}

		let stream: MediaStream;
		let inputContext: AudioContext | null = null;
		let outputContext: AudioContext | null = null;

		try {
			stream = await this.#openInputStream();

			/*
			 * stopConversation() can close the manager while the permission
			 * prompt is open. Stop the fresh stream instead of installing it on
			 * an already disposed graph.
			 */
			if (this.#closed) {
				stopStream(stream);
				throw new AudioManagerError(
					'closed',
					'The conversation ended before microphone access was granted.'
				);
			}

			try {
				inputContext = this.#createInputContext();
				outputContext = new AudioContext({ latencyHint: 'interactive' });
			} catch (cause) {
				stopStream(stream);
				await Promise.all([this.#closeContext(inputContext), this.#closeContext(outputContext)]);
				throw new AudioManagerError(
					'context-failed',
					'Could not create the Web Audio contexts required for the conversation.',
					cause
				);
			}

			this.#inputStream = stream;
			this.#inputContext = inputContext;
			this.#inputActualRate = inputContext.sampleRate;
			this.#outputContext = outputContext;
			this.#createOutputGraph();
			await this.#applyOutputDevice();
			this.#prepared = true;

			await this.#resumeContexts();
			if (this.#closed) {
				throw new AudioManagerError('closed', 'The conversation ended while audio was starting.');
			}
			this.#startMonitor();
		} catch (cause) {
			await this.close();
			throw cause instanceof AudioManagerError ? cause : this.#mapGetUserMediaError(cause);
		}
	}

	/**
	 * Start capturing microphone audio and resampling it to the negotiated
	 * format. Requires a completed call to {@link prepare}.
	 *
	 * @param format - Input format from `conversation_initiation_metadata`.
	 * @throws {AudioManagerError} When preparation is missing or the graph fails.
	 */
	async startInput(format: AudioFormat | AudioFormatId): Promise<void> {
		if (this.#closed) {
			throw new AudioManagerError('closed', 'This AudioManager has already been closed.');
		}
		if (!this.#prepared || !this.#inputContext || !this.#inputStream) {
			await this.prepare();
		}
		if (this.#closed) {
			throw new AudioManagerError(
				'closed',
				'The conversation ended while the microphone was starting.'
			);
		}
		if (!this.#inputContext || !this.#inputStream) {
			throw new AudioManagerError('context-failed', 'The microphone audio graph is not available.');
		}

		const parsedFormat = typeof format === 'string' ? parseAudioFormat(format) : format;
		if (this.#inputStarted) {
			this.#inputFormat = parsedFormat;
			return;
		}

		this.#inputFormat = parsedFormat;
		await this.#buildInputGraph(parsedFormat);
	}

	/** Build the capture graph for the current input stream and format. */
	async #buildInputGraph(parsedFormat: AudioFormat): Promise<void> {
		const context = this.#inputContext;
		const stream = this.#inputStream;
		if (!context || !stream) {
			throw new AudioManagerError('context-failed', 'The microphone audio graph is not available.');
		}

		this.#inputActualRate = context.sampleRate;

		let source: MediaStreamAudioSourceNode | null = null;
		let analyser: AnalyserNode | null = null;
		let filter: BiquadFilterNode | null = null;
		let sink: GainNode | null = null;
		let captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;

		try {
			source = context.createMediaStreamSource(stream);
			analyser = context.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.78;
			analyser.minDecibels = -90;
			analyser.maxDecibels = -10;

			filter = context.createBiquadFilter();
			filter.type = 'lowpass';
			filter.Q.value = 0.707;
			// Guard against aliasing only when the browser could not grant the requested rate.
			filter.frequency.value =
				this.#inputActualRate > parsedFormat.sampleRate
					? Math.min(parsedFormat.sampleRate * 0.45, this.#inputActualRate * 0.45)
					: Math.min(this.#inputActualRate * 0.45, 8_000);

			sink = context.createGain();
			sink.gain.value = 0;

			source.connect(filter);
			filter.connect(analyser);

			const capture = await this.#createCaptureNode(context);
			captureNode = capture.node;

			if (this.#closed) {
				throw new AudioManagerError(
					'closed',
					'The conversation ended while the microphone processor was loading.'
				);
			}

			analyser.connect(captureNode);
			captureNode.connect(sink);
			sink.connect(context.destination);

			await context.resume();
			if (this.#closed) {
				throw new AudioManagerError(
					'closed',
					'The conversation ended while the microphone was starting.'
				);
			}

			this.#inputSource = source;
			this.#inputFilter = filter;
			this.#inputAnalyser = analyser;
			this.#inputCapture = captureNode;
			this.#inputSink = sink;
			this.#inputStarted = true;
		} catch (cause) {
			for (const node of [source, filter, analyser, captureNode, sink]) {
				this.#disconnectNode(node);
			}

			const error =
				cause instanceof AudioManagerError
					? cause
					: new AudioManagerError(
							'worklet-failed',
							'Could not start the microphone capture processor. Try reloading the page.',
							cause
						);
			this.#report(error);
			throw error;
		}
	}

	/**
	 * Mute or unmute the outgoing microphone stream without stopping the
	 * underlying device.
	 *
	 * @param muted - `true` to stop sending audio chunks.
	 */
	setInputMuted(muted: boolean): void {
		this.#muted = muted;
		this.#inputVolume = 0;

		if (typeof AudioWorkletNode !== 'undefined' && this.#inputCapture instanceof AudioWorkletNode) {
			this.#inputCapture.port.postMessage({ type: 'muted', muted });
		}
		if (this.#fallbackBuffer) {
			this.#fallbackBuffer.fill(0);
			this.#fallbackOffset = 0;
		}
		if (muted && this.#userSpeaking) {
			this.#setUserSpeaking(false);
		}
	}

	/**
	 * Switch the microphone while a session is running.
	 *
	 * The new stream is requested before the old graph is torn down, so a
	 * failed permission check leaves the current microphone untouched. Call
	 * this from a user gesture when the browser requires one for device access.
	 *
	 * @param deviceId - Target input device id, or `undefined` for the browser default.
	 * @throws {AudioManagerError} When the new stream cannot be opened.
	 */
	async changeInputDevice(deviceId?: string): Promise<void> {
		if (this.#closed) {
			throw new AudioManagerError('closed', 'This AudioManager has already been closed.');
		}

		const previous = this.#inputDeviceId;
		const next = deviceId?.trim() || null;
		this.#inputDeviceId = next;
		if (!this.#prepared || !this.#inputContext) return;

		let stream: MediaStream;
		try {
			stream = await this.#openInputStream();
		} catch (cause) {
			// Keep the previous preference so a failed switch can fall back to it.
			this.#inputDeviceId = previous;
			throw cause instanceof AudioManagerError ? cause : this.#mapGetUserMediaError(cause);
		}

		if (this.#closed) {
			this.#inputDeviceId = previous;
			stopStream(stream);
			throw new AudioManagerError(
				'closed',
				'The conversation ended while the input device was changing.'
			);
		}

		const wasStarted = this.#inputStarted;
		const format = this.#inputFormat;
		this.#teardownInputGraph();
		this.#inputStream = stream;
		this.#inputActualRate = this.#inputContext.sampleRate;

		if (wasStarted && format) {
			try {
				await this.#buildInputGraph(format);
			} catch (cause) {
				this.#inputDeviceId = previous;
				stopStream(stream);
				this.#inputStream = null;
				const error =
					cause instanceof AudioManagerError
						? cause
						: new AudioManagerError(
								'device-switch-failed',
								'Could not switch the microphone. Select another input device and try again.',
								cause
							);
				this.#report(error);
				throw error;
			}
		}
	}

	/**
	 * Route playback to a specific output device.
	 *
	 * This requires `AudioContext.setSinkId`, which browsers expose
	 * selectively. When no output context exists yet, the id is stored and
	 * applied by {@link prepare}.
	 *
	 * @param deviceId - Target output device id, or `undefined` for the default.
	 * @throws {AudioManagerError} When the browser cannot route output or the device fails.
	 */
	async changeOutputDevice(deviceId?: string): Promise<void> {
		if (this.#closed) {
			throw new AudioManagerError('closed', 'This AudioManager has already been closed.');
		}

		const next = deviceId?.trim() || null;
		if (!this.#outputContext) {
			this.#outputDeviceId = next;
			return;
		}

		const context = this.#outputContext as AudioContext & {
			setSinkId?: (sinkId: string) => Promise<void>;
		};
		if (typeof context.setSinkId !== 'function') {
			throw new AudioManagerError(
				'unsupported',
				'This browser cannot route audio to a specific output device.'
			);
		}

		try {
			await context.setSinkId(next ?? '');
			this.#outputDeviceId = next;
		} catch (cause) {
			throw new AudioManagerError(
				'device-switch-failed',
				'Could not switch the output device. Check that the device is still connected.',
				cause
			);
		}
	}

	/**
	 * Set the playback gain.
	 *
	 * @param volume - Linear gain from `0` to `1`.
	 */
	setOutputVolume(volume: number): void {
		if (this.#outputGain && this.#outputContext) {
			const clamped = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
			this.#outputGain.gain.setValueAtTime(clamped, this.#outputContext.currentTime);
		}
	}

	/**
	 * Schedule one base64 audio chunk for gapless playback.
	 *
	 * @param base64 - Base64 payload from an `audio` server event.
	 * @param format - Negotiated agent output format.
	 * @returns `true` when the chunk was scheduled.
	 */
	playAudioChunk(base64: string, format: AudioFormat | AudioFormatId): boolean {
		if (this.#closed) return false;
		const ctx = this.#outputContext;
		const master = this.#outputGain;
		if (!ctx || !master) return false;

		const parsed = typeof format === 'string' ? parseAudioFormat(format) : format;

		// Drop late chunks while the user is barging in, and for a short
		// grace period after the interruption. Checking only the timestamp
		// let agent audio resume after 300 ms even while the user was still
		// speaking.
		if (
			this.#options.interruptOnUserSpeech !== false &&
			(this.#userSpeaking || performance.now() < this.#suppressPlaybackUntil)
		) {
			return false;
		}

		try {
			const samples = decodeAudioChunk(base64, parsed);
			if (samples.length === 0) return false;

			const buffer = ctx.createBuffer(1, samples.length, parsed.sampleRate);
			buffer.getChannelData(0).set(samples);

			if (ctx.state === 'suspended') {
				void ctx.resume().catch(() => {
					// The next user gesture will unlock the context; chunks are still queued.
				});
			}

			const source = ctx.createBufferSource();
			source.buffer = buffer;

			const gain = ctx.createGain();
			gain.gain.value = 1;
			source.connect(gain);
			gain.connect(master);

			const now = ctx.currentTime;
			if (this.#nextStartTime < now) {
				this.#nextStartTime = now + 0.02;
			}
			// Fast TTS streams can deliver many seconds of audio in a few
			// seconds. Keep every chunk in order; resetting the cursor here
			// collapsed the backlog into overlapping audio and made responses
			// sound truncated. A real stall is handled by the branch above
			// when the context clock catches up with the scheduled cursor.
			const startAt = this.#nextStartTime;
			source.start(startAt);
			this.#nextStartTime = startAt + buffer.duration;

			const entry: PlaybackEntry = { source, gain };
			this.#playback.add(entry);
			source.onended = () => {
				this.#playback.delete(entry);
				try {
					source.disconnect();
					gain.disconnect();
				} catch {
					// Already disconnected by a flush.
				}
			};

			this.#setOutputActive(true);
			this.#scheduleIdleCheck();
			return true;
		} catch (cause) {
			this.#report(
				cause instanceof AudioManagerError
					? cause
					: new AudioManagerError('decode-failed', 'Could not play the agent audio chunk.', cause)
			);
			return false;
		}
	}

	/**
	 * Immediately flush all queued and currently playing agent audio.
	 *
	 * A 12 ms gain ramp avoids a click while still feeling instantaneous.
	 * Safe to call when nothing is playing.
	 */
	flushPlayback(): void {
		this.#playbackGeneration += 1;
		if (this.#idleTimer) {
			clearTimeout(this.#idleTimer);
			this.#idleTimer = null;
		}

		const ctx = this.#outputContext;
		if (ctx) {
			const now = ctx.currentTime;
			for (const { source, gain } of this.#playback) {
				try {
					gain.gain.cancelScheduledValues(now);
					gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
					gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
					source.stop(now + 0.02);
				} catch {
					// A source may already have ended.
				}
			}
		}

		this.#playback.clear();
		this.#nextStartTime = 0;
		this.#suppressPlaybackUntil = performance.now() + PLAYBACK_SUPPRESSION_MS;
		this.#setOutputActive(false);
	}

	/**
	 * Read the current microphone frequency bins.
	 *
	 * @param target - Optional reusable buffer. It must be at least
	 * `frequencyBinCount` bytes long.
	 * @returns The filled buffer, or zeros when capture is not running.
	 */
	getInputFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		const analyser = this.#inputAnalyser;
		const buffer = target ?? new Uint8Array(analyser?.frequencyBinCount ?? 512);
		if (!analyser || this.#muted) {
			buffer.fill(0);
			return buffer;
		}
		analyser.getByteFrequencyData(buffer);
		return buffer;
	}

	/**
	 * Read the current agent playback frequency bins.
	 *
	 * @param target - Optional reusable buffer. It must be at least
	 * `frequencyBinCount` bytes long.
	 * @returns The filled buffer, or zeros when playback is not running.
	 */
	getOutputFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
		const analyser = this.#outputAnalyser;
		const buffer = target ?? new Uint8Array(analyser?.frequencyBinCount ?? 512);
		if (!analyser) {
			buffer.fill(0);
			return buffer;
		}
		analyser.getByteFrequencyData(buffer);
		return buffer;
	}

	/** Expose the microphone analyser for custom visualizers. */
	getInputAnalyser(): AnalyserNode | null {
		return this.#inputAnalyser;
	}

	/** Expose the playback analyser for custom visualizers. */
	getOutputAnalyser(): AnalyserNode | null {
		return this.#outputAnalyser;
	}

	/** Latest normalized microphone RMS level. */
	getInputVolume(): number {
		return this.#muted ? 0 : this.#inputVolume;
	}

	/** Latest normalized playback RMS level. */
	getOutputVolume(): number {
		return this.#outputVolume;
	}

	/**
	 * Stop every track and close every audio context.
	 *
	 * Idempotent. Pending playback is stopped immediately; no timers, rAF
	 * callbacks, worklet URLs, or media tracks are left behind.
	 */
	async close(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;

		if (this.#raf) {
			cancelAnimationFrame(this.#raf);
			this.#raf = 0;
		}
		if (this.#idleTimer) {
			clearTimeout(this.#idleTimer);
			this.#idleTimer = null;
		}
		this.#playbackGeneration += 1;
		for (const { source, gain } of this.#playback) {
			try {
				source.stop();
				source.disconnect();
				gain.disconnect();
			} catch {
				// Best-effort teardown.
			}
		}
		this.#playback.clear();
		this.#outputActive = false;
		this.#userSpeaking = false;

		stopStream(this.#inputStream);

		if (typeof AudioWorkletNode !== 'undefined' && this.#inputCapture instanceof AudioWorkletNode) {
			this.#inputCapture.port.onmessage = null;
		}

		this.#disconnectNode(this.#inputSource);
		this.#disconnectNode(this.#inputFilter);
		this.#disconnectNode(this.#inputAnalyser);
		this.#disconnectNode(this.#inputCapture);
		this.#disconnectNode(this.#inputSink);
		this.#disconnectNode(this.#outputGain);
		this.#disconnectNode(this.#outputAnalyser);

		this.#inputSource = null;
		this.#inputFilter = null;
		this.#inputAnalyser = null;
		this.#inputCapture = null;
		this.#inputSink = null;
		this.#outputGain = null;
		this.#outputAnalyser = null;

		if (this.#inputWorkletUrl) {
			URL.revokeObjectURL(this.#inputWorkletUrl);
			this.#inputWorkletUrl = null;
		}

		const contexts = [this.#inputContext, this.#outputContext];
		this.#inputContext = null;
		this.#outputContext = null;
		this.#inputStream = null;
		this.#prepared = false;
		this.#inputStarted = false;

		await Promise.all(contexts.map((context) => this.#closeContext(context)));
	}

	/** Open a microphone stream for the current device preference. */
	async #openInputStream(): Promise<MediaStream> {
		const audio: MediaTrackConstraints = {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			channelCount: { ideal: 1 },
			sampleRate: { ideal: DEFAULT_SAMPLE_RATE }
		};
		if (this.#inputDeviceId) audio.deviceId = { exact: this.#inputDeviceId };

		return navigator.mediaDevices.getUserMedia({ audio, video: false });
	}

	/** Stop the active stream and release the capture graph without closing the context. */
	#teardownInputGraph(): void {
		stopStream(this.#inputStream);

		if (typeof AudioWorkletNode !== 'undefined' && this.#inputCapture instanceof AudioWorkletNode) {
			this.#inputCapture.port.onmessage = null;
		}
		if (
			typeof ScriptProcessorNode !== 'undefined' &&
			this.#inputCapture instanceof ScriptProcessorNode
		) {
			this.#inputCapture.onaudioprocess = null;
		}

		this.#disconnectNode(this.#inputSource);
		this.#disconnectNode(this.#inputFilter);
		this.#disconnectNode(this.#inputAnalyser);
		this.#disconnectNode(this.#inputCapture);
		this.#disconnectNode(this.#inputSink);

		this.#inputStream = null;
		this.#inputSource = null;
		this.#inputFilter = null;
		this.#inputAnalyser = null;
		this.#inputCapture = null;
		this.#inputSink = null;
		this.#fallbackBuffer = null;
		this.#fallbackOffset = 0;
		this.#inputStarted = false;
		this.#inputVolume = 0;
		if (this.#userSpeaking) this.#setUserSpeaking(false);

		if (this.#inputWorkletUrl) {
			URL.revokeObjectURL(this.#inputWorkletUrl);
			this.#inputWorkletUrl = null;
		}
	}

	/** Apply a stored output device preference to a freshly created context. */
	async #applyOutputDevice(): Promise<void> {
		if (!this.#outputDeviceId || !this.#outputContext) return;

		const context = this.#outputContext as AudioContext & {
			setSinkId?: (sinkId: string) => Promise<void>;
		};
		if (typeof context.setSinkId !== 'function') {
			throw new AudioManagerError(
				'unsupported',
				'This browser cannot route audio to the selected output device.'
			);
		}

		try {
			await context.setSinkId(this.#outputDeviceId);
		} catch (cause) {
			throw new AudioManagerError(
				'device-switch-failed',
				'Could not open the selected output device. Check that it is still connected.',
				cause
			);
		}
	}

	/** Create the capture context, preferring the native 16 kHz rate. */
	#createInputContext(): AudioContext {
		try {
			return new AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE, latencyHint: 'interactive' });
		} catch {
			try {
				return new AudioContext({ latencyHint: 'interactive' });
			} catch (cause) {
				throw new AudioManagerError(
					'context-failed',
					'Could not create an audio context for microphone capture.',
					cause
				);
			}
		}
	}

	/** Build the shared playback graph: gain → analyser → destination. */
	#createOutputGraph(): void {
		if (!this.#outputContext) return;
		try {
			this.#outputGain = this.#outputContext.createGain();
			this.#outputAnalyser = this.#outputContext.createAnalyser();
			this.#outputAnalyser.fftSize = 1024;
			this.#outputAnalyser.smoothingTimeConstant = 0.78;
			this.#outputGain.connect(this.#outputAnalyser);
			this.#outputAnalyser.connect(this.#outputContext.destination);
		} catch (cause) {
			throw new AudioManagerError(
				'context-failed',
				'Could not create the agent playback audio graph.',
				cause
			);
		}
	}

	/** Load the inline worklet, falling back to ScriptProcessor if blocked. */
	async #createCaptureNode(
		context: AudioContext
	): Promise<{ node: AudioWorkletNode | ScriptProcessorNode }> {
		if (this.#closed) {
			throw new AudioManagerError('closed', 'The conversation ended before capture was ready.');
		}

		const chunkFrames = Math.max(
			128,
			Math.round(
				(context.sampleRate *
					Math.max(50, Math.min(250, this.#options.inputChunkDurationMs ?? DEFAULT_CHUNK_MS))) /
					1000
			)
		);

		if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
			try {
				const processorName = `${CAPTURE_WORKLET_NAME}-${++this.#captureGeneration}`;
				const source = CAPTURE_WORKLET_SOURCE.replace(
					'__SVELTE_ELEVENLABS_CAPTURE__',
					processorName
				);
				const blob = new Blob([source], { type: 'application/javascript' });
				const url = URL.createObjectURL(blob);
				this.#inputWorkletUrl = url;
				await context.audioWorklet.addModule(url);
				if (this.#closed) {
					URL.revokeObjectURL(url);
					if (this.#inputWorkletUrl === url) this.#inputWorkletUrl = null;
					throw new AudioManagerError(
						'closed',
						'The conversation ended while the capture processor was loading.'
					);
				}
				const node = new AudioWorkletNode(context, processorName, {
					numberOfInputs: 1,
					numberOfOutputs: 1,
					outputChannelCount: [1]
				});
				node.port.onmessage = (event: MessageEvent<{ type: string; buffer: Float32Array }>) => {
					if (event.data?.type === 'chunk' && event.data.buffer) {
						this.#handleCaptureChunk(event.data.buffer);
					}
				};
				node.port.postMessage({ type: 'config', chunkFrames });
				node.port.postMessage({ type: 'muted', muted: this.#muted });
				return { node };
			} catch (cause) {
				if (this.#closed) {
					throw new AudioManagerError(
						'closed',
						'The conversation ended while the capture processor was loading.',
						cause
					);
				}
				this.#report(
					new AudioManagerError(
						'worklet-failed',
						'AudioWorklet capture was blocked; falling back to the main-thread processor.',
						cause
					)
				);
				if (this.#inputWorkletUrl) {
					URL.revokeObjectURL(this.#inputWorkletUrl);
					this.#inputWorkletUrl = null;
				}
			}
		}

		if (this.#closed) {
			throw new AudioManagerError('closed', 'The conversation ended before capture was ready.');
		}

		const node = context.createScriptProcessor(2048, 1, 1);
		this.#fallbackBuffer = new Float32Array(chunkFrames);
		this.#fallbackOffset = 0;
		node.onaudioprocess = (event) => {
			const channel = event.inputBuffer.getChannelData(0);
			if (this.#muted || !channel) return;

			let read = 0;
			while (read < channel.length) {
				const remaining = chunkFrames - this.#fallbackOffset;
				const take = Math.min(remaining, channel.length - read);
				this.#fallbackBuffer?.set(channel.subarray(read, read + take), this.#fallbackOffset);
				this.#fallbackOffset += take;
				read += take;

				if (this.#fallbackOffset === chunkFrames && this.#fallbackBuffer) {
					this.#handleCaptureChunk(this.#fallbackBuffer);
					this.#fallbackBuffer = new Float32Array(chunkFrames);
					this.#fallbackOffset = 0;
				}
			}
		};
		return { node };
	}

	/** Resample, encode, and hand a microphone chunk to the socket layer. */
	#handleCaptureChunk(samples: Float32Array): void {
		if (this.#closed || this.#muted || !this.#inputFormat || !this.#options.onInputChunk) {
			return;
		}

		try {
			const targetRate = this.#inputFormat.sampleRate;
			const resampled =
				this.#inputActualRate === targetRate
					? samples
					: resampleLinear(samples, this.#inputActualRate, targetRate);
			if (resampled.length > 0) {
				this.#options.onInputChunk(encodePcm16Base64(resampled));
			}
		} catch (cause) {
			this.#report(
				cause instanceof AudioManagerError
					? cause
					: new AudioManagerError('decode-failed', 'Could not encode a microphone chunk.', cause)
			);
		}
	}

	/** Start the 30 fps level/VAD monitor. */
	#startMonitor(): void {
		if (this.#raf) return;

		const tick = (time: number) => {
			if (this.#closed) return;
			this.#raf = requestAnimationFrame(tick);
			if (time - this.#lastFrameTime < 33) return;
			this.#lastFrameTime = time;

			this.#inputVolume = this.#muted ? 0 : this.#readVolume(this.#inputAnalyser, 'input');
			this.#outputVolume = this.#readVolume(this.#outputAnalyser, 'output');
			const combined = Math.max(this.#inputVolume, this.#outputVolume);
			this.#options.onLevels?.({
				input: this.#inputVolume,
				output: this.#outputVolume,
				combined
			});
			this.#detectSpeech(this.#inputVolume);
		};

		this.#raf = requestAnimationFrame(tick);
	}

	/** Compute normalized RMS from the time-domain analyser data. */
	#readVolume(analyser: AnalyserNode | null, direction: 'input' | 'output'): number {
		if (!analyser) return 0;
		const size = analyser.fftSize;
		if (direction === 'input') {
			this.#inputTimeData ??= new Uint8Array(size);
			analyser.getByteTimeDomainData(this.#inputTimeData);
			return this.#rmsToVolume(this.#inputTimeData);
		}
		this.#outputTimeData ??= new Uint8Array(size);
		analyser.getByteTimeDomainData(this.#outputTimeData);
		return this.#rmsToVolume(this.#outputTimeData);
	}

	/** Convert 8-bit time-domain bytes to a perceptually useful 0..1 level. */
	#rmsToVolume(data: Uint8Array<ArrayBuffer>): number {
		let sum = 0;
		for (let i = 0; i < data.length; i += 1) {
			const centered = (data[i] - 128) / 128;
			sum += centered * centered;
		}
		const rms = Math.sqrt(sum / data.length);
		return Math.min(1, rms * 3.2);
	}

	/** Debounced local voice activity detection with barge-in. */
	#detectSpeech(level: number): void {
		const threshold = this.#options.vadThreshold ?? 0.075;

		if (level >= threshold && !this.#muted) {
			this.#silenceFrames = 0;
			this.#speechFrames += 1;
			if (!this.#userSpeaking && this.#speechFrames >= VAD_ATTACK_FRAMES) {
				this.#setUserSpeaking(true);
				if (
					this.#options.interruptOnUserSpeech !== false &&
					(this.#outputActive || this.#playback.size > 0)
				) {
					this.flushPlayback();
					this.#options.onLocalInterruption?.();
				}
			}
			return;
		}

		this.#speechFrames = 0;
		if (!this.#userSpeaking) return;
		this.#silenceFrames += 1;
		if (this.#silenceFrames >= VAD_RELEASE_FRAMES) {
			this.#setUserSpeaking(false);
		}
	}

	/** Update the VAD state and notify consumers on transitions. */
	#setUserSpeaking(speaking: boolean): void {
		if (this.#userSpeaking === speaking) return;
		this.#userSpeaking = speaking;
		if (!speaking) {
			this.#speechFrames = 0;
			this.#silenceFrames = 0;
			// Drop stale chunks from the interrupted response that may still
			// be in flight after the user stops speaking.
			this.#suppressPlaybackUntil = performance.now() + PLAYBACK_SUPPRESSION_MS;
		}
		this.#options.onUserSpeakingChange?.(speaking);
	}

	/** Mark playback active and emit only on transitions. */
	#setOutputActive(active: boolean): void {
		if (this.#outputActive === active) return;
		this.#outputActive = active;
		this.#options.onPlaybackChange?.(active);
	}

	/** Schedule a generation-safe idle check after the last queued chunk. */
	#scheduleIdleCheck(): void {
		const ctx = this.#outputContext;
		if (!ctx) return;

		if (this.#idleTimer) clearTimeout(this.#idleTimer);
		const generation = this.#playbackGeneration;
		const delay =
			Math.max(0, (this.#nextStartTime - ctx.currentTime) * 1000) + PLAYBACK_IDLE_GRACE_MS;

		this.#idleTimer = setTimeout(() => {
			if (this.#closed || generation !== this.#playbackGeneration) return;
			const context = this.#outputContext;
			if (!context) return;
			if (context.currentTime >= this.#nextStartTime - 0.03) {
				this.#setOutputActive(false);
				return;
			}
			this.#scheduleIdleCheck();
		}, delay);
	}

	/** Resume both contexts after a gesture or tab switch. */
	async #resumeContexts(): Promise<void> {
		const contexts = [this.#inputContext, this.#outputContext].filter(
			(context): context is AudioContext => context !== null
		);
		await Promise.allSettled(
			contexts.map((context) =>
				context.state === 'suspended' ? context.resume() : Promise.resolve()
			)
		);
	}

	/** Convert a getUserMedia failure into a typed, actionable error. */
	#mapGetUserMediaError(cause: unknown): AudioManagerError {
		if (cause instanceof AudioManagerError) return cause;

		const name =
			typeof cause === 'object' && cause !== null && 'name' in cause
				? String((cause as { name: unknown }).name)
				: '';

		switch (name) {
			case 'NotAllowedError':
			case 'PermissionDeniedError':
			case 'SecurityError':
				return new AudioManagerError(
					'permission-denied',
					'Microphone access was denied. Allow microphone access for this site in your browser settings, then try again.',
					cause
				);
			case 'NotFoundError':
			case 'DevicesNotFoundError':
				return new AudioManagerError(
					'device-not-found',
					'No microphone was found. Connect an input device and try again.',
					cause
				);
			case 'NotReadableError':
			case 'TrackStartError':
				return new AudioManagerError(
					'device-busy',
					'Your microphone is already in use by another application. Close it and try again.',
					cause
				);
			case 'OverconstrainedError':
			case 'ConstraintNotSatisfiedError':
				return new AudioManagerError(
					'constraints',
					'The browser could not start the microphone with the requested audio settings. Try a different input device.',
					cause
				);
			case 'AbortError':
				return new AudioManagerError(
					'permission-denied',
					'Microphone access was interrupted before it could start. Please try again.',
					cause
				);
			default:
				return new AudioManagerError(
					'context-failed',
					'Could not start microphone capture. Check your audio device and browser permissions.',
					cause
				);
		}
	}

	/** Deduplicated error reporting for non-fatal audio failures. */
	#report(error: AudioManagerError): void {
		if (this.#closed) return;
		const now = performance.now();
		const key = `${error.code}:${error.message}`;
		if (key === this.#lastReportedKey && now - this.#lastReportedAt < 3_000) return;
		this.#lastReportedKey = key;
		this.#lastReportedAt = now;
		this.#options.onError?.(error);
	}

	/** Close a context without throwing or waiting on an already closed one. */
	async #closeContext(context: AudioContext | null): Promise<void> {
		if (!context) return;
		try {
			if (context.state !== 'closed') await context.close();
		} catch {
			// Closing is best effort during teardown.
		}
	}

	/** Best-effort node disconnection used by close(). */
	#disconnectNode(node: AudioNode | null): void {
		if (!node) return;
		try {
			node.disconnect();
		} catch {
			// Node was already disconnected.
		}
	}
}
