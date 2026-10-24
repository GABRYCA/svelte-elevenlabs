import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('esm-env', () => ({ BROWSER: true }));

import { AudioManager, encodePcm16Base64 } from '../src/lib/audio/audioManager.js';

class FakeParam {
	value = 0;

	setValueAtTime(value: number): void {
		this.value = value;
	}

	cancelScheduledValues(): void {}

	exponentialRampToValueAtTime(value: number): void {
		this.value = value;
	}
}

class FakeNode {
	connect(): void {}

	disconnect(): void {}
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAnalyser extends FakeNode {
	fftSize = 1024;
	smoothingTimeConstant = 0.78;
	minDecibels = -90;
	maxDecibels = -10;
	readonly frequencyBinCount = 512;
	timeDataValue = 128;

	getByteTimeDomainData(target: Uint8Array): void {
		target.fill(this.timeDataValue);
	}

	getByteFrequencyData(target: Uint8Array): void {
		target.fill(0);
	}
}

class FakeBuffer {
	readonly duration: number;
	readonly #data: Float32Array;

	constructor(length: number, sampleRate: number) {
		this.duration = length / sampleRate;
		this.#data = new Float32Array(length);
	}

	getChannelData(): Float32Array {
		return this.#data;
	}
}

class FakeSource extends FakeNode {
	buffer: FakeBuffer | null = null;
	onended: (() => void) | null = null;
	startAt: number | null = null;
	stopAt: number | null = null;

	start(when = 0): void {
		this.startAt = when;
	}

	stop(when = 0): void {
		this.stopAt = when;
		this.onended?.();
	}
}

class FakeFilter extends FakeNode {
	readonly type = 'lowpass';
	readonly frequency = new FakeParam();
	readonly Q = new FakeParam();
}

class FakeScriptProcessor extends FakeNode {
	onaudioprocess: ((event: unknown) => void) | null = null;
}

class FakeAudioContext {
	static instances: FakeAudioContext[] = [];
	static analysers: FakeAnalyser[] = [];
	static sources: FakeSource[] = [];

	readonly destination = new FakeNode();
	readonly sampleRate: number;
	readonly audioWorklet = undefined;
	state = 'running';
	currentTime = 0;

	constructor(options: { sampleRate?: number } = {}) {
		this.sampleRate = options.sampleRate ?? 48_000;
		FakeAudioContext.instances.push(this);
	}

	createGain(): FakeGain {
		return new FakeGain();
	}

	createAnalyser(): FakeAnalyser {
		const analyser = new FakeAnalyser();
		FakeAudioContext.analysers.push(analyser);
		return analyser;
	}

	createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
		return new FakeBuffer(length, sampleRate);
	}

	createBufferSource(): FakeSource {
		const source = new FakeSource();
		FakeAudioContext.sources.push(source);
		return source;
	}

	createMediaStreamSource(): FakeNode {
		return new FakeNode();
	}

	createBiquadFilter(): FakeFilter {
		return new FakeFilter();
	}

	createScriptProcessor(): FakeScriptProcessor {
		return new FakeScriptProcessor();
	}

	resume(): Promise<void> {
		this.state = 'running';
		return Promise.resolve();
	}

	close(): Promise<void> {
		this.state = 'closed';
		return Promise.resolve();
	}
}

let now = 0;
let frameCallback: ((time: number) => void) | null = null;
let frameId = 0;

function runFrame(time: number): void {
	const callback = frameCallback;
	if (!callback) throw new Error('No animation frame was scheduled.');
	callback(time);
}

function makeStream(): MediaStream {
	const track = { stop: vi.fn() };
	return {
		getTracks: () => [track],
		getAudioTracks: () => [track]
	} as unknown as MediaStream;
}

async function prepareManager(options: ConstructorParameters<typeof AudioManager>[0] = {}) {
	const manager = new AudioManager(options);
	await manager.prepare();
	await manager.startInput('pcm_16000');
	return manager;
}

