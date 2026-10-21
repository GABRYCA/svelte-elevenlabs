import { describe, expect, it } from 'vitest';
import { AudioManagerError } from '../src/lib/audio/audioManager.js';
import { ConversationError } from '../src/lib/types/index.js';

describe('ConversationError', () => {
	it('carries a stable code and an optional cause', () => {
		const cause = new Error('upstream');
		const error = new ConversationError('signed-url-failed', 'Try again.', cause);

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('ConversationError');
		expect(error.code).toBe('signed-url-failed');
		expect(error.message).toBe('Try again.');
		expect(error.cause).toBe(cause);
	});

	it('supports every public error category', () => {
		const codes = [
			'not-supported',
			'insecure-context',
			'permission-denied',
			'audio-failed',
			'invalid-target',
			'signed-url-failed',
			'connection-failed',
			'connection-timeout',
			'server-closed',
			'protocol-error'
		] as const;

		for (const code of codes) {
			const error = new ConversationError(code, `Message for ${code}`);
			expect(error.code).toBe(code);
			expect(error.message).toBe(`Message for ${code}`);
		}
	});
});

describe('AudioManagerError', () => {
	it('carries a stable code and an optional cause', () => {
		const cause = new Error('decoder');
		const error = new AudioManagerError('decode-failed', 'Bad chunk.', cause);

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('AudioManagerError');
		expect(error.code).toBe('decode-failed');
		expect(error.message).toBe('Bad chunk.');
		expect(error.cause).toBe(cause);
	});
});
