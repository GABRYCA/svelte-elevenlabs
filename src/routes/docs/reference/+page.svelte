<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="API reference"
	summary="The public controller, options, methods, callbacks, types, and audio helpers, with the defaults that matter."
	toc={[
		{ id: 'entry-points', label: 'Entry points' },
		{ id: 'controller-state', label: 'Controller state' },
		{ id: 'methods', label: 'Methods' },
		{ id: 'options', label: 'Options' },
		{ id: 'callbacks', label: 'Callbacks' },
		{ id: 'types', label: 'Types' },
		{ id: 'audio-helpers', label: 'Audio helpers' }
	]}
>
	<h2 id="entry-points">Entry points</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Public exports</caption>
			<thead>
				<tr><th scope="col">Export</th><th scope="col">Kind</th><th scope="col">Purpose</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>useConversation(options?)</code></td><td>Rune</td><td
						>Creates a controller and registers an <code>$effect</code> teardown.</td
					></tr
				>
				<tr
					><td><code>createConversation(options?)</code></td><td>Function</td><td
						>Creates a controller without a lifecycle effect. Call <code>destroy()</code> yourself.</td
					></tr
				>
				<tr
					><td><code>ConversationController</code></td><td>Class</td><td
						>The reactive controller. Accepts the same options as the factory functions.</td
					></tr
				>
				<tr
					><td><code>ConversationProvider</code></td><td>Component</td><td
						>Shares a controller through Svelte context.</td
					></tr
				>
				<tr
					><td><code>getConversationContext()</code></td><td>Function</td><td
						>Reads the controller from the nearest provider.</td
					></tr
				>
				<tr
					><td><code>setConversationContext(controller)</code></td><td>Function</td><td
						>Supplies a controller to a component subtree.</td
					></tr
				>
				<tr
					><td><code>useConversationClientTool(name, handler)</code></td><td>Rune</td><td
						>Registers a component scoped tool on the provider controller.</td
					></tr
				>
				<tr
					><td><code>AudioManager</code></td><td>Class</td><td
						>Framework-agnostic capture, playback, and device engine.</td
					></tr
				>
				<tr
					><td><code>AudioVisualizer</code></td><td>Component</td><td
						>Canvas spectrum driven by a controller.</td
					></tr
				>
				<tr
					><td><code>ConversationWidget</code></td><td>Component</td><td
						>Complete conversation surface.</td
					></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="controller-state">Controller state</h2>
	<p>
		These fields are Svelte state. They are read-only from your component. The full behavior for
		each group is covered in <a href={resolve('/docs/sessions')}>Sessions</a> and
		<a href={resolve('/docs/audio')}>Audio</a>.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Fields</caption>
			<thead>
				<tr><th scope="col">Field</th><th scope="col">Type</th></tr>
			</thead>
			<tbody>
				<tr><td><code>status</code></td><td><code>ConversationStatus</code></td></tr>
				<tr><td><code>mode</code></td><td><code>ConversationMode</code></td></tr>
				<tr><td><code>canStart</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>isSpeaking</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>isListening</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>isUserSpeaking</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>isMuted</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>isTextOnly</code></td><td><code>boolean</code> (getter)</td></tr>
				<tr><td><code>volume</code></td><td><code>number</code></td></tr>
				<tr><td><code>inputVolume</code></td><td><code>number</code></td></tr>
				<tr><td><code>outputVolume</code></td><td><code>number</code></td></tr>
				<tr><td><code>transcripts</code></td><td><code>TranscriptMessage[]</code></td></tr>
				<tr><td><code>messageCount</code></td><td><code>number</code></td></tr>
				<tr><td><code>message</code></td><td><code>TranscriptMessage | null</code></td></tr>
				<tr><td><code>error</code></td><td><code>string | null</code></td></tr>
				<tr><td><code>errorCode</code></td><td><code>ConversationErrorCode | null</code></td></tr>
				<tr><td><code>latency</code></td><td><code>number | null</code></td></tr>
				<tr><td><code>latencyHistory</code></td><td><code>number[]</code></td></tr>
				<tr><td><code>conversationId</code></td><td><code>string | null</code></td></tr>
				<tr><td><code>inputAudioFormat</code></td><td><code>AudioFormatId | null</code></td></tr>
				<tr><td><code>outputAudioFormat</code></td><td><code>AudioFormatId | null</code></td></tr>
				<tr><td><code>queueStatus</code></td><td><code>QueueStatus | null</code></td></tr>
				<tr><td><code>interruptions</code></td><td><code>number</code></td></tr>
				<tr><td><code>canSendFeedback</code></td><td><code>boolean</code></td></tr>
				<tr><td><code>vadScore</code></td><td><code>number</code></td></tr>
				<tr
					><td><code>contextUsage</code></td><td
						><code>ContextUsageServerEvent['context_usage_event'] | null</code></td
					></tr
				>
				<tr><td><code>outputGain</code></td><td><code>number</code></td></tr>
				<tr><td><code>inputDeviceId</code></td><td><code>string | null</code></td></tr>
				<tr><td><code>outputDeviceId</code></td><td><code>string | null</code></td></tr>
			</tbody>
		</table>
	</div>

	<h2 id="methods">Methods</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Controller methods</caption>
			<thead>
				<tr><th scope="col">Method</th><th scope="col">Returns</th><th scope="col">Notes</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>startConversation(target?, options?)</code></td><td
						><code>Promise&lt;void&gt;</code></td
					><td
						>Opens the session. Never rejects. Target can be an agent id, a <code>ws://</code> or
						<code>wss://</code> URL (http and https are normalized), or omitted.</td
					></tr
				>
				<tr
					><td><code>stopConversation()</code></td><td><code>void</code></td><td
						>Ends the session and preserves the transcript.</td
					></tr
				>
				<tr
					><td><code>endSession()</code></td><td><code>void</code></td><td
						>Alias for <code>stopConversation()</code>.</td
					></tr
				>
				<tr
					><td><code>toggleMute()</code></td><td><code>void</code></td><td
						>Flips the outgoing mute state.</td
					></tr
				>
				<tr
					><td><code>setMuted(muted)</code></td><td><code>void</code></td><td
						>Sets the outgoing mute state explicitly.</td
					></tr
				>
				<tr
					><td><code>setVolume(volume)</code></td><td><code>void</code></td><td
						>Accepts a number or <code>&#123; volume: number &#125;</code>. Clamps to 0 through 1.</td
					></tr
				>
				<tr
					><td><code>getInputVolume()</code></td><td><code>number</code></td><td
						>Latest normalized microphone level.</td
					></tr
				>
				<tr
					><td><code>getOutputVolume()</code></td><td><code>number</code></td><td
						>Latest normalized playback level.</td
					></tr
				>
				<tr
					><td><code>getInputFrequencyData(target?)</code></td><td><code>Uint8Array</code></td><td
						>512 bins. Reuse a buffer for animation frames.</td
					></tr
				>
				<tr
					><td><code>getOutputFrequencyData(target?)</code></td><td><code>Uint8Array</code></td><td
						>512 bins from agent playback.</td
					></tr
				>
				<tr
					><td><code>getInputByteFrequencyData(target?)</code></td><td><code>Uint8Array</code></td
					><td>Alias for <code>getInputFrequencyData</code>.</td></tr
				>
				<tr
					><td><code>getOutputByteFrequencyData(target?)</code></td><td><code>Uint8Array</code></td
					><td>Alias for <code>getOutputFrequencyData</code>.</td></tr
				>
				<tr
					><td><code>getId()</code></td><td><code>string | null</code></td><td
						>Current conversation id.</td
					></tr
				>
				<tr
					><td><code>sendFeedback(like, eventId?)</code></td><td><code>boolean</code></td><td
						>Defaults to the latest agent response. Requires <code>canSendFeedback</code>.</td
					></tr
				>
				<tr
					><td><code>sendUserActivity()</code></td><td><code>boolean</code></td><td
						>Throttled to one frame per second.</td
					></tr
				>
				<tr
					><td><code>sendMCPToolApprovalResult(toolCallId, approved)</code></td><td
						><code>boolean</code></td
					><td>Manual approval path. Sends at most one result per call.</td></tr
				>
				<tr
					><td><code>registerClientTool(name, handler)</code></td><td><code>() =&gt; void</code></td
					><td>Returns an unregister function.</td></tr
				>
				<tr
					><td><code>changeInputDevice(deviceId?)</code></td><td
						><code>Promise&lt;boolean&gt;</code></td
					><td>Requires an active voice session.</td></tr
				>
				<tr
					><td><code>changeOutputDevice(deviceId?)</code></td><td
						><code>Promise&lt;boolean&gt;</code></td
					><td>Requires an active voice session and browser output routing.</td></tr
				>
				<tr
					><td><code>listAudioDevices()</code></td><td
						><code>Promise&lt;AudioDeviceInfo[]&gt;</code></td
					><td>Wraps <code>enumerateDevices</code>.</td></tr
				>
				<tr
					><td><code>sendContextualUpdate(text, contextId?)</code></td><td><code>boolean</code></td
					><td>Non-interrupting context for the next turn.</td></tr
				>
				<tr
					><td><code>sendUserMessage(text)</code></td><td><code>boolean</code></td><td
						>Typed user turn over the same socket.</td
					></tr
				>
				<tr
					><td><code>clearTranscripts()</code></td><td><code>void</code></td><td
						>Local only. Does not affect the server conversation.</td
					></tr
				>
				<tr
					><td><code>clearError()</code></td><td><code>void</code></td><td
						>Clears <code>error</code> and <code>errorCode</code>.</td
					></tr
				>
				<tr
					><td><code>destroy()</code></td><td><code>void</code></td><td
						>Releases every resource. Idempotent.</td
					></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="options">Options</h2>
	<p>
		Every field is optional. The same object is accepted by <code>useConversation</code>,
		<code>createConversation</code>, the <code>ConversationController</code> constructor, and
		<code>ConversationProvider</code>.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>ConversationOptions</caption>
			<thead>
				<tr><th scope="col">Option</th><th scope="col">Type</th><th scope="col">Default</th></tr>
			</thead>
			<tbody>
				<tr><td><code>agentId</code></td><td><code>string</code></td><td>None</td></tr>
				<tr><td><code>signedUrl</code></td><td><code>string</code></td><td>None</td></tr>
				<tr
					><td><code>signedUrlEndpoint</code></td><td><code>string</code></td><td
						><code>'/api/signed-url'</code></td
					></tr
				>
				<tr
					><td><code>origin</code></td><td><code>string</code></td><td
						>Origin for <code>serverLocation</code></td
					></tr
				>
				<tr
					><td><code>serverLocation</code></td><td
						><code>'us' | 'eu-residency' | 'in-residency' | 'global'</code></td
					><td><code>'us'</code></td></tr
				>
				<tr
					><td><code>connectionType</code></td><td><code>'websocket' | 'webrtc'</code></td><td
						><code>'websocket'</code></td
					></tr
				>
				<tr
					><td><code>textOnly</code></td><td><code>boolean</code></td><td><code>false</code></td
					></tr
				>
				<tr
					><td><code>dynamicVariables</code></td><td
						><code>Record&lt;string, string | number | boolean&gt;</code></td
					><td>None</td></tr
				>
				<tr><td><code>userId</code></td><td><code>string</code></td><td>None</td></tr>
				<tr
					><td><code>overrides</code></td><td><code>ConversationConfigOverride</code></td><td
						>None</td
					></tr
				>
				<tr
					><td><code>clientTools</code></td><td
						><code>Record&lt;string, ClientToolHandler&gt;</code></td
					><td>None</td></tr
				>
				<tr
					><td><code>onClientToolCall</code></td><td
						><code>(call) =&gt; string | object | array | Promise</code></td
					><td>None</td></tr
				>
				<tr
					><td><code>inputDeviceId</code></td><td><code>string</code></td><td>System default</td
					></tr
				>
				<tr
					><td><code>outputDeviceId</code></td><td><code>string</code></td><td>System default</td
					></tr
				>
				<tr
					><td><code>micMuted</code></td><td><code>boolean</code></td><td><code>false</code></td
					></tr
				>
				<tr
					><td><code>outputVolume</code></td><td><code>number</code></td><td><code>1</code></td></tr
				>
				<tr
					><td><code>inputChunkDurationMs</code></td><td><code>number</code></td><td
						><code>100</code>, clamped to 50 through 250</td
					></tr
				>
				<tr
					><td><code>interruptOnUserSpeech</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					></tr
				>
				<tr
					><td><code>vadThreshold</code></td><td><code>number</code></td><td><code>0.075</code></td
					></tr
				>
				<tr
					><td><code>maxTranscripts</code></td><td><code>number</code></td><td
						><code>250</code>, minimum 20</td
					></tr
				>
				<tr
					><td><code>resetTranscriptsOnStart</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					></tr
				>
				<tr
					><td><code>autoCleanup</code></td><td><code>boolean</code></td><td
						><code>true</code> for <code>useConversation</code></td
					></tr
				>
				<tr><td><code>debug</code></td><td><code>boolean</code></td><td><code>false</code></td></tr>
			</tbody>
		</table>
	</div>

	<h2 id="callbacks">Callbacks</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Session and media callbacks</caption>
			<thead>
				<tr><th scope="col">Option</th><th scope="col">Payload</th><th scope="col">When</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>onStatusChange</code></td><td><code>ConversationStatus</code></td><td
						>Connection state changes.</td
					></tr
				>
				<tr
					><td><code>onConnect</code></td><td><code>&#123; conversationId: string &#125;</code></td
					><td>Metadata negotiation completes.</td></tr
				>
				<tr
					><td><code>onDisconnect</code></td><td><code>DisconnectDetails</code></td><td
						>The socket closes, including a client stop.</td
					></tr
				>
				<tr
					><td><code>onModeChange</code></td><td><code>ConversationMode</code></td><td
						>The derived mode label changes.</td
					></tr
				>
				<tr
					><td><code>onTranscript</code></td><td><code>TranscriptMessage</code></td><td
						>An entry is created or updated.</td
					></tr
				>
				<tr
					><td><code>onMessage</code></td><td><code>TranscriptMessage</code></td><td
						>Alias for <code>onTranscript</code>.</td
					></tr
				>
				<tr
					><td><code>onError</code></td><td><code>ConversationError</code></td><td
						>A failure is published.</td
					></tr
				>
				<tr
					><td><code>onLatency</code></td><td><code>number</code></td><td
						>A time-to-first-audio measurement lands.</td
					></tr
				>
				<tr
					><td><code>onInterruption</code></td><td>None</td><td
						>Local or server barge-in is counted.</td
					></tr
				>
				<tr
					><td><code>onCanSendFeedbackChange</code></td><td><code>boolean</code></td><td
						>Feedback availability changes.</td
					></tr
				>
				<tr
					><td><code>onVadScore</code></td><td><code>number</code></td><td
						>The server reports a voice activity score.</td
					></tr
				>
				<tr
					><td><code>onAudio</code></td><td><code>string</code></td><td
						>An agent audio chunk arrives before playback.</td
					></tr
				>
				<tr
					><td><code>onAudioAlignment</code></td><td><code>AudioAlignment</code></td><td
						>A chunk includes character timing.</td
					></tr
				>
				<tr
					><td><code>onPing</code></td><td><code>&#123; event_id, ping_ms? &#125;</code></td><td
						>A keep-alive arrives. The reply is automatic.</td
					></tr
				>
				<tr
					><td><code>onConversationMetadata</code></td><td
						><code>ConversationInitiationMetadata</code></td
					><td>The initiation metadata arrives.</td></tr
				>
				<tr
					><td><code>onConversationId</code></td><td><code>string</code></td><td
						>The conversation id becomes available.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Protocol and tool callbacks</caption>
			<thead>
				<tr><th scope="col">Option</th><th scope="col">Payload</th><th scope="col">When</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>onAgentChatResponsePart</code></td><td>Streaming part</td><td
						>A start, delta, or stop part arrives.</td
					></tr
				>
				<tr
					><td><code>onAgentResponseCorrection</code></td><td>Correction payload</td><td
						>The server corrects a response.</td
					></tr
				>
				<tr
					><td><code>onAgentResponseComplete</code></td><td><code>number</code></td><td
						>An agent response finishes.</td
					></tr
				>
				<tr
					><td><code>onAgentResponseMetadata</code></td><td>Metadata payload</td><td
						>Per-response metadata arrives.</td
					></tr
				>
				<tr
					><td><code>onContextUsage</code></td><td>Context usage</td><td
						>The LLM context window is reported.</td
					></tr
				>
				<tr
					><td><code>onMCPToolCall</code></td><td>MCP call</td><td>An MCP call changes state.</td
					></tr
				>
				<tr
					><td><code>onMCPConnectionStatus</code></td><td>Integration status</td><td
						>MCP connection state changes.</td
					></tr
				>
				<tr
					><td><code>onMCPToolApprovalRequest</code></td><td
						><code>(call, &#123; signal &#125;) =&gt; boolean</code></td
					><td>A call needs approval.</td></tr
				>
				<tr
					><td><code>onAgentToolRequest</code></td><td>Agent tool request</td><td
						>The agent starts a server side tool.</td
					></tr
				>
				<tr
					><td><code>onAgentToolResponse</code></td><td>Tool response</td><td
						>An agent tool finishes.</td
					></tr
				>
				<tr
					><td><code>onGuardrailTriggered</code></td><td>Guardrail event</td><td
						>A guardrail fires.</td
					></tr
				>
				<tr
					><td><code>onUnhandledClientToolCall</code></td><td>Client call</td><td
						>No named or fallback handler exists.</td
					></tr
				>
				<tr
					><td><code>onIncomingEvent</code></td><td><code>ServerEvent</code></td><td
						>Every parsed server event.</td
					></tr
				>
				<tr
					><td><code>onOutgoingEvent</code></td><td><code>ClientEvent</code></td><td
						>Every sent client frame.</td
					></tr
				>
				<tr
					><td><code>onDebug</code></td><td><code>DebugEvent</code></td><td
						>Structured diagnostics when <code>debug</code> is on.</td
					></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="types">Types</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Public types</caption>
			<thead>
				<tr><th scope="col">Type</th><th scope="col">Shape</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>AudioFormat</code></td><td
						><code>&#123; encoding: 'pcm' | 'ulaw'; sampleRate: number; channels: 1 &#125;</code
						></td
					></tr
				>
				<tr
					><td><code>ConversationStatus</code></td><td
						><code>'disconnected' | 'connecting' | 'connected'</code></td
					></tr
				>
				<tr
					><td><code>ConversationMode</code></td><td
						><code>'disconnected' | 'connecting' | 'ready' | 'listening' | 'speaking'</code></td
					></tr
				>
				<tr
					><td><code>TranscriptMessage</code></td><td
						>Stable id, role, text, <code>isFinal</code>, timestamp, optional event and response
						ids, attachments.</td
					></tr
				>
				<tr
					><td><code>StartConversationOptions</code></td><td
						><code>&#123; signed?: boolean; textOnly?: boolean &#125;</code></td
					></tr
				>
				<tr
					><td><code>DisconnectDetails</code></td><td
						><code>&#123; code: number; reason: string; expected: boolean &#125;</code></td
					></tr
				>
				<tr
					><td><code>ConversationError</code></td><td
						><code>Error</code> with <code>code</code> and optional <code>cause</code>.</td
					></tr
				>
				<tr
					><td><code>ConversationErrorCode</code></td><td
						>Union of the 14 stable failure categories.</td
					></tr
				>
				<tr
					><td><code>ClientToolHandler</code></td><td
						><code>(parameters, call) =&gt; unknown | Promise&lt;unknown&gt;</code></td
					></tr
				>
				<tr
					><td><code>MCPToolApprovalHandler</code></td><td
						><code>(call, context) =&gt; boolean | Promise&lt;boolean&gt;</code></td
					></tr
				>
				<tr
					><td><code>AudioDeviceInfo</code></td><td
						><code>&#123; deviceId, kind, label, groupId &#125;</code></td
					></tr
				>
				<tr
					><td><code>DebugEvent</code></td><td><code>&#123; kind, message, data? &#125;</code></td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		The complete protocol unions, including every server and client event, are exported from
		<code>svelte-elevenlabs/types</code>. They mirror the ConvAI WebSocket protocol and are safe to
		import from Node code.
	</p>

	<h2 id="audio-helpers">Audio helpers</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Exports from svelte-elevenlabs/audio</caption>
			<thead>
				<tr
					><th scope="col">Export</th><th scope="col">Signature</th><th scope="col">Purpose</th></tr
				>
			</thead>
			<tbody>
				<tr
					><td><code>parseAudioFormat</code></td><td
						><code>(format: string) =&gt; AudioFormat</code></td
					><td>Validate and parse a format id.</td></tr
				>
				<tr
					><td><code>resampleLinear</code></td><td
						><code>(samples, sourceRate, targetRate) =&gt; Float32Array</code></td
					><td>Linear sample rate conversion.</td></tr
				>
				<tr
					><td><code>encodePcm16Base64</code></td><td
						><code>(samples: Float32Array) =&gt; string</code></td
					><td>Encode mono float samples for <code>user_audio_chunk</code>.</td></tr
				>
				<tr
					><td><code>decodePcm16</code></td><td><code>(base64: string) =&gt; Float32Array</code></td
					><td>Decode base64 PCM16 little-endian.</td></tr
				>
				<tr
					><td><code>decodeUlaw</code></td><td
						><code>(bytes: Uint8Array) =&gt; Float32Array</code></td
					><td>Decode 8-bit G.711 µ-law.</td></tr
				>
				<tr
					><td><code>decodeAudioChunk</code></td><td
						><code>(base64, format) =&gt; Float32Array</code></td
					><td>Decode with the negotiated format.</td></tr
				>
				<tr
					><td><code>listAudioDevices</code></td><td
						><code>() =&gt; Promise&lt;AudioDeviceInfo[]&gt;</code></td
					><td>Enumerate browser devices.</td></tr
				>
				<tr
					><td><code>AudioManager</code></td><td>Class</td><td
						>Capture, playback, devices, analysers, and cleanup. Use <code
							>AudioManager.isSupported()</code
						> for a capability check.</td
					></tr
				>
				<tr
					><td><code>AudioManagerError</code></td><td>Class</td><td
						>Error with a stable audio error code and optional cause.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		The full list of failure categories, with causes and fixes, lives in
		<a href={resolve('/docs/troubleshooting')}>Troubleshooting</a>.
	</p>
</DocsPage>
