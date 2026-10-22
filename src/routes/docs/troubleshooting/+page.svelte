<script lang="ts">
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Troubleshooting"
	summary="Read the error code first, then check the browser, the server, and the agent configuration."
	toc={[
		{ id: 'error-codes', label: 'Error codes' },
		{ id: 'microphone', label: 'Microphone' },
		{ id: 'connection', label: 'Connection' },
		{ id: 'audio', label: 'Audio' },
		{ id: 'static', label: 'Static hosting' },
		{ id: 'lifecycle', label: 'Svelte lifecycle' },
		{ id: 'diagnostics', label: 'Diagnostics' },
		{ id: 'still-stuck', label: 'Still stuck' }
	]}
>
	<h2 id="error-codes">Error codes</h2>
	<p>
		The controller publishes a human-readable <code>error</code> and a stable
		<code>errorCode</code>. Branch on the code, show the message, and use the table below to find
		the likely cause.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>ConversationErrorCode</caption>
			<thead>
				<tr
					><th scope="col">Code</th><th scope="col">Likely cause</th><th scope="col"
						>What to check</th
					></tr
				>
			</thead>
			<tbody>
				<tr
					><td><code>not-supported</code></td><td
						>Missing browser API, text only misuse, or a destroyed controller.</td
					><td
						>Check <code>AudioManager.isSupported()</code> and whether the target is a voice session.</td
					></tr
				>
				<tr
					><td><code>insecure-context</code></td><td>The page is not on HTTPS or localhost.</td><td
						>Serve the app from a secure origin.</td
					></tr
				>
				<tr
					><td><code>permission-denied</code></td><td
						>The user or browser blocked the microphone.</td
					><td>Check site permissions and any iframe <code>allow</code> policy.</td></tr
				>
				<tr
					><td><code>audio-failed</code></td><td>The audio graph could not be created or read.</td
					><td>Check Web Audio support, output devices, and the console.</td></tr
				>
				<tr
					><td><code>invalid-target</code></td><td
						>The target is not an agent id or a valid <code>ws://</code> or <code>wss://</code> URL.</td
					><td>Use an <code>agent_</code> or <code>seng_</code> id, or a full WebSocket URL.</td
					></tr
				>
				<tr
					><td><code>signed-url-failed</code></td><td
						>The server route failed, timed out, or returned an unexpected payload.</td
					><td>Check the route, the server key, and the network response.</td></tr
				>
				<tr
					><td><code>connection-failed</code></td><td
						>The socket could not open or the handshake failed.</td
					><td>Check the network, agent id, signed URL, and browser console.</td></tr
				>
				<tr
					><td><code>connection-timeout</code></td><td>No metadata arrived within 15 seconds.</td
					><td>Check the agent configuration and whether the network blocks WebSocket upgrades.</td
					></tr
				>
				<tr
					><td><code>server-closed</code></td><td
						>The server closed the socket or the wait queue expired.</td
					><td>Read the close reason, then retry or check agent capacity.</td></tr
				>
				<tr
					><td><code>protocol-error</code></td><td
						>An event, approval result, or negotiated format did not match expectations.</td
					><td>Enable <code>debug</code> and inspect the event type.</td></tr
				>
				<tr
					><td><code>device-not-found</code></td><td>The selected device disappeared.</td><td
						>Refresh <code>listAudioDevices()</code> and fall back to the default.</td
					></tr
				>
				<tr
					><td><code>device-busy</code></td><td>Another app holds the microphone.</td><td
						>Close the other app or choose a different input.</td
					></tr
				>
				<tr
					><td><code>device-constraints</code></td><td
						>The requested device cannot satisfy the audio constraints.</td
					><td>Use the default device or relax the constraints.</td></tr
				>
				<tr
					><td><code>device-switch-failed</code></td><td>A live input or output switch failed.</td
					><td>The previous device is restored. Check whether output routing is supported.</td></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="microphone">Microphone</h2>
	<ol class="docs-steps">
		<li>
			<p>
				Confirm the page uses <code>https://</code> or <code>http://localhost</code>. Other origins
				cannot call <code>getUserMedia</code>.
			</p>
		</li>
		<li>
			<p>
				Check the browser site settings. A denied permission does not prompt a second time until the
				site is reset.
			</p>
		</li>
		<li>
			<p>
				If the page is embedded, make sure the iframe allows microphone access with the right <code
					>allow</code
				> attribute and a compatible Permissions Policy.
			</p>
		</li>
		<li>
			<p>
				Start the session from a click or tap. Starting during module evaluation or automatically
				after load can be blocked or suspended.
			</p>
		</li>
	</ol>
	<p>
		Input device labels are often empty before permission is granted. Call
		<code>listAudioDevices()</code> after the first successful session if you need labels.
	</p>

	<h2 id="connection">Connection</h2>
	<p>Work from the innermost failure outward:</p>
	<ul>
		<li>
			<strong><code>invalid-target</code>:</strong> public ids start with <code>agent_</code> or
			<code>seng_</code>. A full URL must use <code>ws://</code> or <code>wss://</code> (an
			<code>http://</code> or <code>https://</code> URL is normalized).
		</li>
		<li>
			<strong><code>signed-url-failed</code>:</strong> open the route directly in the browser with
			the same agent id. A missing <code>ELEVENLABS_API_KEY</code> returns HTTP 500. A rejected key returns
			a 502 with a message about the workspace. A 404 means the agent was not found.
		</li>
		<li>
			<strong><code>connection-failed</code>:</strong> check the browser network panel for the
			WebSocket upgrade. Proxies and content security policies can block <code>wss://</code>.
		</li>
		<li>
			<strong><code>connection-timeout</code>:</strong> the socket opened but no metadata arrived in 15
			seconds. Check that the agent exists and is not paused.
		</li>
		<li>
			<strong><code>queueStatus === 'waiting'</code>:</strong> the agent is at its concurrency
			limit. The UI can show the wait state. A <code>timed_out</code> state also publishes
			<code>server-closed</code>.
		</li>
	</ul>
	<p>
		A public id connects to the US origin by default. Set <code>serverLocation</code> to
		<code>eu-residency</code> or <code>in-residency</code> when the agent lives elsewhere, or pass
		an explicit <code>origin</code>.
	</p>

	<h2 id="audio">Audio</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Common audio symptoms</caption>
			<thead>
				<tr><th scope="col">Symptom</th><th scope="col">Check</th></tr>
			</thead>
			<tbody>
				<tr
					><td>No microphone input</td><td
						>Permission, <code>isMuted</code>, the selected input device, and whether the session is
						voice or text only.</td
					></tr
				>
				<tr
					><td>No agent sound</td><td
						>Browser tab mute, system output, <code>outputGain</code>, the selected output device,
						and whether playback was flushed by barge-in.</td
					></tr
				>
				<tr
					><td>Choppy playback</td><td
						>Main-thread work, a suspended audio context, and very small <code
							>inputChunkDurationMs</code
						> values.</td
					></tr
				>
				<tr
					><td>Agent interrupts itself</td><td
						>Lower <code>vadThreshold</code> sensitivity by raising the value, or set
						<code>interruptOnUserSpeech: false</code>.</td
					></tr
				>
				<tr
					><td>No output device list</td><td
						>Some browsers expose only the default device, or hide labels until microphone
						permission is granted.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		The controller does not retry a failed media operation silently. Every switch returns a boolean
		and sets <code>error</code> when it cannot complete.
	</p>

	<h2 id="static">Static hosting</h2>
	<p>
		GitHub Pages has no server runtime, so <code>/api/signed-url</code> does not exist there. The
		showcase builds with <code>PUBLIC_HOSTING_MODE=static</code>, hides signed mode, and uses public
		agent ids. If you deploy the app yourself, either provide a real server or keep signed mode out
		of the static build.
	</p>
	<p>
		For a project site, set <code>PAGES_BASE_PATH</code> to the repository path, for example
		<code>/svelte-elevenlabs</code>. Without it, links and assets may resolve from the domain root
		and return 404.
	</p>

	<h2 id="lifecycle">Svelte lifecycle</h2>
	<ul>
		<li>
			<strong><code>useConversation</code> outside initialisation:</strong> call it synchronously in
			a component script. In a store, test, or async function, use <code>createConversation</code>.
		</li>
		<li>
			<strong>Context missing:</strong> <code>getConversationContext</code> and
			<code>useConversationClientTool</code> require a <code>ConversationProvider</code> ancestor.
		</li>
		<li>
			<strong>Leaked sessions in tests:</strong> call <code>destroy()</code> when a manually created controller
			is no longer needed. It is idempotent.
		</li>
		<li>
			<strong>SSR surprises:</strong> importing the package is safe, but starting a session during SSR
			is not. Start from a browser event and read browser APIs only after mount.
		</li>
	</ul>

	<h2 id="diagnostics">Diagnostics</h2>
	<p>Turn on structured logging for one session:</p>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  debug: true,
  onDebug: (event) => console.log(event.kind, event.message, event.data),
  onIncomingEvent: (event) => console.log('in', event.type),
  onOutgoingEvent: (event) => console.log('out', event.type)
});`}
	/>
	<p>
		The debug stream is redacted and does not include transcript text or credentials. The raw event
		callbacks do include protocol payloads, so remove them before shipping or route them to a safe
		development logger.
	</p>
	<Callout tone="warning" title="Do not paste secrets into an issue">
		<p>
			Remove API keys, signed URLs, agent ids if they are private, and transcript content before
			sharing logs. A signed URL is a temporary credential.
		</p>
	</Callout>

	<h2 id="still-stuck">Still stuck</h2>
	<p>
		Open an issue at <a href="https://github.com/GABRYCA/svelte-elevenlabs/issues" rel="noreferrer"
			>GitHub issues</a
		>
		with the package version, browser and version, the exact error code, whether the session used a public
		id or a signed URL, and the smallest reproduction you can share. Do not include the API key or a live
		signed URL.
	</p>
	<p>
		For protocol details beyond this package, use the
		<a href="https://elevenlabs.io/docs/conversational-ai/overview" rel="noreferrer"
			>ElevenLabs Conversational AI documentation</a
		>.
	</p>
</DocsPage>
