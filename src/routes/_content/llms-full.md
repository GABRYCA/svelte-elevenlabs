# svelte-elevenlabs

> An independent, MIT-licensed Svelte 5 library for ElevenLabs Conversational AI. One controller owns the browser side of a live voice or text session: the WebSocket handshake, microphone capture, agent playback, transcripts, client tools, signed URLs, and teardown.

Canonical documentation: {{SITE}}/docs
Package version: {{VERSION}}
License: MIT

## What this package is

`svelte-elevenlabs` connects a Svelte 5 component to an ElevenLabs Conversational AI agent. The package is not an official ElevenLabs SDK. It follows the public Conversational AI WebSocket protocol and reports failures with stable error codes instead of leaving a silent dead line.

The package provides:

- A reactive `ConversationController` with Svelte 5 state and derived values.
- `useConversation` for component owned sessions with an `$effect` teardown.
- `createConversation` for stores, tests, and custom lifecycle code.
- A browser audio pipeline built on Web Audio, AudioWorklet, and PCM16 or G.711 µ-law.
- A same-origin signed URL exchange that keeps the ElevenLabs API key on the server.
- Named client tools, provider scoped tools, MCP approvals, feedback, and typed turns.
- Optional `AudioVisualizer` and `ConversationWidget` components.
- A SvelteKit 3 showcase, documentation site, and static GitHub Pages demo.

The root entry contains Svelte components, so use it with a Svelte-aware bundler. Node scripts, tests, and server code can import the Node-safe subpaths.

## Requirements

| Requirement | Version or note                                                                      |
| ----------- | ------------------------------------------------------------------------------------ |
| Node        | 22.17 or newer for the server build and package tooling                              |
| Bun         | 1.4 or newer for the included scripts                                                |
| Svelte      | 5.x peer dependency                                                                  |
| SvelteKit   | Optional. Needed only for the signed URL server route and the showcase.              |
| TypeScript  | Strict mode recommended. The package ships declarations.                             |
| Browser     | WebSocket. Voice sessions also need Web Audio, `getUserMedia`, and a secure context. |
| ElevenLabs  | An agent id. Signed mode also needs a workspace API key.                             |

Microphone access requires HTTPS or localhost. A browser blocks `getUserMedia` on an insecure origin, and the controller reports an `insecure-context` error.

Voice sessions should start from a user gesture. Text only sessions do not request a microphone or create an audio context.

## Install

```sh
# Bun
bun add svelte-elevenlabs

# npm
npm install svelte-elevenlabs
```

The package is ESM only and declares Svelte 5 as a peer dependency.

Published subpaths:

- `svelte-elevenlabs` for the controller, audio engine, types, and components.
- `svelte-elevenlabs/audio` for the framework-agnostic audio manager and helpers.
- `svelte-elevenlabs/types` for the public type surface and `ConversationError`.
- `svelte-elevenlabs/package.json` for tooling.

Node-safe imports:

```ts
import { parseAudioFormat, resampleLinear } from 'svelte-elevenlabs/audio';
import type { AudioFormat, ConversationOptions } from 'svelte-elevenlabs/types';
```

### Tailwind 4 discovery

The components use scoped styles. When `ConversationWidget` or another ready-made component renders utility class names inside a Tailwind 4 app, add the package output to the source scan:

```css
/* app.css */
@import 'tailwindcss';
@source '../node_modules/svelte-elevenlabs/dist';
```

The controller and audio helpers do not require this setting.

## Environment and signed URLs

Public agent ids connect directly to ElevenLabs. Signed URLs are recommended for private agents and for production traffic where you want control over who can start a conversation.

The API key must stay on the server:

```sh
# .env: server only. Never expose this through PUBLIC_*.
ELEVENLABS_API_KEY=your_key_here

# Optional and public. Prefills the demo target field.
PUBLIC_ELEVENLABS_AGENT_ID=agent_examplePublicId
```

Bun loads `.env` directly. The repository `start` script passes `--env-file-if-exists=.env` so Node reads the same file. In a container or hosting platform, set the values in the process environment instead.

### Signed URL route contract

The controller calls a same-origin route when you pass `signed: true`. The default endpoint is `/api/signed-url`.

```http
GET /api/signed-url?agent_id=agent_...
```

Success response:

```json
{ "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=..." }
```

Error response:

```json
{ "error": { "message": "Human-readable explanation." } }
```

The included route uses these status codes:

| Status | Meaning                                                     |
| ------ | ----------------------------------------------------------- |
| `200`  | Signed URL created.                                         |
| `400`  | Missing or malformed agent id.                              |
| `404`  | ElevenLabs could not find the agent.                        |
| `500`  | `ELEVENLABS_API_KEY` is missing on the server.              |
| `502`  | Upstream rejection, unexpected payload, or network failure. |
| `503`  | ElevenLabs is rate limiting the request.                    |
| `499`  | The client cancelled the request.                           |

Every response sets `Cache-Control: no-store`. The route validates `agent_` and `seng_` ids before it calls ElevenLabs, and it never echoes the API key.

A condensed server route:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ORIGIN = 'https://api.elevenlabs.io';
const AGENT_ID = /^(agent|seng)_[A-Za-z0-9]+$/;

export const prerender = false;

export const GET: RequestHandler = async ({ url, fetch, request, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });

	const agentId = url.searchParams.get('agent_id')?.trim() ?? '';
	if (!AGENT_ID.test(agentId)) {
		return json({ error: { message: 'Invalid agent id.' } }, { status: 400 });
	}

	const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
	if (!apiKey) {
		return json({ error: { message: 'Missing server key.' } }, { status: 500 });
	}

	const upstream = new URL('/v1/convai/conversation/get-signed-url', ORIGIN);
	upstream.searchParams.set('agent_id', agentId);

	const response = await fetch(upstream, {
		headers: { accept: 'application/json', 'xi-api-key': apiKey },
		signal: request.signal
	});

	if (!response.ok) {
		return json({ error: { message: 'Signed URL request failed.' } }, { status: 502 });
	}

	const body: unknown = await response.json();
	const signedUrl =
		typeof body === 'object' && body !== null && 'signed_url' in body ? body.signed_url : null;

	if (typeof signedUrl !== 'string') {
		return json({ error: { message: 'Unexpected upstream response.' } }, { status: 502 });
	}

	return json({ signed_url: signedUrl });
};
```

The repository version is stricter. It maps upstream 401, 403, 404, and 429 responses to clearer client messages, validates the returned URL protocol, and logs failures without logging the key. Use it as the starting point.

### Client usage

```ts
const conversation = useConversation({
	agentId: 'agent_your_public_id',
	signedUrlEndpoint: '/api/signed-url'
});

