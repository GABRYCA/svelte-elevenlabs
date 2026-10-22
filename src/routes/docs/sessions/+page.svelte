<script lang="ts">
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Sessions"
	summary="Connection lifecycle, reactive session state, transcripts, typed turns, feedback, and the cleanup contract."
	toc={[
		{ id: 'lifecycle', label: 'Lifecycle' },
		{ id: 'state', label: 'Session state' },
		{ id: 'transcripts', label: 'Transcripts' },
		{ id: 'text-turns', label: 'Text turns' },
		{ id: 'mute-volume', label: 'Mute and playback' },
		{ id: 'feedback', label: 'Feedback' },
		{ id: 'cleanup', label: 'Cleanup' }
	]}
>
	<h2 id="lifecycle">Lifecycle</h2>
	<p>
		A session moves through three states: <code>disconnected</code>, <code>connecting</code>, and
		<code>connected</code>. <code>startConversation()</code> does all of the preparation in a fixed order,
		then resolves after the server sends its metadata or after a start failure.
	</p>
	<ol class="docs-steps">
		<li>
			<p>
				Validate the target and read the microphone and signed URL settings. Obvious mistakes fail
				before a permission prompt appears.
			</p>
		</li>
		<li>
			<p>
				Create the audio graph inside the user gesture. This includes the microphone track, the
				input context, and the playback context. Text only sessions skip this step.
			</p>
		</li>
		<li>
			<p>
				Resolve the WebSocket URL. A public id is converted to a ConvAI URL, an existing
				<code>wss://</code> target is used directly, and signed mode calls your server route.
			</p>
		</li>
		<li>
			<p>
				Open the socket, send the initiation frame, and wait for
				<code>conversation_initiation_metadata</code>. The controller has a 15 second handshake
				timeout.
			</p>
		</li>
	</ol>
	<p>
		The start promise never rejects. Read <code>error</code> and <code>errorCode</code> after it
		settles, or pass <code>onError</code> when the controller is created. Calling start while a session
		is active is a no-op.
	</p>
	<p>You can also end a session with the alias <code>endSession()</code>.</p>

	<h2 id="state">Session state</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Controller fields</caption>
			<thead>
				<tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Notes</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>status</code></td><td><code>ConversationStatus</code></td><td
						>Connection lifecycle.</td
					></tr
				>
				<tr
					><td><code>mode</code></td><td><code>ConversationMode</code></td><td
						>Single label: disconnected, connecting, ready, listening, or speaking.</td
					></tr
				>
				<tr
					><td><code>canStart</code></td><td><code>boolean</code></td><td
						>True when the controller is disconnected.</td
					></tr
				>
				<tr
					><td><code>isSpeaking</code></td><td><code>boolean</code></td><td
						>Agent playback is scheduled or audible.</td
					></tr
				>
				<tr
					><td><code>isListening</code></td><td><code>boolean</code></td><td
						>Microphone is live and not muted.</td
					></tr
				>
				<tr
					><td><code>isUserSpeaking</code></td><td><code>boolean</code></td><td
						>Local voice activity detection hears speech.</td
					></tr
				>
				<tr
					><td><code>isMuted</code></td><td><code>boolean</code></td><td
						>Outgoing audio is stopped.</td
					></tr
				>
				<tr
					><td><code>isTextOnly</code></td><td><code>boolean</code></td><td
						>Current session or next session runs without audio devices.</td
					></tr
				>
				<tr
					><td><code>volume</code></td><td><code>number</code></td><td
						>Loudest level from 0 to 1.</td
					></tr
				>
				<tr
					><td><code>inputVolume</code></td><td><code>number</code></td><td
						>Normalized microphone level.</td
					></tr
				>
				<tr
					><td><code>outputVolume</code></td><td><code>number</code></td><td
						>Normalized agent playback level.</td
					></tr
				>
				<tr
					><td><code>transcripts</code></td><td><code>TranscriptMessage[]</code></td><td
						>Streaming transcript entries.</td
					></tr
				>
				<tr
					><td><code>messageCount</code></td><td><code>number</code></td><td
						>Derived from the transcript length.</td
					></tr
				>
				<tr
					><td><code>message</code></td><td><code>TranscriptMessage | null</code></td><td
						>Most recently created or updated entry.</td
					></tr
				>
				<tr
					><td><code>error</code></td><td><code>string | null</code></td><td>Safe to render.</td
					></tr
				>
				<tr
					><td><code>errorCode</code></td><td><code>ConversationErrorCode | null</code></td><td
						>Stable category for UI branches.</td
					></tr
				>
				<tr
					><td><code>latency</code></td><td><code>number | null</code></td><td
						>Latest time to first audio, in milliseconds.</td
					></tr
				>
				<tr
					><td><code>latencyHistory</code></td><td><code>number[]</code></td><td
						>Recent measurements, oldest first. Keeps 12.</td
					></tr
				>
				<tr
					><td><code>conversationId</code></td><td><code>string | null</code></td><td
						>ElevenLabs conversation id after negotiation.</td
					></tr
				>
				<tr
					><td><code>inputAudioFormat</code></td><td><code>AudioFormatId | null</code></td><td
						>Negotiated microphone format.</td
					></tr
				>
				<tr
					><td><code>outputAudioFormat</code></td><td><code>AudioFormatId | null</code></td><td
						>Negotiated agent format.</td
					></tr
				>
				<tr
					><td><code>queueStatus</code></td><td><code>QueueStatus | null</code></td><td
						>Concurrency queue state.</td
					></tr
				>
				<tr
					><td><code>interruptions</code></td><td><code>number</code></td><td
						>Barge-ins counted once per signal.</td
					></tr
				>
				<tr
					><td><code>canSendFeedback</code></td><td><code>boolean</code></td><td
						>Feedback is available for the current response.</td
					></tr
				>
				<tr
					><td><code>vadScore</code></td><td><code>number</code></td><td
						>Latest server voice activity score.</td
					></tr
				>
				<tr
					><td><code>contextUsage</code></td><td
						><code>ContextUsageServerEvent['context_usage_event'] | null</code></td
					><td>LLM context window usage.</td></tr
				>
				<tr
					><td><code>outputGain</code></td><td><code>number</code></td><td
						>Playback gain from 0 to 1.</td
					></tr
				>
				<tr
					><td><code>inputDeviceId</code></td><td><code>string | null</code></td><td
						>Current microphone device id.</td
					></tr
				>
				<tr
					><td><code>outputDeviceId</code></td><td><code>string | null</code></td><td
						>Current output device id.</td
					></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="transcripts">Transcripts</h2>
	<p>
		Entries have a stable <code>id</code>. Partial agent text updates the same entry as it streams,
		and corrections replace the text in place. Check <code>isFinal</code> when you want to style streaming
		content differently.
	</p>
	<CodeBlock
		lang="svelte"
		code={`{#each conversation.transcripts as message (message.id)}
  <article data-role={message.role}>
    <strong>{message.role === 'user' ? 'You' : 'Agent'}</strong>
    <p>{message.text}</p>
    {#if !message.isFinal}
      <span aria-label="Still streaming">...</span>
    {/if}
  </article>
{/each}`}
	/>
	<p>
		The transcript is capped by <code>maxTranscripts</code>, which defaults to 250 and is clamped to
		at least 20. Starting a new session clears the transcript unless
		<code>resetTranscriptsOnStart</code> is set to <code>false</code>.
		<code>clearTranscripts()</code>
		clears it without touching the server conversation.
	</p>
	<p>
		Agent entries can include <code>attachments</code> and a <code>responseId</code>. Files are
		plain objects with <code>url</code>, <code>name</code>, and an optional <code>mime_type</code>.
	</p>

	<h2 id="text-turns">Text turns</h2>
	<p>
		Text only sessions use the same socket and protocol without opening a microphone. You can also
		send typed turns during a voice session.
	</p>
	<CodeBlock
		lang="ts"
		code={`await conversation.startConversation('agent_your_public_id', {
  textOnly: true
});

conversation.sendUserMessage('Show my last order.');
conversation.sendContextualUpdate('The customer is on the checkout page.', 'checkout');
conversation.sendUserActivity();`}
	/>
	<ul>
		<li>
			<code>sendUserMessage(text)</code> adds a typed user turn and returns <code>false</code> when the
			socket is not open or the text is empty.
		</li>
		<li>
			<code>sendContextualUpdate(text, contextId?)</code> injects context for the next turn without interrupting
			speech. Reusing a context id replaces older context.
		</li>
		<li>
			<code>sendUserActivity()</code> signals that the user is present. Calls are throttled to one frame
			per second.
		</li>
	</ul>
	<p>
		Set <code>textOnly</code> on the controller when the whole page is a chat, or pass it per start call
		when the same controller needs both modes. A per-start value wins for that session.
	</p>

	<h2 id="mute-volume">Mute and playback</h2>
	<CodeBlock
		lang="ts"
		code={`conversation.toggleMute();
conversation.setMuted(true);
conversation.setVolume(0.8);

// Object form is accepted for API familiarity.
conversation.setVolume({ volume: 0.65 });`}
	/>
	<p>
		Muting stops outgoing chunks but keeps the microphone track and audio context alive, so unmuting
		is instant. <code>setVolume</code> clamps the value to the 0 to 1 range and updates
		<code>outputGain</code>.
	</p>
	<p>
		Barge-in is local and server assisted. When local voice activity crosses <code
			>vadThreshold</code
		>
		and <code>interruptOnUserSpeech</code> is enabled, queued playback is flushed immediately. A
		server
		<code>interruption</code> event does the same. The controller counts one interruption when both signals
		arrive together.
	</p>

	<h2 id="feedback">Feedback</h2>
	<p>
		Feedback becomes available after an agent response supplies an event id. Render controls only
		when
		<code>canSendFeedback</code> is true.
	</p>
	<CodeBlock
		lang="svelte"
		code={`{#if conversation.canSendFeedback}
  <button onclick={() => conversation.sendFeedback(true)}>Helpful</button>
  <button onclick={() => conversation.sendFeedback(false)}>Not helpful</button>
{/if}`}
	/>
	<p>
		<code>sendFeedback(like, eventId?)</code> defaults to the latest agent response. It returns
		<code>false</code> when feedback is not available or the socket is closed.
	</p>

	<h2 id="cleanup">Cleanup</h2>
	<p>
		<code>useConversation</code> registers an <code>$effect</code> teardown. On unmount it closes
		the socket, stops media tracks, disconnects the audio graph, aborts signed URL requests, clears
		timers, and closes both audio contexts. Set <code>autoCleanup: false</code> only when you intend
		to call
		<code>destroy()</code> yourself.
	</p>
	<CodeBlock
		lang="ts"
		code={`import { createConversation } from 'svelte-elevenlabs';

const conversation = createConversation({
  agentId: 'agent_your_public_id'
});

await conversation.startConversation();

// Later, or from a store teardown:
conversation.destroy();`}
	/>
	<p>
		<code>stopConversation()</code> ends the call but keeps the transcript for a post-call view.
		<code>destroy()</code> is idempotent. The controller also stops itself on
		<code>pagehide</code> so a navigation does not leave a socket running.
	</p>
	<Callout tone="warning" title="Call the controller during initialisation">
		<p>
			<code>useConversation</code> must be called synchronously during component initialisation. If
			you need a controller in a store, a test, or after an <code>await</code>, use
			<code>createConversation</code> and own the cleanup.
		</p>
	</Callout>
</DocsPage>
