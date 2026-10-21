import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createConversation,
	type ConversationController
} from '../src/lib/runes/useConversation.svelte.js';
import type {
	ClientEvent,
	ClientToolCallServerEvent,
	ConversationError,
	McpToolCallServerEvent,
	TranscriptMessage
} from '../src/lib/types/index.js';

interface ControllerInternals {
	send: (event: ClientEvent) => boolean;
	currentEventId: number | null;
	sessionTextOnly: boolean | null;
	handleClientToolCall: (event: ClientToolCallServerEvent) => Promise<void>;
	handleMCPToolCall: (event: McpToolCallServerEvent) => Promise<void>;
}

function internals(conversation: ConversationController): ControllerInternals {
	return conversation as unknown as ControllerInternals;
}

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

	it('resolves text only mode with explicit options winning', () => {
		const overridden = createConversation({
			overrides: { conversation: { text_only: true } }
		});
		const explicit = createConversation({
			textOnly: false,
			overrides: { conversation: { text_only: true } }
		});
		const direct = createConversation({ textOnly: true });

		expect(overridden.isTextOnly).toBe(true);
		expect(explicit.isTextOnly).toBe(false);
		expect(direct.isTextOnly).toBe(true);

		internals(direct).sessionTextOnly = false;
		expect(direct.isTextOnly).toBe(false);
		internals(direct).sessionTextOnly = true;
		expect(direct.isTextOnly).toBe(true);

		overridden.destroy();
		explicit.destroy();
		direct.destroy();
	});

	it('refuses device changes in text only mode with a typed error', async () => {
		const conversation = createConversation({ textOnly: true });

		await expect(conversation.changeInputDevice()).resolves.toBe(false);
		expect(conversation.errorCode).toBe('not-supported');
		expect(conversation.error).toMatch(/text only mode/i);

		conversation.clearError();
		await expect(conversation.changeOutputDevice()).resolves.toBe(false);
		expect(conversation.errorCode).toBe('not-supported');
		expect(conversation.error).toMatch(/text only mode/i);

		conversation.destroy();
	});

	it('sends feedback only after a response id is available', () => {
		const conversation = createConversation();
		const sent: ClientEvent[] = [];
		const controller = internals(conversation);
		controller.send = (event) => {
			sent.push(event);
			return true;
		};

		expect(conversation.sendFeedback(true)).toBe(false);

		conversation.canSendFeedback = true;
		expect(conversation.sendFeedback(true)).toBe(false);

		controller.currentEventId = 42;
		expect(conversation.sendFeedback(false)).toBe(true);
		expect(conversation.sendFeedback(true, 7)).toBe(true);
		expect(sent).toEqual([
			{ type: 'feedback', score: 'dislike', event_id: 42 },
			{ type: 'feedback', score: 'like', event_id: 7 }
		]);

		conversation.destroy();
	});

	it('throttles user activity to one frame per second', () => {
		const conversation = createConversation();
		const sent: ClientEvent[] = [];
		const controller = internals(conversation);
		const now = vi.spyOn(Date, 'now');
		controller.send = (event) => {
			sent.push(event);
			return true;
		};

		now.mockReturnValue(1_000);
		expect(conversation.sendUserActivity()).toBe(true);
		expect(conversation.sendUserActivity()).toBe(false);

		now.mockReturnValue(1_999);
		expect(conversation.sendUserActivity()).toBe(false);

		now.mockReturnValue(2_000);
		expect(conversation.sendUserActivity()).toBe(true);
		expect(sent).toEqual([{ type: 'user_activity' }, { type: 'user_activity' }]);

		now.mockRestore();
		conversation.destroy();
	});

	it('registers client tools and reports a missing handler after unregister', async () => {
		const conversation = createConversation();
		const sent: ClientEvent[] = [];
		const controller = internals(conversation);
		controller.send = (event) => {
			sent.push(event);
			return true;
		};
		const handler = vi.fn((parameters: Record<string, unknown>) => ({
			echoed: parameters.text
		}));
		const unregister = conversation.registerClientTool(' echo ', handler);

		await controller.handleClientToolCall({
			type: 'client_tool_call',
			client_tool_call: {
				tool_name: 'echo',
				tool_call_id: 'tool_1',
				parameters: { text: 'hi' },
				event_id: 1,
				expects_response: true
			}
		});

		expect(handler).toHaveBeenCalledWith(
			{ text: 'hi' },
			expect.objectContaining({ tool_call_id: 'tool_1' })
		);
		expect(sent[0]).toEqual({
			type: 'client_tool_result',
			tool_call_id: 'tool_1',
			result: '{"echoed":"hi"}',
			is_error: false
		});

		unregister();
		await controller.handleClientToolCall({
			type: 'client_tool_call',
			client_tool_call: {
				tool_name: 'echo',
				tool_call_id: 'tool_2',
				parameters: { text: 'again' },
				event_id: 2,
				expects_response: true
			}
		});

		expect(sent[1]).toEqual(
			expect.objectContaining({
				type: 'client_tool_result',
				tool_call_id: 'tool_2',
				is_error: true,
				error_type: 'external_client',
				result: expect.stringMatching(/No handler is registered/)
			})
		);

		conversation.destroy();
	});

	it('sends a client tool result when expects_response is omitted', async () => {
		const conversation = createConversation({
			clientTools: {
				ping: () => 'pong'
			}
		});
		const sent: ClientEvent[] = [];
		const controller = internals(conversation);
		controller.send = (event) => {
			sent.push(event);
			return true;
		};

		await controller.handleClientToolCall({
			type: 'client_tool_call',
			client_tool_call: {
				tool_name: 'ping',
				tool_call_id: 'tool_legacy',
				parameters: {},
				event_id: 3
			}
		});

		expect(sent).toEqual([
			{
				type: 'client_tool_result',
				tool_call_id: 'tool_legacy',
				result: 'pong',
				is_error: false
			}
		]);

		conversation.destroy();
	});

	it('settles MCP approvals once and ignores repeated requests', async () => {
		const handler = vi.fn(async () => true);
		const conversation = createConversation({ onMCPToolApprovalRequest: handler });
		const sent: ClientEvent[] = [];
		const controller = internals(conversation);
		controller.send = (event) => {
			sent.push(event);
			return true;
		};
		conversation.status = 'connected';

		const event: McpToolCallServerEvent = {
			type: 'mcp_tool_call',
			mcp_tool_call: {
				service_id: 'service_1',
				tool_call_id: 'mcp_1',
				tool_name: 'send_email',
				parameters: { to: 'user@example.com' },
				state: 'awaiting_approval'
			}
		};

		await controller.handleMCPToolCall(event);
		await controller.handleMCPToolCall(event);

		expect(handler).toHaveBeenCalledOnce();
		expect(sent).toEqual([
			{ type: 'mcp_tool_approval_result', tool_call_id: 'mcp_1', is_approved: true }
		]);
		expect(conversation.sendMCPToolApprovalResult('mcp_1', false)).toBe(false);

		conversation.destroy();
	});

	it('clamps playback gain and accepts the object form', () => {
		const conversation = createConversation();

		conversation.setVolume(2);
		expect(conversation.outputGain).toBe(1);

		conversation.setVolume({ volume: 0.25 });
		expect(conversation.outputGain).toBe(0.25);

		conversation.setVolume(Number.NaN);
		expect(conversation.outputGain).toBe(1);

		conversation.destroy();
	});
});