await conversation.startConversation('agent_your_public_id', { signed: true });
```

An already-minted `wss://` URL skips the exchange:

```ts
await conversation.startConversation('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...');
```

The signed URL request has a 12 second timeout. A failed exchange appears as `signed-url-failed` with a message from your route when one is available.

### Security checklist

- Read `ELEVENLABS_API_KEY` from `process.env` inside the server route only.
- Never use a `PUBLIC_*` name for the key and never import the route into client code.
- Set `Cache-Control: no-store` on success and error responses.
- Validate the agent id shape before calling ElevenLabs.
- Add authentication or rate limiting when the endpoint is public. A route that mints URLs for arbitrary ids can spend your quota.
- Do not log the key, the signed URL, or full request headers.
- Keep the key out of static builds, preview deployments, and issue reports.
- Treat a signed URL as a credential. Anyone who receives one can open the conversation until it expires.

## Quickstart

Call `useConversation` during component initialisation. It creates a controller and registers a teardown effect, so there is no socket or audio graph to close by hand.

```svelte
<script lang="ts">
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
</script>

<button onclick={toggle} disabled={conversation.status === 'connecting'}>
	{conversation.status === 'connected' ? 'End session' : 'Start session'}
</button>

<p>Status: {conversation.status}</p>

{#each conversation.transcripts as message (message.id)}
	<p><strong>{message.role}:</strong> {message.text}</p>
{/each}
```

The promise returned by `startConversation` resolves after the handshake metadata or after a start failure. Connection and audio failures populate `error` and `errorCode` instead of rejecting, so `void conversation.startConversation()` is safe.

## Lifecycle and ownership

Use `useConversation` when a component should own the session:

```ts
const conversation = useConversation({ agentId: 'agent_...' });
```

It must be called synchronously during component initialisation. The `$effect` teardown closes the socket, stops media tracks, disconnects the audio graph, aborts signed URL requests, clears timers, and closes both audio contexts.

Use `createConversation` in stores, tests, or other non-component code:

```ts
import { createConversation } from 'svelte-elevenlabs';

const conversation = createConversation({ agentId: 'agent_...' });

await conversation.startConversation();

// Later, from your own teardown:
conversation.destroy();
```

`destroy()` is idempotent. The controller also stops itself on `pagehide` so a navigation does not leave a socket running.

`stopConversation()` ends the call and keeps the transcript for a post-call view. `endSession()` is an alias.

Do not start a session during server side rendering or module evaluation. The controller state is server safe, but `startConversation` refuses to run outside a browser.

## Sessions

### Start sequence

`startConversation()` prepares the session in a fixed order:

1. Validate the target and read the microphone and signed URL settings.
2. Create the audio graph inside the user gesture. Text only sessions skip this step.
3. Resolve the WebSocket URL. A public id is converted to a ConvAI URL, an existing WebSocket URL is used directly, and signed mode calls your server route.
4. Open the socket, send the initiation frame, and wait for `conversation_initiation_metadata`. The handshake has a 15 second timeout.

A session moves through `disconnected`, `connecting`, and `connected`. Calling start while a session is active is a no-op.

### Text only sessions

Text only sessions use the same socket and protocol without opening a microphone. Set `textOnly` on the controller when the whole page is a chat, or pass it per start call when the same controller needs both modes:

```ts
const conversation = useConversation({ agentId: 'agent_...', textOnly: true });

await conversation.startConversation();

conversation.sendUserMessage('Show my last order.');
conversation.sendContextualUpdate('The customer is on the checkout page.', 'checkout');
conversation.sendUserActivity();
```

A per-start value wins for that session:

```ts
await conversation.startConversation('agent_...', { textOnly: true });
```

Text only sessions still need a browser and an open WebSocket. They skip microphone permission and Web Audio setup.

### Transcripts

Entries have a stable `id`. Partial agent text updates the same entry as it streams, and corrections replace the text in place. Check `isFinal` when you want to style streaming content differently.

The transcript is capped by `maxTranscripts`, which defaults to 250 and is clamped to at least 20. Starting a new session clears the transcript unless `resetTranscriptsOnStart` is `false`.

`clearTranscripts()` clears the local log without touching the server conversation. Agent entries can include `attachments` and a `responseId`. Files are plain objects with `url`, `name`, and an optional `mime_type`.

### Mute and playback

```ts
conversation.toggleMute();
conversation.setMuted(true);
conversation.setVolume(0.8);
conversation.setVolume({ volume: 0.65 });
```

Muting stops outgoing chunks but keeps the microphone track and audio context alive, so unmuting is instant. `setVolume` clamps the value to the 0 to 1 range and updates `outputGain`.

### Barge-in

Two signals can flush playback:

- Local voice activity. When the microphone level crosses `vadThreshold` and `interruptOnUserSpeech` is true, queued audio is flushed with a short gain ramp.
- Server interruption. An `interruption` event flushes every queued source and updates `isSpeaking`.

The controller records one interruption when both signals describe the same barge-in. Set `interruptOnUserSpeech: false` when you want the agent to finish its current response before listening again.

### Feedback and context

```ts
if (conversation.canSendFeedback) {
	conversation.sendFeedback(true);
}

conversation.sendContextualUpdate('The user changed plans.', 'plan');
conversation.sendUserActivity();
```

