<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Quickstart"
	summary="A complete voice panel in one component, then the signed URL switch you need for a private agent."
	toc={[
		{ id: 'first-session', label: 'Your first session' },
		{ id: 'live-state', label: 'Live state' },
		{ id: 'signed-mode', label: 'Signed mode' },
		{ id: 'widget', label: 'Ready-made widget' }
	]}
>
	<h2 id="first-session">Your first session</h2>
	<p>
		Call <code>useConversation</code> during component initialisation. It creates a controller and registers
		a teardown effect, so there is no socket or audio graph to close by hand.
	</p>
	<CodeBlock
		filename="VoicePanel.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { useConversation } from 'svelte-elevenlabs';

  const conversation = useConversation({
    agentId: 'agent_your_public_id'
  });

  function toggle(): void {
    if (conversation.status === 'disconnected') {
      void conversation.startConversation();
      return;
    }
    conversation.stopConversation();
  }
\u003C/script>

<button onclick={toggle} disabled={conversation.status === 'connecting'}>
  {conversation.status === 'connected' ? 'End session' : 'Start session'}
</button>

<p>Status: {conversation.status}</p>

{#each conversation.transcripts as message (message.id)}
  <p><strong>{message.role}:</strong> {message.text}</p>
{/each}`}
	/>
	<p>
		For a voice session, call <code>startConversation()</code> from a user gesture. Microphone
		permission and both <code>AudioContext</code> instances are created inside that click, which keeps
		playback from being suspended behind an autoplay gate.
	</p>
	<p>
		The promise resolves after the handshake metadata or after a start failure. Connection and audio
		failures appear through <code>error</code>, <code>errorCode</code>, and <code>onError</code>
		instead of a rejected promise, so <code>void conversation.startConversation()</code> is safe.
	</p>

	<h2 id="live-state">Live state</h2>
	<p>
		Every value below is Svelte state. Read it directly in markup or derive from it with
		<code>$derived</code>.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Values you will use first</caption>
			<thead>
				<tr><th scope="col">Value</th><th scope="col">Type</th><th scope="col">Meaning</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>status</code></td><td><code>disconnected | connecting | connected</code></td
					><td>Connection lifecycle.</td></tr
				>
				<tr
					><td><code>isSpeaking</code></td><td><code>boolean</code></td><td
						>Agent audio is scheduled or playing.</td
					></tr
				>
				<tr
					><td><code>isListening</code></td><td><code>boolean</code></td><td
						>Microphone is live and the agent can hear it.</td
					></tr
				>
				<tr
					><td><code>isUserSpeaking</code></td><td><code>boolean</code></td><td
						>Local voice activity detection hears the user.</td
					></tr
				>
				<tr
					><td><code>isMuted</code></td><td><code>boolean</code></td><td
						>Outgoing microphone audio is stopped.</td
					></tr
				>
				<tr
					><td><code>volume</code></td><td><code>number</code></td><td
						>Loudest normalized level from 0 to 1.</td
					></tr
				>
				<tr
					><td><code>transcripts</code></td><td><code>TranscriptMessage[]</code></td><td
						>Stable entries, including partial agent text.</td
					></tr
				>
				<tr
					><td><code>error</code></td><td><code>string | null</code></td><td
						>Human-readable message that is safe to render.</td
					></tr
				>
				<tr
					><td><code>errorCode</code></td><td><code>ConversationErrorCode | null</code></td><td
						>Stable category for branching in your UI.</td
					></tr
				>
				<tr
					><td><code>latency</code></td><td><code>number | null</code></td><td
						>Latest time to first agent audio, in milliseconds.</td
					></tr
				>
				<tr
					><td><code>queueStatus</code></td><td
						><code>waiting | admitted | timed_out | null</code></td
					><td>Concurrency queue state when the agent is at capacity.</td></tr
				>
			</tbody>
		</table>
	</div>
	<p>A small error banner can use the message directly:</p>
	<CodeBlock
		lang="svelte"
		code={`{#if conversation.error}
  <p role="alert">{conversation.error}</p>
  <button onclick={() => conversation.clearError()}>Dismiss</button>
{/if}`}
	/>

	<h2 id="signed-mode">Signed mode</h2>
	<p>
		Public agent ids connect directly. For a private agent, or for production traffic where the API
		key must stay on the server, ask the controller to exchange the id for a short-lived URL:
	</p>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  signedUrlEndpoint: '/api/signed-url'
});

await conversation.startConversation(undefined, { signed: true });`}
	/>
	<p>
		The default endpoint is already <code>/api/signed-url</code>, so the option is only needed when
		your route lives somewhere else. A target that is already a full WebSocket URL bypasses the
		exchange and connects directly.
	</p>
	<Callout tone="note" title="Server route required">
		<p>
			Signed mode needs a running server. GitHub Pages and other static hosts cannot mint URLs. See
			<a href={resolve('/docs/signed-urls')}>Signed URLs</a> for the route contract and a deployment checklist.
		</p>
	</Callout>

	<h2 id="widget">Ready-made widget</h2>
	<p>
		If you want the full control surface without writing it, use <code>ConversationWidget</code>.
		Pass an agent id and it owns the session, or pass a <code>controller</code> you already created.
	</p>
	<CodeBlock
		filename="App.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { ConversationWidget } from 'svelte-elevenlabs';
\u003C/script>

<ConversationWidget
  agentId="agent_your_public_id"
  signed
  title="Talk to the agent"
  subtitle="Live voice and text"
/>`}
	/>
	<p>
		The widget includes the target field, visualizer, transcript, text composer, feedback buttons,
		playback volume, device selectors, and telemetry. The target field, visualizer, transcript,
		telemetry, composer, feedback, and audio controls each have a <code>show*</code> prop. Read
		<a href={resolve('/docs/components')}>Components</a> for the full prop list and theme variables.
	</p>
</DocsPage>
