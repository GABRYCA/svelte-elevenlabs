import { describe, expect, it } from 'vitest';
import {
	AudioManager,
	AudioManagerError,
	decodeAudioChunk,
	decodePcm16,
	decodeUlaw,
	encodePcm16Base64,
	parseAudioFormat,
	resampleLinear
} from '../src/lib/audio/audioManager.js';

describe('parseAudioFormat', () => {
	it('parses negotiated PCM and µ-law ids', () => {
		expect(parseAudioFormat('pcm_16000')).toEqual({
			encoding: 'pcm',
			sampleRate: 16_000,
			channels: 1
		});
		expect(parseAudioFormat('pcm_24000')).toEqual({
			encoding: 'pcm',
			sampleRate: 24_000,
			channels: 1
		});
		expect(parseAudioFormat('ulaw_8000')).toEqual({
			encoding: 'ulaw',
			sampleRate: 8_000,
			channels: 1
		});
	});

	it('rejects malformed or out-of-range formats', () => {
		expect(() => parseAudioFormat('mp3_44100')).toThrow(AudioManagerError);
		expect(() => parseAudioFormat('pcm_4000')).toThrow(/Unsupported sample rate/);
		expect(() => parseAudioFormat('pcm_96000')).toThrow(/Unsupported sample rate/);
		expect(() => parseAudioFormat('ulaw_16000')).toThrow(/only valid at 8000 Hz/);
	});
});

describe('resampleLinear', () => {
	it('returns a new array unchanged when rates match', () => {
		const input = new Float32Array([0.1, 0.2, 0.3]);
		const output = resampleLinear(input, 16_000, 16_000);
		expect(output.length).toBe(3);
		expect(output[0]).toBeCloseTo(0.1, 6);
		expect(output[1]).toBeCloseTo(0.2, 6);
		expect(output[2]).toBeCloseTo(0.3, 6);
		expect(output).not.toBe(input);
	});

	it('interpolates at the correct target length', () => {
		const input = new Float32Array([0, 1, 0, -1]);
		const output = resampleLinear(input, 16_000, 8_000);
		expect(output.length).toBe(2);
		expect(Array.from(output)).toEqual([0, 0]);
	});

	it('rejects non-positive sample rates', () => {
		expect(() => resampleLinear(new Float32Array([0]), 0, 16_000)).toThrow(AudioManagerError);
	});
});

describe('PCM16 base64', () => {
	it('encodes mono little-endian samples', () => {
		expect(encodePcm16Base64(new Float32Array([0, 1, -1]))).toBe('AAD/fwCA');
	});

	it('round-trips approximately through decode', () => {
		const input = new Float32Array([0, 0.25, -0.25, 0.5, -0.5, 0.999, -0.999]);
		const decoded = decodePcm16(encodePcm16Base64(input));
		expect(decoded.length).toBe(input.length);

		for (let index = 0; index < input.length; index += 1) {
			expect(decoded[index]).toBeCloseTo(input[index], 3);
		}
	});

	it('throws a typed error for malformed base64', () => {
		expect(() => decodePcm16('not_base64!')).toThrow(AudioManagerError);
		expect(() => decodePcm16('')).toThrow(/empty audio payload/i);
	});
});

describe('µ-law decoding', () => {
	it('decodes the negative full-scale code', () => {
		const decoded = decodeUlaw(new Uint8Array([0x00]));
		expect(decoded[0]).toBeCloseTo(-0.9803, 3);
	});

	it('decodes digital silence', () => {
		const decoded = decodeUlaw(new Uint8Array([0xff, 0x7f]));
		expect(decoded[0]).toBeCloseTo(0, 6);
		expect(decoded[1]).toBeCloseTo(0, 6);
	});

	it('routes chunks according to their format', () => {
		const base64 = btoa(String.fromCharCode(0x00));
		expect(
			decodeAudioChunk(base64, { encoding: 'ulaw', sampleRate: 8000, channels: 1 })[0]
		).toBeCloseTo(-0.9803, 3);
	});
});

describe('extended audio format parsing', () => {
	it('accepts every documented PCM rate and µ-law', () => {
		for (const sampleRate of [8_000, 16_000, 22_050, 24_000, 44_100, 48_000]) {
			expect(parseAudioFormat(`pcm_${sampleRate}`)).toEqual({
				encoding: 'pcm',
				sampleRate,
				channels: 1
			});
		}

		expect(parseAudioFormat('ulaw_8000')).toEqual({
			encoding: 'ulaw',
			sampleRate: 8_000,
			channels: 1
		});
	});

	it('rejects malformed ids, wrong casing, and unsupported codecs', () => {
		for (const format of [
			'',
			'pcm_',
			'PCM_16000',
			'pcm_16000_extra',
			'pcm_7999',
			'pcm_48001',
			'mp3_44100',
			'opus_48000',
			'ulaw_16000'
		]) {
			expect(() => parseAudioFormat(format)).toThrow(AudioManagerError);
		}
	});
});