`sendFeedback(like, eventId?)` defaults to the latest agent response. It returns `false` when feedback is not available or the socket is closed.

`sendContextualUpdate(text, contextId?)` injects context for the next turn without interrupting speech. Reusing a context id replaces older context.

`sendUserActivity()` signals that the user is present. Calls are throttled to one frame per second.

## Audio

### Negotiated formats

The server chooses both directions in `conversation_initiation_metadata`. The controller validates the values, stores them on `inputAudioFormat` and `outputAudioFormat`, and passes them to the audio manager. Never assume 16 kHz.

| Format      | Encoding            | Rate      | Notes                 |
| ----------- | ------------------- | --------- | --------------------- |
| `pcm_8000`  | PCM16 little-endian | 8 kHz     | Mono                  |
| `pcm_16000` | PCM16 little-endian | 16 kHz    | Common default        |
| `pcm_22050` | PCM16 little-endian | 22.05 kHz | Mono                  |
| `pcm_24000` | PCM16 little-endian | 24 kHz    | Mono                  |
| `pcm_44100` | PCM16 little-endian | 44.1 kHz  | Mono                  |
| `pcm_48000` | PCM16 little-endian | 48 kHz    | Mono                  |
| `ulaw_8000` | G.711 µ-law         | 8 kHz     | Mono, 8-bit companded |

If the server negotiates a format the browser cannot handle, the start fails with a `protocol-error` before audio flows. `parseAudioFormat(id)` validates a value.

### Capture path

The default path uses an `AudioWorklet` and falls back to `ScriptProcessor` when a worklet cannot load. Each chunk follows the same chain:

1. Capture roughly 100 milliseconds of microphone audio. The window is controlled by `inputChunkDurationMs`.
2. Apply a low-pass filter to reduce aliasing before the sample rate change.
3. Resample from the browser context rate to the negotiated input rate with linear interpolation.
4. Clamp the samples, encode signed 16-bit little-endian PCM, and base64 the result.
5. Send the frame as `user_audio_chunk` over the existing WebSocket.

Set `inputChunkDurationMs` between 50 and 250. Values outside that range are clamped. Smaller chunks reduce latency and increase frame rate. The default of 100 is a practical balance for speech.

Microphone capture starts muted when `micMuted` is true. Muting stops frames without stopping the track, so the browser permission indicator may stay active for the whole session.

### Playback path

Agent audio arrives as base64 chunks. The audio manager decodes PCM16 or µ-law, schedules accepted chunks on one `AudioContext` clock, and exposes the result through an analyser node. Scheduling on one clock avoids the gaps and overlaps that appear when every chunk starts its own source at the current time.

```ts
conversation.setVolume(0.8); // Linear gain from 0 to 1.
conversation.outputGain; // Reactive gain value.
conversation.getOutputVolume(); // Latest normalized playback level.
```

`outputVolume` controls the initial gain. `setVolume` clamps values and accepts either a number or an object with a `volume` property. The value is applied to the playback gain node immediately.

### Devices

Device selection requires an active voice session. Labels are usually hidden until the user grants microphone permission, so refresh the list after the first session starts.

```ts
const devices = await conversation.listAudioDevices();
const microphones = devices.filter((device) => device.kind === 'audioinput');

await conversation.changeInputDevice(microphones[0]?.deviceId);
await conversation.changeOutputDevice('speaker-device-id');
```

Both switch methods return a boolean. A failed switch restores the previous device and publishes a typed error such as `device-not-found`, `device-busy`, or `device-constraints`. Output routing depends on `setSinkId` support in the browser.

Passing `undefined` selects the system default. The chosen ids are available on `inputDeviceId` and `outputDeviceId`.

### Analyser data

The audio manager keeps a 512-bin analyser for the microphone and another for agent playback. Both are safe to call when no session is active and return zeroed data.

```ts
const bins = new Uint8Array(512);

function paint(): void {
	conversation.getInputFrequencyData(bins);
	conversation.getOutputFrequencyData(bins);
	// Draw the bytes with canvas, SVG, or CSS.
}
```

Pass a reusable buffer to avoid allocating on every animation frame. The buffer must hold at least 512 entries. `getInputByteFrequencyData` and `getOutputByteFrequencyData` are aliases. `getInputVolume()` and `getOutputVolume()` return normalized levels when you only need a meter.

`AudioVisualizer` already handles the animation loop and `prefers-reduced-motion`. Use the analyser methods directly only for a custom visual.

### Browser requirements

Voice sessions need a secure context, `navigator.mediaDevices.getUserMedia`, Web Audio, and WebSocket. An `AudioWorklet` is preferred, with a `ScriptProcessor` fallback for older engines.

Call `AudioManager.isSupported()` before showing a start button, or offer the text only path. In a browser without the required APIs, the controller publishes `not-supported`.

## Client tools and MCP approvals

A client tool is a function the agent can ask your browser to run. The server sends a `client_tool_call` event with a tool name, an argument object, a call id, and an `expects_response` flag. The controller looks up a handler, executes it, converts the return value to a protocol string, and sends a `client_tool_result` when the server is waiting for one.

- Named tools are matched by the key in `clientTools` or by `registerClientTool`.
- The fallback receives every call that has no named handler.
- Unhandled calls still receive an error result and trigger `onUnhandledClientToolCall`.

Return values follow a simple rule: a string is sent unchanged, `undefined` or `null` becomes `Client tool execution successful.`, and every other value is serialized with `JSON.stringify`. A thrown error produces an error result with `error_type: 'external_client'`.

### Named tools

```ts
const conversation = useConversation({
	agentId: 'agent_your_public_id',
	clientTools: {
		get_order: async ({ orderId }) => {
			const id = String(orderId ?? '');
			const order = await fetchOrder(id);
			return { id, status: order.status };
		}
	}
});
```

The first argument is typed as `Record<string, unknown>`, so narrow each field before using it. The second argument is the full `ClientToolCallRequest`, including `tool_call_id` and the raw parameters.

Register a tool later when the handler depends on current component state:

