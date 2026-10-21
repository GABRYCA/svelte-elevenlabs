import { describe, expect, it } from 'vitest';
import {
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