beforeEach(() => {
	FakeAudioContext.instances = [];
	FakeAudioContext.analysers = [];
	FakeAudioContext.sources = [];
	now = 0;
	frameCallback = null;
	frameId = 0;

	vi.spyOn(performance, 'now').mockImplementation(() => now);
	vi.stubGlobal('window', { isSecureContext: true });
	vi.stubGlobal('navigator', {
		mediaDevices: { getUserMedia: vi.fn(async () => makeStream()) }
	});
	vi.stubGlobal('AudioContext', FakeAudioContext);
	vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
		frameCallback = callback;
		return ++frameId;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('AudioManager playback barge-in', () => {
	it('keeps dropping agent chunks while the user is still speaking', async () => {
		const manager = await prepareManager();
		const output = FakeAudioContext.instances[1];
		const inputAnalyser = FakeAudioContext.analysers[1];
		const chunk = encodePcm16Base64(new Float32Array([0.1, -0.1, 0.2, -0.2]));

		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);
		expect(manager.isOutputActive).toBe(true);

		inputAnalyser.timeDataValue = 255;
		runFrame(0);
		runFrame(40);
		runFrame(80);

		expect(manager.isOutputActive).toBe(false);
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(false);

		// Advance beyond the 300 ms post-flush suppression while the user is
		// still speaking. The chunk must still be dropped.
		now = 1_000;
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(false);

		// The user stops speaking after the VAD release window.
		inputAnalyser.timeDataValue = 128;
		for (let index = 0; index < 8; index += 1) {
			runFrame(120 + index * 40);
		}

		// The post-speech suppression still drops stale chunks.
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(false);

		// Once the grace period expires, new agent audio is accepted.
		now = 1_400;
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);
		expect(manager.isOutputActive).toBe(true);

		output.currentTime = 1.5;
		await manager.close();
	});

	it('does not drop agent chunks when local interruption is disabled', async () => {
		const manager = await prepareManager({ interruptOnUserSpeech: false });
		const inputAnalyser = FakeAudioContext.analysers[1];
		const chunk = encodePcm16Base64(new Float32Array([0.1, -0.1]));

		inputAnalyser.timeDataValue = 255;
		runFrame(0);
		runFrame(40);
		runFrame(80);

		now = 1_000;
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);

		await manager.close();
	});

	it('keeps playback active across short gaps between TTS chunks', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const manager = await prepareManager();
			const output = FakeAudioContext.instances[1];
			const chunk = encodePcm16Base64(new Float32Array(160));

			output.currentTime = 0.02;
			expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);
			expect(manager.isOutputActive).toBe(true);

			// Let the fake clock pass the scheduled end time so the idle
			// check can observe it without relying on wall-clock time.
			output.currentTime = 0.03;
			vi.advanceTimersByTime(1_029);
			expect(manager.isOutputActive).toBe(true);
			vi.advanceTimersByTime(1);
			expect(manager.isOutputActive).toBe(false);

			await manager.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps fast-arriving TTS chunks in sequence instead of overlapping them', async () => {
		const manager = await prepareManager();
		const output = FakeAudioContext.instances[1];
		// Two seconds of PCM16 at 16 kHz.
		const chunk = encodePcm16Base64(new Float32Array(32_000));

		output.currentTime = 0.01;
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);
		expect(FakeAudioContext.sources).toHaveLength(1);
		expect(FakeAudioContext.sources[0].startAt).toBeCloseTo(0.03);

		// The second chunk arrives almost immediately, far before the first
		// one has finished. It must wait its turn instead of restarting at
		// `currentTime` and overlapping the first chunk.
		output.currentTime = 0.03;
		expect(manager.playAudioChunk(chunk, 'pcm_16000')).toBe(true);
		expect(FakeAudioContext.sources).toHaveLength(2);
		expect(FakeAudioContext.sources[1].startAt).toBeCloseTo(2.03);

		await manager.close();
	});
});
