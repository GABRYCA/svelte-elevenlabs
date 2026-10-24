# svelte-elevenlabs agent guide

This guide is for coding agents that add, review, or repair an ElevenLabs
Conversational AI integration in a Svelte 5 or SvelteKit project. It is
installed by the `svelte-elevenlabs agents` command and is safe to keep under
version control.

Package: `svelte-elevenlabs`
Canonical documentation: https://gabryca.github.io/svelte-elevenlabs/docs
Complete machine reference: https://gabryca.github.io/svelte-elevenlabs/llms-full.txt
Live demo: https://gabryca.github.io/svelte-elevenlabs/demo
Source and issues: https://github.com/GABRYCA/svelte-elevenlabs

## What the package does

`svelte-elevenlabs` is an independent, MIT licensed Svelte 5 library for
ElevenLabs Conversational AI. One controller owns the browser side of a voice
or text session:

- The WebSocket handshake with the Conversational AI endpoint.
- Microphone capture, low-pass filtering, resampling, PCM16 framing, and base64
  transport.
- Agent playback on one audio clock, with immediate barge-in flushing.
- Transcripts, latency, queue state, device controls, client tools, feedback,
  and typed turns.
- Teardown of sockets, media tracks, worklet URLs, timers, and audio contexts.

The package is not an official ElevenLabs SDK. It follows the public
Conversational AI WebSocket protocol and reports failures with stable error
codes.

## Rules that must not be broken

1. Never expose `ELEVENLABS_API_KEY` in a client component, a `PUBLIC_*`
   variable, a route response, a log line, or a static build. Only a server
   route may read `process.env.ELEVENLABS_API_KEY`.
2. Call `useConversation` during component initialisation, directly inside
   `<script>`. Do not call it inside `onMount`, an event handler, a loop, or a
   conditional that can change later. It registers an `$effect` teardown.
3. Call `startConversation` from a user gesture such as a click or tap. Do not
   start a voice session during server-side rendering, module evaluation, or
   page load.
4. Use `createConversation` outside a component and call `destroy()` yourself
   when the owner is disposed. This applies to stores, tests, workers, and
   custom lifecycle code.
5. Use a `.svelte.ts` or `.svelte.js` file when a module needs runes. A plain
   `.ts` module cannot use `$state`, `$derived`, or `$effect`.
6. In a reusable package, keep `$app/*` and `$env/*` imports out of the
   library entry. The `svelte-elevenlabs` package itself follows this rule.
7. Prefer signed URLs for private agents and production traffic. A public agent
   id is acceptable for a demo only.
8. Text only sessions still need a valid agent and an open WebSocket. They skip
   microphone permission and Web Audio setup.
9. Do not invent method names or options. Use the API in this guide or read the
   installed TypeScript declarations before writing code.
10. Keep compatibility with Svelte 5, Node 22.17 or newer, and Bun 1.4 or newer.
    Do not add a dependency when a small local function will do.

## Requirements

| Requirement | Version or note                                                             |
| ----------- | --------------------------------------------------------------------------- |
| Svelte      | 5.x peer dependency                                                         |
| SvelteKit   | Optional, needed for the signed URL route and server rendering              |
| Node        | 22.17 or newer for a server build and package tooling                       |
| Bun         | 1.4 or newer for the included scripts                                       |
| Browser     | WebSocket. Voice also needs Web Audio, `getUserMedia`, and a secure context |
| ElevenLabs  | An agent id. Signed mode also needs a workspace API key                     |

The microphone requires HTTPS or localhost. The controller reports an
`insecure-context` error when the page is not in a secure context.

## Install

```sh
# Bun
bun add svelte-elevenlabs

# npm
npm install svelte-elevenlabs
```

The package is ESM only. The root entry contains Svelte components, so use a
Svelte aware bundler. Node scripts and tests can import the Node safe subpaths:

```ts
import { parseAudioFormat, resampleLinear } from 'svelte-elevenlabs/audio';
import type { AudioFormat, ConversationOptions } from 'svelte-elevenlabs/types';
```

## Minimal voice component

```svelte
<script lang="ts">
	import { useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({
		agentId: 'agent_your_public_id',
		onError: (error) => console.error('[voice]', error.code, error.message)
	});

	function toggle(): void {
		if (conversation.status === 'disconnected') {
			void conversation.startConversation();
			return;
		}

		conversation.stopConversation();
	}
</script>

<button type="button" onclick={toggle} aria-busy={conversation.status === 'connecting'}>
	{conversation.status === 'connected' ? 'End conversation' : 'Start conversation'}
</button>

{#if conversation.error}
	<p role="alert">{conversation.error}</p>
{/if}
```