describe('extended resampling', () => {
	it('upsamples with linear interpolation', () => {
		const output = resampleLinear(new Float32Array([0, 1]), 8_000, 16_000);
		expect(Array.from(output)).toEqual([0, 0.5, 1, 1]);
	});

	it('returns a new empty array for empty input', () => {
		const output = resampleLinear(new Float32Array([]), 16_000, 8_000);
		expect(output.length).toBe(0);
	});

	it('rejects a negative target rate', () => {
		expect(() => resampleLinear(new Float32Array([0]), 16_000, -8_000)).toThrow(
			/Sample rates must be positive/
		);
	});
});

describe('extended PCM16 encoding', () => {
	it('clamps samples outside the valid range', () => {
		const decoded = decodePcm16(encodePcm16Base64(new Float32Array([2, -2, 1.5, -1.5])));

		expect(decoded[0]).toBeCloseTo(1, 3);
		expect(decoded[1]).toBeCloseTo(-1, 3);
		expect(decoded[2]).toBeCloseTo(1, 3);
		expect(decoded[3]).toBeCloseTo(-1, 3);
	});

	it('encodes empty input as an empty string', () => {
		expect(encodePcm16Base64(new Float32Array([]))).toBe('');
	});

	it('ignores a trailing odd byte and tolerates whitespace', () => {
		const base64 = btoa(String.fromCharCode(0x00, 0x80, 0x7f));
		const decoded = decodePcm16(`${base64.slice(0, 4)}\n${base64.slice(4)}`);

		expect(decoded.length).toBe(1);
		expect(decoded[0]).toBeCloseTo(-1, 3);
	});
});

describe('extended µ-law decoding', () => {
	it('decodes positive and negative full scale', () => {
		expect(decodeUlaw(new Uint8Array([0x80]))[0]).toBeCloseTo(0.9803, 3);
		expect(decodeUlaw(new Uint8Array([0x00]))[0]).toBeCloseTo(-0.9803, 3);
	});

	it('keeps every possible byte finite and in range', () => {
		const all = new Uint8Array(256);
		for (let index = 0; index < 256; index += 1) all[index] = index;

		for (const sample of decodeUlaw(all)) {
			expect(Number.isFinite(sample)).toBe(true);
			expect(sample).toBeGreaterThanOrEqual(-1);
			expect(sample).toBeLessThanOrEqual(1);
		}
	});

	it('decodes PCM chunks through the format router', () => {
		const base64 = encodePcm16Base64(new Float32Array([0.5]));
		const decoded = decodeAudioChunk(base64, { encoding: 'pcm', sampleRate: 16_000, channels: 1 });
		expect(decoded[0]).toBeCloseTo(0.5, 3);
	});
});

describe('AudioManager without a browser', () => {
	it('reports no browser support in Node', () => {
		expect(AudioManager.isSupported()).toBe(false);
	});

	it('exposes deterministic defaults before preparation', () => {
		const manager = new AudioManager();

		expect(manager.inputSampleRate).toBe(16_000);
		expect(manager.outputSampleRate).toBe(0);
		expect(manager.isInputMuted).toBe(false);
		expect(manager.isOutputActive).toBe(false);
		expect(manager.getInputAnalyser()).toBeNull();
		expect(manager.getOutputAnalyser()).toBeNull();
		expect(manager.getInputVolume()).toBe(0);
		expect(manager.getOutputVolume()).toBe(0);
	});

	it('returns zeroed frequency buffers when no graph exists', () => {
		const manager = new AudioManager();
		const input = manager.getInputFrequencyData();
		const output = manager.getOutputFrequencyData(new Uint8Array(8));

		expect(input.length).toBe(512);
		expect(input.every((value) => value === 0)).toBe(true);
		expect(output.length).toBe(8);
		expect(output.every((value) => value === 0)).toBe(true);
	});

	it('fails preparation with a typed unsupported error', async () => {
		const manager = new AudioManager();

		await expect(manager.prepare()).rejects.toMatchObject({
			name: 'AudioManagerError',
			code: 'unsupported'
		});
	});

	it('fails input capture with a typed unsupported error', async () => {
		const manager = new AudioManager();

		await expect(manager.startInput('pcm_16000')).rejects.toBeInstanceOf(AudioManagerError);
	});

	it('handles mute and playback calls without a graph', () => {
		const manager = new AudioManager();

		manager.setInputMuted(true);
		expect(manager.isInputMuted).toBe(true);
		expect(manager.getInputVolume()).toBe(0);

		manager.setInputMuted(false);
		expect(manager.isInputMuted).toBe(false);

		manager.setOutputVolume(0.5);
		expect(manager.playAudioChunk('AAAA', 'pcm_16000')).toBe(false);
		manager.flushPlayback();
		expect(manager.isOutputActive).toBe(false);
	});

	it('closes safely and idempotently', async () => {
		const manager = new AudioManager();

		await manager.close();
		await manager.close();
		await expect(manager.prepare()).rejects.toMatchObject({ code: 'closed' });
	});
});
