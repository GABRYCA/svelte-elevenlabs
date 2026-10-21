import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversation } from '../src/lib/runes/useConversation.svelte.js';
import type { ConversationError, TranscriptMessage } from '../src/lib/types/index.js';

function transcript(id: string): TranscriptMessage {
	return {
		id,
		role: 'agent',
		text: `Message ${id}`,
		isFinal: true,
		timestamp: 1
	};
}

describe('ConversationController state', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('starts disconnected with a clean reactive surface', () => {
		const conversation = createConversation();

		expect(conversation.status).toBe('disconnected');
		expect(conversation.mode).toBe('disconnected');
		expect(conversation.canStart).toBe(true);
		expect(conversation.isSpeaking).toBe(false);
		expect(conversation.isListening).toBe(false);
		expect(conversation.isUserSpeaking).toBe(false);
		expect(conversation.isMuted).toBe(false);
		expect(conversation.transcripts).toEqual([]);
		expect(conversation.messageCount).toBe(0);
		expect(conversation.error).toBeNull();
		expect(conversation.errorCode).toBeNull();
		expect(conversation.conversationId).toBeNull();
		expect(conversation.latency).toBeNull();
		expect(conversation.latencyHistory).toEqual([]);

		conversation.destroy();
	});

	it('derives the mode from connection and audio state', () => {
		const conversation = createConversation();

		conversation.status = 'connecting';
		expect(conversation.mode).toBe('connecting');
		expect(conversation.canStart).toBe(false);

		conversation.status = 'connected';
		expect(conversation.mode).toBe('ready');

		conversation.isUserSpeaking = true;
		expect(conversation.mode).toBe('listening');

		conversation.isSpeaking = true;
		expect(conversation.mode).toBe('speaking');

		conversation.isSpeaking = false;
		conversation.isUserSpeaking = false;
		expect(conversation.mode).toBe('ready');

		conversation.destroy();
	});

	it('tracks transcripts and the derived message count', () => {
		const conversation = createConversation();

		conversation.transcripts = [transcript('one'), transcript('two')];
		expect(conversation.messageCount).toBe(2);

		conversation.clearTranscripts();
		expect(conversation.transcripts).toEqual([]);
		expect(conversation.messageCount).toBe(0);

		conversation.destroy();
	});

	it('clears an error banner without changing the connection state', () => {
		const conversation = createConversation();

		conversation.error = 'Something went wrong.';
		conversation.errorCode = 'protocol-error';
		conversation.clearError();

		expect(conversation.error).toBeNull();
		expect(conversation.errorCode).toBeNull();
		expect(conversation.status).toBe('disconnected');

		conversation.destroy();
	});

	it('mutes and unmutes without an audio graph', () => {
		const conversation = createConversation();
		conversation.status = 'connected';
		conversation.isListening = true;
		conversation.inputVolume = 0.5;
		conversation.volume = 0.5;

		conversation.setMuted(true);
		expect(conversation.isMuted).toBe(true);
		expect(conversation.isListening).toBe(false);
		expect(conversation.isUserSpeaking).toBe(false);
		expect(conversation.inputVolume).toBe(0);
		expect(conversation.volume).toBe(0);

		conversation.toggleMute();
		expect(conversation.isMuted).toBe(false);
		expect(conversation.isListening).toBe(true);

		conversation.destroy();
	});

	it('does not send frames while disconnected', () => {
		const conversation = createConversation();

		expect(conversation.sendContextualUpdate('')).toBe(false);
		expect(conversation.sendContextualUpdate('  context  ')).toBe(false);
		expect(conversation.sendUserMessage('')).toBe(false);
		expect(conversation.sendUserMessage('  hello  ')).toBe(false);

		conversation.destroy();
	});

	it('returns zeroed analyser buffers without a session', () => {
		const conversation = createConversation();
		const reusable = new Uint8Array(4);

		expect(conversation.getInputFrequencyData().length).toBe(512);
		expect(conversation.getOutputFrequencyData(reusable)).toBe(reusable);
		expect(Array.from(reusable)).toEqual([0, 0, 0, 0]);

		conversation.destroy();
	});

	it('refuses to start in Node and reports a typed error', async () => {
		const onError = vi.fn<(error: ConversationError) => void>();
		const conversation = createConversation({ onError });

		await conversation.startConversation('agent_abc123');

		expect(conversation.status).toBe('disconnected');
		expect(conversation.errorCode).toBe('not-supported');
		expect(conversation.error).toMatch(/only be started in a browser/);
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0].code).toBe('not-supported');
		expect(errorSpy).toHaveBeenCalled();

		conversation.destroy();
	});

	it('refuses to start after destroy and stays idempotent', async () => {
		const conversation = createConversation();

		conversation.destroy();
		conversation.destroy();
		await conversation.startConversation('agent_abc123');

		expect(conversation.error).toMatch(/has been destroyed/);
		expect(conversation.errorCode).toBe('not-supported');

		conversation.destroy();
	});

	it('resets transient state but keeps transcripts on stop', () => {
		const conversation = createConversation();
		conversation.status = 'connected';
		conversation.isSpeaking = true;
		conversation.isListening = true;
		conversation.isUserSpeaking = true;
		conversation.isMuted = true;
		conversation.volume = 0.7;
		conversation.inputVolume = 0.7;
		conversation.outputVolume = 0.4;
		conversation.conversationId = 'conv_123';
		conversation.inputAudioFormat = 'pcm_16000';
		conversation.outputAudioFormat = 'pcm_16000';
		conversation.queueStatus = 'waiting';
		conversation.error = 'Old error';
		conversation.errorCode = 'protocol-error';
		conversation.transcripts = [transcript('kept')];

		conversation.stopConversation();

		expect(conversation.status).toBe('disconnected');
		expect(conversation.isSpeaking).toBe(false);
		expect(conversation.isListening).toBe(false);
		expect(conversation.isUserSpeaking).toBe(false);
		expect(conversation.isMuted).toBe(false);
		expect(conversation.volume).toBe(0);
		expect(conversation.inputVolume).toBe(0);
		expect(conversation.outputVolume).toBe(0);
		expect(conversation.conversationId).toBeNull();
		expect(conversation.inputAudioFormat).toBeNull();
		expect(conversation.outputAudioFormat).toBeNull();
		expect(conversation.queueStatus).toBeNull();
		expect(conversation.error).toBeNull();
		expect(conversation.errorCode).toBeNull();
		expect(conversation.transcripts).toEqual([transcript('kept')]);

		conversation.destroy();
	});
});