`startConversation` resolves after metadata negotiation or after a start
failure. Connection and audio failures are published through `error`,
`errorCode`, and `onError` instead of rejecting, so a `void` call is safe.

## Signed URL server route

Create `src/routes/api/signed-url/+server.ts`. Keep the key on the server and
return only the short-lived URL.

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
		return json(
			{ error: { message: 'Add a valid agent_id query parameter.' } },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	const apiKey = process.env.ELEVENLABS_API_KEY?.trim() ?? '';
	if (!apiKey) {
		return json(
			{ error: { message: 'ELEVENLABS_API_KEY is missing on the server.' } },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}

	const upstream = await fetch(
		`${ORIGIN}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
		{
			headers: { accept: 'application/json', 'xi-api-key': apiKey },
			signal: request.signal
		}
	);

	if (!upstream.ok) {
		return json(
			{ error: { message: 'ElevenLabs could not create a signed URL.' } },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	const body: unknown = await upstream.json().catch(() => null);
	const signedUrl =
		typeof body === 'object' && body !== null && 'signed_url' in body ? body.signed_url : null;

	if (typeof signedUrl !== 'string' || !signedUrl.startsWith('wss://')) {
		return json(
			{ error: { message: 'ElevenLabs returned an unexpected payload.' } },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json({ signed_url: signedUrl }, { headers: { 'cache-control': 'no-store' } });
};
```

Then start the session with signed mode:

```ts
await conversation.startConversation('agent_your_private_id', { signed: true });
```

The default endpoint is `/api/signed-url`. Set `signedUrlEndpoint` when your
route lives elsewhere. A signed URL is a credential. Do not log it or send it
to a third party.

For a static build there is no server route. Use a public agent id, or let the
visitor paste a signed URL they already have. Never put the API key in a static
artifact.

## Ready-made UI

```svelte
<script lang="ts">
	import { ConversationWidget, useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({ agentId: 'agent_your_public_id' });
</script>

<ConversationWidget
	controller={conversation}
	title="Support line"
	subtitle="Voice or text"
	signed={false}
/>
```

`ConversationWidget` owns its own controller when `controller` is omitted. When
you pass a controller, the widget mirrors it and shares its state with the rest
of the page. The visualizer is also available on its own:

```svelte
<script lang="ts">
	import { AudioVisualizer, useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({ agentId: 'agent_your_public_id' });
</script>

<AudioVisualizer {conversation} height={212} />
```

The components use scoped styles. In a Tailwind 4 app, add the package output to
the source scan so utility class names are discovered:

```css
@import 'tailwindcss';
@source '../node_modules/svelte-elevenlabs/dist';
```

## Text only sessions

```svelte
<script lang="ts">
	import { useConversation } from 'svelte-elevenlabs';

	const conversation = useConversation({
		agentId: 'agent_your_public_id',
		textOnly: true
	});

	let draft = $state('');

	function send(event: SubmitEvent): void {
		event.preventDefault();
		if (conversation.sendUserMessage(draft)) draft = '';
	}
</script>

<button type="button" onclick={() => conversation.startConversation()}> Open chat </button>

<form onsubmit={send}>
	<input bind:value={draft} aria-label="Message" />
	<button type="submit">Send</button>
</form>
```

A per session override is available when one controller needs both modes:

```ts
await conversation.startConversation('agent_your_public_id', { textOnly: true });
```

## Provider and client tools

Use the provider when several components need the same session. Use
`useConversationClientTool` for a tool that should disappear when its component
unmounts.

```svelte
<!-- OrderTool.svelte -->
<script lang="ts">
	import { useConversationClientTool } from 'svelte-elevenlabs';

	useConversationClientTool('get_order', async ({ orderId }) => {
		return { orderId, status: 'shipped' };
	});
</script>

<span>Order tool ready</span>
```

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { ConversationProvider, ConversationWidget } from 'svelte-elevenlabs';
	import OrderTool from './OrderTool.svelte';
</script>

<ConversationProvider options={{ agentId: 'agent_your_public_id' }}>
	<OrderTool />
	<ConversationWidget />
</ConversationProvider>
```

Tool names must match the tool names configured on the ElevenLabs agent. A
named tool takes precedence over the `onClientToolCall` fallback. The handler
may return a string or a JSON serialisable value.

## Lifecycle and cleanup

`useConversation` registers an `$effect` teardown. It closes the socket, stops
media tracks, disconnects the audio graph, revokes worklet URLs, clears timers,
aborts signed URL requests, and closes both audio contexts.

Use `createConversation` when you own the lifecycle:

```ts
import { createConversation } from 'svelte-elevenlabs';

const conversation = createConversation({ agentId: 'agent_your_public_id' });

try {
	await conversation.startConversation();
} finally {
	conversation.stopConversation();
	conversation.destroy();
}
```

Do not reuse a destroyed controller. Create a new one.

## Controller surface

Read these fields directly in Svelte markup. They are reactive state or derived
values.

| Field               | Meaning                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `status`            | `'disconnected'`, `'connecting'`, or `'connected'`                                           |
| `mode`              | High level mode: `'disconnected'`, `'connecting'`, `'ready'`, `'listening'`, or `'speaking'` |
| `isSpeaking`        | Agent playback is scheduled or audible                                                       |
| `isListening`       | The microphone is live and the agent can hear it                                             |
| `isUserSpeaking`    | Local voice activity detection sees speech                                                   |
| `isMuted`           | Outgoing microphone audio is muted                                                           |
| `isTextOnly`        | The current or next session is text only                                                     |
| `volume`            | Combined input and output level from 0 to 1                                                  |
| `inputVolume`       | Microphone level from 0 to 1                                                                 |
| `outputVolume`      | Agent playback level from 0 to 1                                                             |
| `transcripts`       | Stable streaming transcript entries                                                          |
| `messageCount`      | Number of retained transcript entries                                                        |
| `error`             | Human readable message, safe to render                                                       |
| `errorCode`         | Stable machine readable failure category                                                     |
| `latency`           | Time to first audio in milliseconds, or `null`                                               |
| `latencyHistory`    | Recent first audio measurements                                                              |
| `conversationId`    | ElevenLabs conversation id, or `null`                                                        |
| `inputAudioFormat`  | Negotiated microphone format, or `null`                                                      |
| `outputAudioFormat` | Negotiated agent format, or `null`                                                           |
| `queueStatus`       | Server queue state, or `null`                                                                |
| `interruptions`     | Number of accepted barge-in events                                                           |
| `canSendFeedback`   | A response id is available for feedback                                                      |
| `vadScore`          | Server-side voice activity score                                                             |
| `contextUsage`      | LLM context usage when the server reports it                                                 |
| `outputGain`        | Playback gain from 0 to 1                                                                    |
| `inputDeviceId`     | Selected microphone id, or `null`                                                            |
| `outputDeviceId`    | Selected output device id, or `null`                                                         |

Common methods:

| Method                                               | Purpose                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `startConversation(target?, { signed?, textOnly? })` | Open a session                                                        |
| `stopConversation()`                                 | End a session and keep transcripts                                    |
| `endSession()`                                       | Alias for `stopConversation()`                                        |
| `destroy()`                                          | Release everything and mark the controller unusable                   |
| `toggleMute()`                                       | Toggle outgoing microphone audio                                      |
| `setMuted(muted)`                                    | Set mute explicitly                                                   |
| `setVolume(value)`                                   | Set playback gain from 0 to 1                                         |
| `sendUserMessage(text)`                              | Add a typed user turn on the same socket                              |
| `sendContextualUpdate(text, contextId?)`             | Give the agent context without interrupting speech                    |
| `sendFeedback(like, eventId?)`                       | Submit response feedback                                              |
| `sendUserActivity()`                                 | Tell the agent the user is still active, throttled to once per second |
| `changeInputDevice(id?)`                             | Switch the microphone during a voice session                          |
| `changeOutputDevice(id?)`                            | Route playback to another output device                               |
| `listAudioDevices()`                                 | Read available input and output devices                               |
| `registerClientTool(name, handler)`                  | Register a named tool and receive an unregister function              |
| `sendMCPToolApprovalResult(toolCallId, approved)`    | Answer an MCP approval request manually                               |
| `clearTranscripts()`                                 | Remove transcript entries                                             |
| `clearError()`                                       | Clear the current error message and code                              |

## Options that matter

| Option                     | Default             | Notes                                                            |
| -------------------------- | ------------------- | ---------------------------------------------------------------- |
| `agentId`                  | None                | Default public agent id                                          |
| `signedUrl`                | None                | Default signed WebSocket URL                                     |
| `signedUrlEndpoint`        | `'/api/signed-url'` | Same origin exchange route                                       |
| `serverLocation`           | US origin           | `'eu-residency'`, `'in-residency'`, or `'global'` for public ids |
| `textOnly`                 | `false`             | Skip microphone and audio contexts                               |
| `micMuted`                 | `false`             | Start with microphone muted                                      |
| `outputVolume`             | `1`                 | Initial playback gain                                            |
| `inputChunkDurationMs`     | `100`               | Clamped to 50 to 250                                             |
| `interruptOnUserSpeech`    | `true`              | Flush agent audio when local VAD detects speech                  |
| `vadThreshold`             | `0.075`             | Normalised RMS threshold                                         |
| `maxTranscripts`           | `250`               | Minimum retained value is 20                                     |
| `autoCleanup`              | `true`              | Only used by `useConversation`                                   |
| `debug`                    | `false`             | Protocol logs through `console.debug`                            |
| `clientTools`              | None                | Named client tool handlers                                       |
| `onClientToolCall`         | None                | Fallback handler                                                 |
| `onError`                  | None                | Called with a `ConversationError`                                |
| `onTranscript`             | None                | Called on every transcript change                                |
| `onInterruption`           | None                | Called on server or local barge-in                               |
| `onStatusChange`           | None                | Called when the connection status changes                        |
| `onMCPToolApprovalRequest` | None                | Decide whether an MCP tool may proceed                           |

## Errors

`ConversationError` exposes a stable `code` and a human readable `message`. The
controller also publishes the same values as `errorCode` and `error` and calls
`onError`.

Common codes:

- `not-supported`: the browser or requested transport is not available.
- `insecure-context`: the page is not HTTPS or localhost.
- `permission-denied`: microphone permission was refused.
- `audio-failed`: an audio context, worklet, or playback operation failed.
- `invalid-target`: the agent id or URL is malformed.
- `signed-url-failed`: the server exchange failed.
- `connection-failed`: the socket could not open.
- `connection-timeout`: the handshake did not finish in time.
- `server-closed`: the server closed the socket.
- `protocol-error`: the server sent an event the client could not parse.
- `device-not-found`: the selected device disappeared.
- `device-busy`: the device could not be opened.
- `device-constraints`: the device rejected the requested constraints.
- `device-switch-failed`: a live device switch did not complete.

Render `error` for people. Use `errorCode` for branching and analytics. Never
show a raw signed URL or API key in an error surface.

## Review checklist

Before finishing a change, verify:

- The API key appears only in server code.
- `useConversation` is called during component initialisation.
- The start action runs from a user gesture.
- A voice session has a visible stop action.
- `error` and `status` are rendered with accessible text.
- Buttons have `type="button"` unless they submit a form.
- Status text uses a polite live region.
- Text only mode works without a microphone.
- A custom controller created with `createConversation` is destroyed.
- No `PUBLIC_*` variable contains a secret.
- The Tailwind source path is present when the widget is used in a Tailwind 4 app.
- The build passes `bun run check` and `bun run test` when this is the package repository.

## Documentation map

- Install: https://gabryca.github.io/svelte-elevenlabs/docs/install
- Quickstart: https://gabryca.github.io/svelte-elevenlabs/docs/quickstart
- Sessions: https://gabryca.github.io/svelte-elevenlabs/docs/sessions
- Audio: https://gabryca.github.io/svelte-elevenlabs/docs/audio
- Client tools: https://gabryca.github.io/svelte-elevenlabs/docs/client-tools
- Components: https://gabryca.github.io/svelte-elevenlabs/docs/components
- Signed URLs: https://gabryca.github.io/svelte-elevenlabs/docs/signed-urls
- Agent kit: https://gabryca.github.io/svelte-elevenlabs/docs/agents
- API reference: https://gabryca.github.io/svelte-elevenlabs/docs/reference
- Troubleshooting: https://gabryca.github.io/svelte-elevenlabs/docs/troubleshooting
- Live demo: https://gabryca.github.io/svelte-elevenlabs/demo
- Full machine reference: https://gabryca.github.io/svelte-elevenlabs/llms-full.txt
