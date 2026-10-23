<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from './_components/Callout.svelte';
	import DocsPage from './_components/DocsPage.svelte';
</script>

<DocsPage
	title="Documentation"
	summary="Everything you need to open a voice or text session with Svelte 5, keep the API key on the server, and release its browser resources on the way out."
	toc={[
		{ id: 'what-this-is', label: 'What this is' },
		{ id: 'what-you-get', label: 'What you get' },
		{ id: 'how-it-fits', label: 'How it fits together' },
		{ id: 'start-here', label: 'Start here' }
	]}
>
	<h2 id="what-this-is">What this is</h2>
	<p>
		<code>svelte-elevenlabs</code> is an independent Svelte 5 package for ElevenLabs Conversational AI.
		It owns the browser side of one live session: the WebSocket handshake, microphone capture, agent playback,
		transcript state, tools, and teardown. Your component owns the interface.
	</p>
	<p>
		The package is not an official ElevenLabs SDK. It follows the public Conversational AI WebSocket
		protocol, exposes a typed surface, and reports failures with stable error codes instead of
		leaving a silent dead line. The included SvelteKit showcase in this repository is a working
		reference for the core session flow described here.
	</p>

	<dl class="docs-facts">
		<div>
			<dt>Platforms</dt>
			<dd>Browser UI / server on Node 22.17+ or Bun 1.4+</dd>
		</div>
		<div>
			<dt>Reactivity</dt>
			<dd>Svelte 5 runes</dd>
		</div>
		<div>
			<dt>Transport</dt>
			<dd>WebSocket / ConvAI</dd>
		</div>
		<div>
			<dt>Audio</dt>
			<dd>PCM16 and µ-law</dd>
		</div>
		<div>
			<dt>Auth</dt>
			<dd>Public id or signed URL</dd>
		</div>
		<div>
			<dt>Teardown</dt>
			<dd>Automatic or manual</dd>
		</div>
		<div>
			<dt>License</dt>
			<dd>MIT</dd>
		</div>
	</dl>

	<h2 id="what-you-get">What you get</h2>
	<ul>
		<li>
			<strong>One reactive controller.</strong> Status, speaking and listening flags, levels, transcripts,
			latency, queue state, and errors update directly in markup.
		</li>
		<li>
			<strong>Voice or text.</strong> Capture the microphone and play streamed agent audio, or run the
			same socket in text only mode without requesting a device.
		</li>
		<li>
			<strong>A real audio pipeline.</strong> AudioWorklet capture, resampling, PCM16 framing, one playback
			clock, and immediate barge-in flushing.
		</li>
		<li>
			<strong>Server-held credentials.</strong> The signed URL route exchanges an agent id for a short-lived
			URL so the API key never reaches the browser.
		</li>
		<li>
			<strong>Conversation tooling.</strong> Named client tools, a provider scoped tool hook, MCP approval
			handling, feedback, typed turns, and contextual updates.
		</li>
		<li>
			<strong>Optional UI.</strong> Live spectra and a complete conversation widget ship in the same package,
			both driven by a conversation controller.
		</li>
	</ul>

	<h2 id="how-it-fits">How it fits together</h2>
	<ol class="docs-steps">
		<li>
			<p>
				<strong>Your component calls a controller.</strong> <code>useConversation</code> creates a
				<code>ConversationController</code> and registers an <code>$effect</code> teardown. Use
				<code>createConversation</code> in stores, tests, or any place where you want to own cleanup.
			</p>
		</li>
		<li>
			<p>
				<strong>The controller runs the session.</strong> It resolves the target, prepares audio inside
				the user gesture when needed, fetches a signed URL when asked, opens the socket, negotiates formats,
				and reduces protocol events into Svelte state and derived values.
			</p>
		</li>
		<li>
			<p>
				<strong>The audio manager handles the browser.</strong> <code>AudioManager</code> owns microphone
				tracks, the worklet, the playback clock, analyser nodes, and device routing. You only touch it
				directly when you need a custom audio surface.
			</p>
		</li>
	</ol>

	<Callout tone="note" title="Browser first">
		<p>
			Opening a voice session requires a browser and a secure context, and should start from a user
			gesture. Imports and SSR are safe, but the microphone and both audio contexts are created only
			when you call <code>startConversation()</code>. Text only sessions skip the audio setup.
		</p>
	</Callout>

	<h2 id="start-here">Start here</h2>
	<div class="docs-index">
		<a href={resolve('/docs/install')}>
			<span class="docs-index__meta">Start here</span>
			<span class="docs-index__label">Install</span>
			<span class="docs-index__copy"
				>Add the package, set the server key, and verify the build.</span
			>
		</a>
		<a href={resolve('/docs/quickstart')}>
			<span class="docs-index__meta">First session</span>
			<span class="docs-index__label">Quickstart</span>
			<span class="docs-index__copy">A working voice panel in one Svelte component.</span>
		</a>
		<a href={resolve('/docs/sessions')}>
			<span class="docs-index__meta">Guide</span>
			<span class="docs-index__label">Sessions</span>
			<span class="docs-index__copy"
				>Lifecycle, transcripts, text turns, feedback, and cleanup.</span
			>
		</a>
		<a href={resolve('/docs/audio')}>
			<span class="docs-index__meta">Guide</span>
			<span class="docs-index__label">Audio</span>
			<span class="docs-index__copy">Formats, capture, playback, devices, and analyser data.</span>
		</a>
		<a href={resolve('/docs/client-tools')}>
			<span class="docs-index__meta">Guide</span>
			<span class="docs-index__label">Client tools</span>
			<span class="docs-index__copy">Named tools, provider registration, and MCP approvals.</span>
		</a>
		<a href={resolve('/docs/signed-urls')}>
			<span class="docs-index__meta">Security</span>
			<span class="docs-index__label">Signed URLs</span>
			<span class="docs-index__copy">The server route contract and the deployment checklist.</span>
		</a>
	</div>
</DocsPage>