```ts
const remove = conversation.registerClientTool('get_order', async ({ orderId }) => {
	return { orderId, status: 'shipped' };
});

remove();
```

Named tools always win over the fallback handler.

### Provider scoped tools

`useConversationClientTool` registers a named tool on the nearest `ConversationProvider`. The registration follows the component lifecycle and is removed on unmount.

```svelte
<!-- ToolRow.svelte -->
<script lang="ts">
	import { useConversationClientTool } from 'svelte-elevenlabs';

	useConversationClientTool('get_order', async ({ orderId }) => {
		return { orderId, status: 'shipped' };
	});
</script>

<span>Tool ready</span>
```

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { ConversationProvider } from 'svelte-elevenlabs';
	import ToolRow from './ToolRow.svelte';
</script>

<ConversationProvider options={{ agentId: 'agent_your_public_id' }}>
	<ToolRow />
</ConversationProvider>
```

Call the hook during component initialisation, directly in the script block. It reads the provider context, so it must render inside a provider. Use `getConversationContext()` when a component needs the controller itself.

### Fallback handler

```ts
const conversation = useConversation({
	agentId: 'agent_your_public_id',
	onClientToolCall: async (call) => {
		return { tool: call.tool_name, parameters: call.parameters };
	},
	onUnhandledClientToolCall: (call) => {
		console.warn('No handler for', call.tool_name);
	}
});
```

The fallback is useful for a small number of dynamic tools or for a generic proxy to your backend. It does not replace named tools. Keep it fast and avoid returning secrets or large payloads.

### MCP approvals

When an MCP tool call reaches the `awaiting_approval` state, the controller can ask your UI for a decision. The handler must resolve to a boolean. Anything else is treated as a denial and publishes a `protocol-error`.

```ts
const conversation = useConversation({
	agentId: 'agent_your_public_id',
	onMCPToolApprovalRequest: async (call, { signal }) => {
		const approved = await confirmInYourUi(call.tool_name, call.parameters);
		if (signal.aborted) return false;
		return approved;
	}
});
```

The controller sends exactly one `mcp_tool_approval_result` per call. The signal aborts when the session ends or the call leaves the approval state, so a late answer cannot reach the server.

If the decision belongs to a component that is not the controller owner, call `sendMCPToolApprovalResult(toolCallId, approved)` from that component after the user acts. `onMCPToolCall` and `onMCPConnectionStatus` expose the lifecycle updates for your approval UI.

### Agent tools

Server side tool calls are observable but not executed by the browser:

- `onAgentToolRequest` receives the request before the agent tool runs.
- `onAgentToolResponse` receives the completed result.
- `onGuardrailTriggered` reports a guardrail that fired during the turn.

The built-in `end_call` tool is honored automatically. When the agent reports it, the controller stops the session and preserves the transcript.

## Components

### AudioVisualizer

`AudioVisualizer` paints the live analyser data from a controller. It never invents levels. When no session is active it draws a static standby grid and baseline. When a session is live it draws the microphone and agent spectra from their analyser data.

```svelte
<script lang="ts">
	import { AudioVisualizer, useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({
		agentId: 'agent_your_public_id'
	});
</script>

<AudioVisualizer {conversation} height={212} label="Live microphone and agent room tone" />
```

| Prop           | Type                             | Default                                   | Notes                                                    |
| -------------- | -------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `conversation` | `ConversationController \| null` | `null`                                    | Controller to read. Renders the idle state when omitted. |
| `height`       | `number`                         | `176`                                     | Canvas height in CSS pixels.                             |
| `showLegend`   | `boolean`                        | `true`                                    | Show the YOU and AGENT labels.                           |
| `label`        | `string`                         | `Live microphone and agent audio spectra` | Accessible label and description source.                 |
| `class`        | `string`                         | `''`                                      | Extra class names on the root element.                   |

### ConversationWidget

The widget packages the target field, start and stop control, spectra, transcript, text composer, feedback, playback volume, device selectors, and telemetry.

```svelte
<script lang="ts">
	import { ConversationWidget, useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({
		agentId: 'agent_your_public_id'
	});
</script>

<ConversationWidget
	controller={conversation}
	title="Support line"
	subtitle="Voice or text"
	showTelemetry={false}
/>
```

| Prop                | Type                     | Default                                   | Notes                                                                      |
| ------------------- | ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------- |
| `controller`        | `ConversationController` | None                                      | Existing controller. When omitted the widget creates and destroys its own. |
| `agentId`           | `string`                 | `''`                                      | Initial target shown in the field.                                         |
| `signed`            | `boolean`                | `false`                                   | Exchange the target through the signed URL endpoint.                       |
| `title`             | `string`                 | `Conversation`                            | Widget heading.                                                            |
| `subtitle`          | `string`                 | `ElevenLabs Conversational AI · Svelte 5` | Small line under the heading.                                              |
| `showTargetInput`   | `boolean`                | `true`                                    | Show the agent id field.                                                   |
| `showVisualizer`    | `boolean`                | `true`                                    | Show the live spectra.                                                     |
| `showTranscript`    | `boolean`                | `true`                                    | Show the transcript log.                                                   |
| `showTelemetry`     | `boolean`                | `true`                                    | Show latency, format, and session counters.                                |
| `textOnly`          | `boolean`                | `false`                                   | Run widget owned sessions without audio. Ignored with `controller`.        |
| `showTextInput`     | `boolean`                | `true`                                    | Show the text composer.                                                    |
| `showFeedback`      | `boolean`                | `true`                                    | Show response feedback buttons.                                            |
| `showAudioControls` | `boolean`                | `true`                                    | Show playback volume and device controls.                                  |
| `class`             | `string`                 | `''`                                      | Extra class names on the root element.                                     |

When you pass an external controller, the widget still owns its start and stop button but uses your controller, so state stays shared with the rest of the page. The `textOnly` prop is ignored in that mode because the controller already owns the mode.

### ConversationProvider

The provider shares one controller through Svelte context. Pass an existing `conversation`, or pass `options` and let the provider create and destroy its own. Descendants can read it with `getConversationContext()` or register tools with `useConversationClientTool()`.

```svelte
<script lang="ts">
	import { ConversationProvider, ConversationWidget } from 'svelte-elevenlabs';
</script>

<ConversationProvider options={{ agentId: 'agent_your_public_id' }}>
	<ConversationWidget />
</ConversationProvider>
```

The context value is set during initialisation and does not change for the life of the provider. Use an external `conversation` when the controller must outlive the provider or come from a store.

### Theme variables

Both components read CSS custom properties. Set them on a wrapping element to theme one instance, or on `:root` to theme every instance.

| Variable             | Used by    | Purpose                                   |
| -------------------- | ---------- | ----------------------------------------- |
| `--se-panel`         | Widget     | Widget background.                        |
| `--se-panel-raised`  | Widget     | Raised controls and fields.               |
| `--se-ink`           | Widget     | Primary text.                             |
| `--se-muted`         | Widget     | Secondary text and metadata.              |
| `--se-line`          | Widget     | Borders and dividers.                     |
| `--se-signal`        | Both       | Accent color for controls and input data. |
| `--se-agent`         | Both       | Live state and agent output color.        |
| `--se-font-display`  | Widget     | Display font stack.                       |
| `--se-font-mono`     | Both       | Mono font stack.                          |
| `--se-widget-radius` | Widget     | Widget corner radius. Defaults to 4px.    |
| `--se-viz-bg`        | Visualizer | Canvas background.                        |
| `--se-viz-border`    | Visualizer | Canvas border.                            |
| `--se-viz-ink`       | Visualizer | Legend and standby text.                  |
| `--se-viz-radius`    | Visualizer | Canvas corner radius. Defaults to 2px.    |

```css
.chat-shell {
	--se-panel: #101014;
	--se-panel-raised: #191920;
	--se-ink: #f5f1e8;
	--se-muted: rgba(245, 241, 232, 0.6);
	--se-line: rgba(245, 241, 232, 0.16);
	--se-signal: #ff6a3d;
	--se-agent: #c8ff76;
	--se-font-display: 'Bricolage Grotesque Variable', sans-serif;
	--se-font-mono: 'Azeret Mono Variable', monospace;
	--se-widget-radius: 0;
	--se-viz-bg: #0a0a0c;
}
```

### Accessibility

The visualizer exposes a text description on its figure that follows the session state, while the canvas is hidden from assistive technology. The widget uses native buttons, inputs, selects, and a labelled transcript log, and it respects `prefers-reduced-motion`. The default visualizer label can be replaced when the surrounding page already provides context.

The widget pairs its live color with text labels. A custom surface should keep a visible status string and an accessible error message in addition to any color change.

## API reference

### Entry points

| Export                                     | Kind       | Purpose                                                                     |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------------- |
| `useConversation(options?)`                | Controller | Creates a controller and registers an `$effect` teardown.                   |
| `createConversation(options?)`             | Function   | Creates a controller without a lifecycle effect. Call `destroy()` yourself. |
| `ConversationController`                   | Class      | The reactive controller. Accepts the same options as the factory functions. |
| `ConversationProvider`                     | Component  | Shares a controller through Svelte context.                                 |
| `getConversationContext()`                 | Function   | Reads the controller from the nearest provider.                             |
| `setConversationContext(controller)`       | Function   | Supplies a controller to a component subtree.                               |
| `useConversationClientTool(name, handler)` | Controller | Registers a component scoped tool on the provider controller.               |
| `AudioManager`                             | Class      | Framework-agnostic capture, playback, and device engine.                    |
| `AudioVisualizer`                          | Component  | Canvas view of the live spectra.                                            |
| `ConversationWidget`                       | Component  | Complete conversation surface.                                              |

### Options

Every field is optional. The same object is accepted by `useConversation`, `createConversation`, the `ConversationController` constructor, and `ConversationProvider`.

| Option                    | Type                                                   | Default                          |
| ------------------------- | ------------------------------------------------------ | -------------------------------- |
| `agentId`                 | `string`                                               | None                             |
| `signedUrl`               | `string`                                               | None                             |
| `signedUrlEndpoint`       | `string`                                               | `'/api/signed-url'`              |
| `origin`                  | `string`                                               | Origin for `serverLocation`      |
| `serverLocation`          | `'us' \| 'eu-residency' \| 'in-residency' \| 'global'` | `'us'`                           |
| `connectionType`          | `'websocket' \| 'webrtc'`                              | `'websocket'`                    |
| `textOnly`                | `boolean`                                              | `false`                          |
| `dynamicVariables`        | `Record<string, string \| number \| boolean>`          | None                             |
| `userId`                  | `string`                                               | None                             |
| `overrides`               | `ConversationConfigOverride`                           | None                             |
| `clientTools`             | `Record<string, ClientToolHandler>`                    | None                             |
| `onClientToolCall`        | `(call) => string \| object \| array \| Promise`       | None                             |
| `inputDeviceId`           | `string`                                               | System default                   |
| `outputDeviceId`          | `string`                                               | System default                   |
| `micMuted`                | `boolean`                                              | `false`                          |
| `outputVolume`            | `number`                                               | `1`                              |
| `inputChunkDurationMs`    | `number`                                               | `100`, clamped to 50 through 250 |
| `interruptOnUserSpeech`   | `boolean`                                              | `true`                           |
| `vadThreshold`            | `number`                                               | `0.075`                          |
| `maxTranscripts`          | `number`                                               | `250`, minimum 20                |
| `resetTranscriptsOnStart` | `boolean`                                              | `true`                           |
| `autoCleanup`             | `boolean`                                              | `true` for `useConversation`     |
| `debug`                   | `boolean`                                              | `false`                          |

Server location origins:

| Location       | Origin                                 |
| -------------- | -------------------------------------- |
| `us`           | `wss://api.elevenlabs.io`              |
| `global`       | `wss://api.elevenlabs.io`              |
| `eu-residency` | `wss://api.eu.residency.elevenlabs.io` |
| `in-residency` | `wss://api.in.residency.elevenlabs.io` |

An explicit `origin` takes precedence. `connectionType` currently supports WebSocket only.

### Controller state

These fields are Svelte state or derived values. `isTextOnly` is a getter. Treat them as read only from your component and change state through the methods below.

| Field               | Type                                                     |
| ------------------- | -------------------------------------------------------- |
| `status`            | `ConversationStatus`                                     |
| `mode`              | `ConversationMode`                                       |
| `canStart`          | `boolean`                                                |
| `isSpeaking`        | `boolean`                                                |
| `isListening`       | `boolean`                                                |
| `isUserSpeaking`    | `boolean`                                                |
| `isMuted`           | `boolean`                                                |
| `isTextOnly`        | `boolean` (getter)                                       |
| `volume`            | `number`                                                 |
| `inputVolume`       | `number`                                                 |
| `outputVolume`      | `number`                                                 |
| `transcripts`       | `TranscriptMessage[]`                                    |
| `messageCount`      | `number`                                                 |
| `message`           | `TranscriptMessage \| null`                              |
| `error`             | `string \| null`                                         |
| `errorCode`         | `ConversationErrorCode \| null`                          |
| `latency`           | `number \| null`                                         |
| `latencyHistory`    | `number[]`                                               |
| `conversationId`    | `string \| null`                                         |
| `inputAudioFormat`  | `AudioFormatId \| null`                                  |
| `outputAudioFormat` | `AudioFormatId \| null`                                  |
| `queueStatus`       | `QueueStatus \| null`                                    |
| `interruptions`     | `number`                                                 |
| `canSendFeedback`   | `boolean`                                                |
| `vadScore`          | `number`                                                 |
| `contextUsage`      | `ContextUsageServerEvent['context_usage_event'] \| null` |
| `outputGain`        | `number`                                                 |
| `inputDeviceId`     | `string \| null`                                         |
| `outputDeviceId`    | `string \| null`                                         |

`latencyHistory` keeps the 12 most recent measurements, oldest first. `interruptions` is deduplicated within one second.

### Methods

| Method                                            | Returns                      | Notes                                                                                                                          |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `startConversation(target?, options?)`            | `Promise<void>`              | Opens the session. Connection and audio failures populate `error`. The target can be an agent id, a WebSocket URL, or omitted. |
| `stopConversation()`                              | `void`                       | Ends the session and preserves the transcript.                                                                                 |
| `endSession()`                                    | `void`                       | Alias for `stopConversation()`.                                                                                                |
| `toggleMute()`                                    | `void`                       | Flips the outgoing mute state.                                                                                                 |
| `setMuted(muted)`                                 | `void`                       | Sets the outgoing mute state explicitly.                                                                                       |
| `setVolume(volume)`                               | `void`                       | Accepts a number or `{ volume: number }`. Clamps to 0 through 1.                                                               |
| `getInputVolume()`                                | `number`                     | Latest normalized microphone level.                                                                                            |
| `getOutputVolume()`                               | `number`                     | Latest normalized playback level.                                                                                              |
| `getInputFrequencyData(target?)`                  | `Uint8Array`                 | 512 bins. Reuse a buffer for animation frames.                                                                                 |
| `getOutputFrequencyData(target?)`                 | `Uint8Array`                 | 512 bins from agent playback.                                                                                                  |
| `getInputByteFrequencyData(target?)`              | `Uint8Array`                 | Alias for `getInputFrequencyData`.                                                                                             |
| `getOutputByteFrequencyData(target?)`             | `Uint8Array`                 | Alias for `getOutputFrequencyData`.                                                                                            |
| `getId()`                                         | `string \| null`             | Current conversation id.                                                                                                       |
| `sendFeedback(like, eventId?)`                    | `boolean`                    | Defaults to the latest agent response. Requires `canSendFeedback`.                                                             |
| `sendUserActivity()`                              | `boolean`                    | Throttled to one frame per second.                                                                                             |
| `sendMCPToolApprovalResult(toolCallId, approved)` | `boolean`                    | Manual approval path. Sends at most one result per call.                                                                       |
| `registerClientTool(name, handler)`               | `() => void`                 | Returns an unregister function.                                                                                                |
| `changeInputDevice(deviceId?)`                    | `Promise<boolean>`           | Requires an active voice session.                                                                                              |
| `changeOutputDevice(deviceId?)`                   | `Promise<boolean>`           | Requires an active voice session and browser output routing.                                                                   |
| `listAudioDevices()`                              | `Promise<AudioDeviceInfo[]>` | Wraps `enumerateDevices`.                                                                                                      |
| `sendContextualUpdate(text, contextId?)`          | `boolean`                    | Non-interrupting context for the next turn.                                                                                    |
| `sendUserMessage(text)`                           | `boolean`                    | Typed user turn over the same socket.                                                                                          |
| `clearTranscripts()`                              | `void`                       | Local only. Does not affect the server conversation.                                                                           |
| `clearError()`                                    | `void`                       | Clears `error` and `errorCode`.                                                                                                |
| `destroy()`                                       | `void`                       | Releases resources. Idempotent.                                                                                                |

### Callbacks

Session and media callbacks:

| Option                    | Payload                          | When                                          |
| ------------------------- | -------------------------------- | --------------------------------------------- |
| `onStatusChange`          | `ConversationStatus`             | Connection state changes.                     |
| `onConnect`               | `{ conversationId: string }`     | Metadata negotiation completes.               |
| `onDisconnect`            | `DisconnectDetails`              | The socket closes, including a client stop.   |
| `onModeChange`            | `ConversationMode`               | The derived mode label changes.               |
| `onTranscript`            | `TranscriptMessage`              | An entry is created or updated.               |
| `onMessage`               | `TranscriptMessage`              | Alias for `onTranscript`.                     |
| `onError`                 | `ConversationError`              | A failure is published.                       |
| `onLatency`               | `number`                         | A time-to-first-audio measurement lands.      |
| `onInterruption`          | None                             | Local or server barge-in is counted.          |
| `onCanSendFeedbackChange` | `boolean`                        | Feedback availability changes.                |
| `onVadScore`              | `number`                         | The server reports a voice activity score.    |
| `onAudio`                 | `string`                         | An agent audio chunk arrives before playback. |
| `onAudioAlignment`        | `AudioAlignment`                 | A chunk includes character timing.            |
| `onPing`                  | `{ event_id, ping_ms? }`         | A keep-alive arrives. The reply is automatic. |
| `onConversationMetadata`  | `ConversationInitiationMetadata` | The initiation metadata arrives.              |
| `onConversationId`        | `string`                         | The conversation id becomes available.        |

Protocol and tool callbacks:

| Option                      | Payload                         | When                                       |
| --------------------------- | ------------------------------- | ------------------------------------------ |
| `onAgentChatResponsePart`   | Streaming part                  | A start, delta, or stop part arrives.      |
| `onAgentResponseCorrection` | Correction payload              | The server corrects a response.            |
| `onAgentResponseComplete`   | `number`                        | An agent response finishes.                |
| `onAgentResponseMetadata`   | Metadata payload                | Per-response metadata arrives.             |
| `onContextUsage`            | Context usage                   | The LLM context window is reported.        |
| `onMCPToolCall`             | MCP call                        | An MCP call changes state.                 |
| `onMCPConnectionStatus`     | Integration status              | MCP connection state changes.              |
| `onMCPToolApprovalRequest`  | `(call, { signal }) => boolean` | A call needs approval.                     |
| `onAgentToolRequest`        | Agent tool request              | The agent starts a server side tool.       |
| `onAgentToolResponse`       | Tool response                   | An agent tool finishes.                    |
| `onGuardrailTriggered`      | Guardrail event                 | A guardrail fires.                         |
| `onUnhandledClientToolCall` | Client call                     | No named or fallback handler exists.       |
| `onIncomingEvent`           | `ServerEvent`                   | Every parsed server event.                 |
| `onOutgoingEvent`           | `ClientEvent`                   | Every sent client frame.                   |
| `onDebug`                   | `DebugEvent`                    | Structured diagnostics when `debug` is on. |

### Types

| Type                       | Shape                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `AudioFormat`              | `{ encoding: 'pcm' \| 'ulaw'; sampleRate: number; channels: 1 }`                           |
| `ConversationStatus`       | `'disconnected' \| 'connecting' \| 'connected'`                                            |
| `ConversationMode`         | `'disconnected' \| 'connecting' \| 'ready' \| 'listening' \| 'speaking'`                   |
| `TranscriptMessage`        | Stable id, role, text, `isFinal`, timestamp, optional event and response ids, attachments. |
| `StartConversationOptions` | `{ signed?: boolean; textOnly?: boolean }`                                                 |
| `DisconnectDetails`        | `{ code: number; reason: string; expected: boolean }`                                      |
| `ConversationError`        | `Error` with `code` and optional `cause`.                                                  |
| `ConversationErrorCode`    | Union of the 14 stable failure categories.                                                 |
| `ClientToolHandler`        | `(parameters, call) => unknown \| Promise<unknown>`                                        |
| `MCPToolApprovalHandler`   | `(call, context) => boolean \| Promise<boolean>`                                           |
| `AudioDeviceInfo`          | `{ deviceId, kind, label, groupId }`                                                       |
| `DebugEvent`               | `{ kind, message, data? }`                                                                 |

The complete protocol unions, including every server and client event, are exported from `svelte-elevenlabs/types`. They mirror the ConvAI WebSocket protocol and are safe to import from Node code.

### Audio helpers

| Export              | Signature                                           | Purpose                                                                                                      |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `parseAudioFormat`  | `(format: string) => AudioFormat`                   | Validate and parse a format id.                                                                              |
| `resampleLinear`    | `(samples, sourceRate, targetRate) => Float32Array` | Linear sample rate conversion.                                                                               |
| `encodePcm16Base64` | `(samples: Float32Array) => string`                 | Encode mono float samples for `user_audio_chunk`.                                                            |
| `decodePcm16`       | `(base64: string) => Float32Array`                  | Decode base64 PCM16 little-endian.                                                                           |
| `decodeUlaw`        | `(bytes: Uint8Array) => Float32Array`               | Decode 8-bit G.711 µ-law.                                                                                    |
| `decodeAudioChunk`  | `(base64, format) => Float32Array`                  | Decode with the negotiated format.                                                                           |
| `listAudioDevices`  | `() => Promise<AudioDeviceInfo[]>`                  | Enumerate browser devices.                                                                                   |
| `AudioManager`      | Class                                               | Capture, playback, devices, analysers, and cleanup. Use `AudioManager.isSupported()` for a capability check. |
| `AudioManagerError` | Class                                               | Error with a stable audio error code and optional cause.                                                     |

## Error codes and troubleshooting

The controller publishes a human-readable `error` and a stable `errorCode`. Branch on the code, show the message, and use this table to find the likely cause.

| Code                   | Likely cause                                                                | What to check                                                                    |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `not-supported`        | Missing browser API, text only misuse, or a destroyed controller.           | Check `AudioManager.isSupported()` and whether the target is a voice session.    |
| `insecure-context`     | The page is not on HTTPS or localhost.                                      | Serve the app from a secure origin.                                              |
| `permission-denied`    | The user or browser blocked the microphone.                                 | Check site permissions and any iframe `allow` policy.                            |
| `audio-failed`         | The audio graph could not be created or read.                               | Check Web Audio support, output devices, and the console.                        |
| `invalid-target`       | The target is not an agent id or a supported conversation URL.              | Use an `agent_` or `seng_` id, or a full WebSocket URL.                          |
| `signed-url-failed`    | The server route failed, timed out, or returned an unexpected payload.      | Check the route, the server key, and the network response.                       |
| `connection-failed`    | The socket could not open or the handshake failed.                          | Check the network, agent id, signed URL, and browser console.                    |
| `connection-timeout`   | No metadata arrived within 15 seconds.                                      | Check the agent configuration and whether the network blocks WebSocket upgrades. |
| `server-closed`        | The server closed the socket or the wait queue expired.                     | Read the close reason, then retry or check agent capacity.                       |
| `protocol-error`       | An event, approval result, or negotiated format did not match expectations. | Enable `debug` and inspect the event type.                                       |
| `device-not-found`     | The selected device disappeared.                                            | Refresh `listAudioDevices()` and fall back to the default.                       |
| `device-busy`          | Another app holds the microphone.                                           | Close the other app or choose a different input.                                 |
| `device-constraints`   | The requested device cannot satisfy the audio constraints.                  | Use the default device or relax the constraints.                                 |
| `device-switch-failed` | A live input or output switch failed.                                       | The previous device is restored. Check whether output routing is supported.      |

### Connection checklist

- `invalid-target`: public ids start with `agent_` or `seng_`. A full URL can use `ws://` or `wss://`. `http://` and `https://` URLs are normalized to the matching WebSocket scheme.
- `signed-url-failed`: open the route directly with the same agent id. A missing `ELEVENLABS_API_KEY` returns HTTP 500. A rejected key returns a 502 with a message about the workspace. A 404 means the agent was not found.
- `connection-failed`: check the browser network panel for the WebSocket upgrade. Proxies and content security policies can block `wss://`.
- `connection-timeout`: the socket opened but no metadata arrived in 15 seconds. Check that the agent exists and is not paused.
- `queueStatus === 'waiting'`: the agent is at its concurrency limit. A `timed_out` state also publishes `server-closed`.

### Lifecycle checklist

- `useConversation` outside initialisation: call it synchronously in a component script. In a store, test, or async function, use `createConversation`.
- Context missing: `getConversationContext` and `useConversationClientTool` require a `ConversationProvider` ancestor.
- Leaked sessions in tests: call `destroy()` when a manually created controller is no longer needed. It is idempotent.
- SSR surprises: importing the package is safe, but starting a session during SSR is not. Start from a browser event and read browser APIs only after mount.

### Diagnostics

```ts
const conversation = useConversation({
	agentId: 'agent_your_public_id',
	debug: true,
	onDebug: (event) => console.log(event.kind, event.message, event.data),
	onIncomingEvent: (event) => console.log('in', event.type),
	onOutgoingEvent: (event) => console.log('out', event.type)
});
```

The debug stream omits transcript text and credentials. The raw event callbacks do include protocol payloads, so remove them before shipping or route them to a safe development logger.

Do not paste API keys, signed URLs, private agent ids, or transcript content into an issue.

## Hosting

### Node or Bun server

The default application build uses `@sveltejs/adapter-node` and runs on Node 22.17 or newer, or Bun 1.4 or newer. This is the mode that can keep `ELEVENLABS_API_KEY` on the server and exchange it for signed URLs.

```sh
bun install
cp .env.example .env
# add ELEVENLABS_API_KEY and PUBLIC_ELEVENLABS_AGENT_ID
bun run dev
```

Production build and start:

```sh
bun run build
bun run start
```

The default port is 3000. Set `PORT` to change it. The same build runs with Node:

```sh
npm run build
npm start
```

For a dedicated Bun server bundle:

```sh
bun run build:bun
bun run start:bun
```

### Static GitHub Pages

A static host has no server runtime, so it cannot mint signed URLs. Build with `PUBLIC_HOSTING_MODE=static` to hide and disable signed mode:

```sh
PUBLIC_ELEVENLABS_AGENT_ID=agent_examplePublicId bun run build:pages
```

The static output is written to `build`. Set `PAGES_BASE_PATH` for a GitHub project site, for example `/svelte-elevenlabs`, so links and assets resolve under the repository path. The same build also works at a domain root when the value is empty.

The static build must never include `/api/signed-url` or the API key. Visitors use a public agent id or paste a signed URL they already have.

### Environment variables

```sh
# Server only
ELEVENLABS_API_KEY=your_key_here

# Optional and public: prefills the demo target field
PUBLIC_ELEVENLABS_AGENT_ID=agent_examplePublicId

# Static build only. build:pages sets this automatically.
PUBLIC_HOSTING_MODE=static

# Static build only. GitHub project sites use /<repository>.
PAGES_BASE_PATH=/svelte-elevenlabs
```

The showcase reads public values through SvelteKit 3's explicit environment contract in `src/env.ts` and `$app/env/public`. The API key is read from `process.env` only inside the server route.

## Guidance for coding agents

- Use Svelte 5 runes and the package's reactive values directly in markup. Do not wrap controller state in stores.
- Call `useConversation` synchronously during component initialisation. Use `createConversation` when you own the lifecycle.
- Start voice sessions from a user gesture. Do not start during SSR or module evaluation.
- Keep `ELEVENLABS_API_KEY` on the server. Never use a `PUBLIC_*` name and never send it to the browser.
- Prefer signed URLs for private agents and production traffic.
- Do not assume a 16 kHz audio format. Read `inputAudioFormat` and `outputAudioFormat`.
- Branch on `errorCode`, show `error`, and keep a visible status string next to any color change.
- Call `destroy()` for manually created controllers. It is idempotent.
- Use the Node-safe subpaths for server code and tests.
- Add authentication or rate limiting to a public signed URL route.

## Documentation endpoints

- `{{SITE}}/llms.txt`: this index.
- `{{SITE}}/llms-full.txt`: the complete reference in one Markdown file.
- `{{SITE}}/docs/llms.txt`: the docs scoped alias of this index.
- `{{SITE}}/docs`: the human documentation site.
- `{{SITE}}/docs/reference`: the human API reference.
- `{{SITE}}/docs/troubleshooting`: the human troubleshooting guide.

The package version in this document is {{VERSION}}. The source of truth for public behavior is the exported TypeScript surface and the pages listed above.
