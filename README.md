# svelte-elevenlabs

> **This is an independent community project. Not affiliated with or endorsed by Eleven Labs Inc.**

A production-minded **Svelte 5 library and SvelteKit starter** for **ElevenLabs Conversational AI**. One rune opens a low-latency voice session, exposes reactive call state, streams PCM audio over a WebSocket, and tears down every socket, media track, audio node, and timer when the component leaves the page.

Built for **Bun 1.4+**, **Svelte 5**, **SvelteKit 3**, **strict TypeScript**, and **Tailwind CSS 4**.

- **Rune-first:** `status`, `isSpeaking`, `isListening`, `volume`, `transcripts`, and `error` update directly in your markup.
- **Signed URLs without leaks:** the API key stays in `process.env` on the SvelteKit server; the browser receives only a short-lived URL.
- **Real audio:** AudioWorklet capture, low-pass anti-aliasing, sample-rate conversion, PCM16 little-endian base64, one-clock playback scheduling, and immediate barge-in flushing.
- **Zero-leak cleanup:** `useConversation` registers an `$effect` teardown. `createConversation` is available when you want to own the lifecycle.
- **Ready-made UI:** an analyser-driven `<AudioVisualizer>` and a complete `<ConversationWidget>` ship in the same package.
- **Strict, documented types:** every exported interface and function carries JSDoc for editor IntelliSense.

## 5-line quickstart

```svelte
<script lang="ts">
	import { useConversation } from 'svelte-elevenlabs';
	const conversation = useConversation({ agentId: 'agent_…' });
</script>

<button onclick={() => conversation.startConversation()}>Talk</button>
```

That is the whole component-level setup. `useConversation` must be called during component initialisation so its cleanup effect can register. Use `createConversation` in a store or test and call `destroy()` yourself.

> **Signed URLs are recommended for production.** Pass `{ signed: true }` as the second argument to `startConversation` and provide the server route shown below. Public agent IDs connect directly and are convenient for demos.

## Requirements

| Requirement | Version / note                                                         |
| ----------- | ---------------------------------------------------------------------- |
| Bun         | **1.4 or newer** (the demo uses Bun 1.4.3 and `@sveltejs/adapter-bun`) |
| Svelte      | **5.x**                                                     |
| SvelteKit   | **3.x** for the included demo; the rune itself is Svelte-only          |
| TypeScript  | strict mode; no implicit `any`                                         |
| Browser     | WebSocket, Web Audio, `getUserMedia`, and a secure context             |
| ElevenLabs  | An agent id and, for signed mode, a workspace API key                  |

The microphone requires **HTTPS or localhost**. Browsers block `getUserMedia` in insecure contexts; the library reports this as a clear `insecure-context` error instead of failing silently.

## Install

```sh
# Bun 1.4+
bun add svelte-elevenlabs
```

To run the included showcase locally:

```sh
bun install
cp .env.example .env
# add ELEVENLABS_API_KEY to .env
bun run dev
```

In PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

### SvelteKit configuration

The library is ESM-only and declares Svelte 5 as a peer dependency. No global CSS import is required for the components: their styles are scoped and use themeable CSS variables. If you use the ready-made Tailwind components inside your own Tailwind v4 app, make the package's output discoverable:

```css
/* app.css */
@import 'tailwindcss';
@source '../node_modules/svelte-elevenlabs/dist';
```

## Signed URL server route

Never put `ELEVENLABS_API_KEY` in a `PUBLIC_*` variable, a client component, or a browser request. The included route is [`src/routes/api/signed-url/+server.ts`](src/routes/api/signed-url/+server.ts). Its contract:

```http
GET /api/signed-url?agent_id=agent_…
```

```json
{ "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=…" }
```

The server performs:

```text
Browser ── GET /api/signed-url?agent_id ──► SvelteKit server
                                               │
                                               │ xi-api-key: process.env.ELEVENLABS_API_KEY
                                               ▼
                                  GET https://api.elevenlabs.io
                                      /v1/convai/conversation/get-signed-url
```

The response is marked `Cache-Control: no-store`. The route validates the agent id, maps upstream failures to actionable messages, and never echoes the API key. The client-side rune fetches this same-origin route only when you call:

```ts
await conversation.startConversation('agent_…', { signed: true });
```

You can also pass an already-minted signed URL directly:

```ts
await conversation.startConversation('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=…');
```

### Environment variables

```sh
# .env — server only
ELEVENLABS_API_KEY=your_key_here

# Optional, public: prefills the demo target field
PUBLIC_ELEVENLABS_AGENT_ID=agent_your_id
```

The demo reads `PUBLIC_ELEVENLABS_AGENT_ID` through SvelteKit 3's explicit environment contract in [`src/env.ts`](src/env.ts). The API key is read from `process.env` inside the server route, satisfying Bun's runtime environment and Node deployments alike. The legacy `$env/dynamic/*` modules are deprecated in SvelteKit 3.

> **Deploying?** Restrict `/api/signed-url` to authenticated users or add rate limiting. A public endpoint that mints signed URLs for arbitrary agent ids spends your ElevenLabs quota.

## How it works

```text
┌─────────────────────────────── BROWSER ───────────────────────────────┐
│                                                                       │
│  Svelte 5 component                                                   │
│    │  startConversation(agentId | signedUrl)                          │
│    ▼                                                                  │
│  ConversationController                                       │
│    ├─ status / isSpeaking / isListening / volume / transcripts        │
│    ├─ WebSocket ── wss://api.elevenlabs.io (subprotocol: convai) ─────┼──► ElevenLabs
│    │      ▲ ping/pong · metadata · transcripts · tools                │    Conversational
│    │      └────────────── audio chunks ───────────────────────────────┼──► AI agent
│    │                                                                  │
│    ├─ AudioWorklet capture                                            │
│    │      mic → low-pass → resample → PCM16LE → base64 ───────────────┼──► user_audio_chunk
│    │                                                                  │
│    └─ Playback clock                                                  │
│           base64 → PCM/µ-law → AudioBufferSource → gain → analyser ───┼──► speakers
│                                                                       │
│  $effect teardown → close socket, stop tracks, close contexts         │
└───────────────────────────────────────────────────────────────────────┘
```

For signed mode, the browser first calls the SvelteKit route. That route talks to ElevenLabs with the server key and returns a short-lived `wss://` URL. The browser never sees the key.

Internally the rune:

1. **Prepares audio inside the user gesture** so playback is not suspended by autoplay policy.
2. **Resolves the target** and opens the WebSocket with the `convai` subprotocol (falling back to a bare socket for proxies that reject it).
3. **Sends the initiation payload** and waits for `conversation_initiation_metadata`.
4. **Negotiates formats** and starts microphone capture at the server-requested rate.
5. **Schedules agent audio** on a single playback clock; `AnalyserNode` data drives the visualizer.
6. **Handles keep-alives, edits, tools, queue status, and barge-in**, then cleans up deterministically.

## API reference

### `useConversation(options?)`

Creates a reactive `ConversationController` and registers an `$effect` that destroys it on unmount.

```ts
const conversation = useConversation({
	agentId: 'agent_…',
	signedUrlEndpoint: '/api/signed-url',
	dynamicVariables: { customer_name: 'Ada' },
	debug: false
});
```

| Option                    | Type                                          | Default                   | Purpose                                       |
| ------------------------- | --------------------------------------------- | ------------------------- | --------------------------------------------- |
| `agentId`                 | `string`                                      | —                         | Default public agent id.                      |
| `signedUrl`               | `string`                                      | —                         | Default signed WebSocket URL.                 |
| `signedUrlEndpoint`       | `string`                                      | `'/api/signed-url'`       | Same-origin route used by signed mode.        |
| `origin`                  | `string`                                      | `wss://api.elevenlabs.io` | WebSocket origin for public ids.              |
| `dynamicVariables`        | `Record<string, string \| number \| boolean>` | —                         | Values available to the agent prompt.         |
| `userId`                  | `string`                                      | —                         | Stable end-user id for analytics and memory.  |
| `overrides`               | `ConversationConfigOverride`                  | —                         | Per-session prompt/TTS/ASR overrides.         |
| `onClientToolCall`        | `(call) => string \| object \| Promise<…>`    | —                         | Executes `client_tool_call` requests.         |
| `inputChunkDurationMs`    | `number`                                      | `100`                     | Mic chunk size, clamped to 50–250 ms.         |
| `interruptOnUserSpeech`   | `boolean`                                     | `true`                    | Local VAD flushes playback when you speak.    |
| `vadThreshold`            | `number`                                      | `0.075`                   | Normalized RMS threshold for local VAD.       |
| `maxTranscripts`          | `number`                                      | `250`                     | Maximum retained transcript entries (min 20). |
| `resetTranscriptsOnStart` | `boolean`                                     | `true`                    | Clear the log when a new session starts.      |
| `autoCleanup`             | `boolean`                                     | `true`                    | Register the `$effect` teardown.              |
| `debug`                   | `boolean`                                     | `false`                   | Print redacted protocol diagnostics.          |
| `onStatusChange`          | `(status) => void`                            | —                         | Connection lifecycle callback.                |
| `onTranscript`            | `(message) => void`                           | —                         | Called on transcript create/update.           |
| `onError`                 | `(error: ConversationError) => void`          | —                         | Human-readable error callback.                |
| `onLatency`               | `(ms) => void`                                | —                         | Time-to-first-audio measurement.              |
| `onInterruption`          | `() => void`                                  | —                         | Local or server barge-in.                     |
| `onDisconnect`            | `(details) => void`                           | —                         | WebSocket close details.                      |
| `onConversationId`        | `(id) => void`                                | —                         | Negotiated ElevenLabs conversation id.        |
| `onDebug`                 | `(event: DebugEvent) => void`                 | —                         | Structured, redacted debug events.            |

### `ConversationController`

All fields are Svelte 5 reactive state.

| Member                                   | Type                                                                     | Description                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `status`                                 | `"disconnected" \| "connecting" \| "connected"`                          | Connection lifecycle.                         |
| `isSpeaking`                             | `boolean`                                                                | Agent playback is scheduled or audible.       |
| `isListening`                            | `boolean`                                                                | Microphone is live and the agent can hear it. |
| `isUserSpeaking`                         | `boolean`                                                                | Local VAD currently detects speech.           |
| `isMuted`                                | `boolean`                                                                | Outgoing microphone audio is suppressed.      |
| `volume`                                 | `number`                                                                 | Loudest normalized level, `0..1`.             |
| `inputVolume` / `outputVolume`           | `number`                                                                 | Per-direction normalized levels.              |
| `transcripts`                            | `TranscriptMessage[]`                                                    | Stable live transcript entries.               |
| `error`                                  | `string \| null`                                                         | UI-safe error message.                        |
| `errorCode`                              | `ConversationErrorCode \| null`                                          | Stable error category.                        |
| `latency`                                | `number \| null`                                                         | Latest first-audio latency in ms.             |
| `latencyHistory`                         | `number[]`                                                               | Up to 12 recent measurements.                 |
| `conversationId`                         | `string \| null`                                                         | ElevenLabs conversation id.                   |
| `inputAudioFormat` / `outputAudioFormat` | `AudioFormatId \| null`                                                  | Negotiated formats.                           |
| `queueStatus`                            | `QueueStatus \| null`                                                    | Concurrency queue state.                      |
| `interruptions`                          | `number`                                                                 | Barge-in count for this session.              |
| `messageCount`                           | `number`                                                                 | Derived transcript length.                    |
| `mode`                                   | `"disconnected" \| "connecting" \| "ready" \| "listening" \| "speaking"` | Single status label.                          |
| `canStart`                               | `boolean`                                                                | True when disconnected.                       |

| Method                                      | Description                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startConversation(target?, startOptions?)` | Starts a public agent, signed URL, or configured default. `startOptions.signed` requests a signed URL from the server route. Rejects nothing by design: failures also populate `error`. |
| `stopConversation()`                        | Closes the socket, stops the mic, flushes playback, closes contexts, clears timers, and keeps transcripts.                                                                              |
| `toggleMute()` / `setMuted(muted)`          | Suppresses outgoing chunks without closing the device.                                                                                                                                  |
| `sendContextualUpdate(text)`                | Adds non-interrupting context for the next agent turn.                                                                                                                                  |
| `sendUserMessage(text)`                     | Sends a typed user turn.                                                                                                                                                                |
| `getInputFrequencyData(target?)`            | Reads microphone analyser bins (0–255) for custom visuals.                                                                                                                              |
| `getOutputFrequencyData(target?)`           | Reads agent playback analyser bins.                                                                                                                                                     |
| `clearTranscripts()`                        | Clears the local log only.                                                                                                                                                              |
| `clearError()`                              | Dismisses the current error banner.                                                                                                                                                     |
| `destroy()`                                 | Idempotent teardown. Called automatically by `useConversation`.                                                                                                                         |

### `createConversation(options?)`

The non-rune factory. It returns a controller without registering an `$effect`. Use it in stores, tests, or custom lifecycle code, and call `destroy()` when finished.

### Audio helpers

All helpers are exported and pure unless they take an `AudioManager` instance.

```ts
import {
	AudioManager,
	AudioManagerError,
	encodePcm16Base64,
	decodePcm16,
	decodeUlaw,
	decodeAudioChunk,
	parseAudioFormat,
	resampleLinear
} from 'svelte-elevenlabs';
```

- `parseAudioFormat('pcm_16000')` → `{ encoding: 'pcm', sampleRate: 16000, channels: 1 }`
- `resampleLinear(samples, sourceRate, targetRate)` → new `Float32Array`
- `encodePcm16Base64(samples)` / `decodePcm16(base64)` — exact wire encoding.
- `decodeUlaw(bytes)` / `decodeAudioChunk(base64, format)` — G.711 support.
- `AudioManager` — low-level browser audio graph used by the controller. Create one per session and call `close()` when done.
- `AudioManagerError` — carries a stable `code` such as `permission-denied`, `insecure-context`, `device-busy`, `decode-failed`, or `closed`.

### Components

```svelte
<script lang="ts">
	import { AudioVisualizer, ConversationWidget, useConversation } from 'svelte-elevenlabs';
	const conversation = useConversation({ agentId: 'agent_…' });
</script>

<AudioVisualizer {conversation} height={200} />
<ConversationWidget
	controller={conversation}
	title="Support line"
	signed={true}
	showTelemetry={true}
/>
```

`<AudioVisualizer>` reads real analyser data from the controller and draws a dual **you / agent** spectrum with DPR scaling, ResizeObserver sizing, and a reduced-motion path. It does not synthesize audio levels.

`<ConversationWidget>` is self-contained when given an `agentId`; or pass a `controller` you already created. It includes the target field, public/signed start flow, live status, transcript, mute, telemetry, latency history, and clear/dismiss controls. Theme it through CSS custom properties:

```css
.my-line {
	--se-signal: #ff5d2b;
	--se-agent: #cdf66c;
	--se-panel: #12120f;
	--se-ink: #f1eadb;
	--se-font-display: 'Bricolage Grotesque Variable', sans-serif;
	--se-font-mono: 'Azeret Mono Variable', monospace;
}
```

## Audio and protocol notes

- **Format negotiation is mandatory.** Read `conversation.inputAudioFormat` and `outputAudioFormat`; do not assume 16 kHz. The library supports `pcm_8000` through `pcm_48000` and `ulaw_8000`.
- **Capture** uses an inline AudioWorklet via a revocable Blob URL. If Worklets are blocked, it falls back to a ScriptProcessor. Chunks are low-pass filtered before decimation, linearly resampled in the main thread, and encoded as mono PCM16 little-endian base64.
- **Playback** schedules decoded chunks on one `AudioContext` clock to avoid overlap. Flushing uses a 12 ms exponential gain ramp to prevent clicks.
- **Interruptions** from the local VAD or the server flush queued audio immediately. Chunks with event ids older than the latest interruption are dropped.
- **Keep-alives** are answered as `pong` after the server-requested delay, with timers cleared on teardown.
- **Microphone denial** is mapped to a clear message and an `errorCode` of `permission-denied` (or `insecure-context`). The audio graph is closed; no partial session remains.
- **SSR safety:** the rune's state is server-safe, but `startConversation` refuses to run outside a browser. Use it inside event handlers.
- **Cleanup:** sockets, `MediaStream` tracks, AudioWorklet URLs, analyser nodes, both audio contexts, ping timers, signed-URL aborts, scroll timers, and animation frames are all released.

## Development

```sh
bun install
bun run dev          # showcase at http://localhost:5173
bun run check        # strict TypeScript + Svelte diagnostics
bun run test         # Vitest
bun run build        # adapter-bun app build + package prepack
bun run prepack      # svelte-package + publint
bun run lint         # Prettier + ESLint
bun run format
```

The project uses **SvelteKit 3**, whose Vite configuration lives in `vite.config.ts`. The showcase is deployed with `@sveltejs/adapter-bun`; set `ELEVENLABS_API_KEY` in the Bun process environment for the signed URL route.

### Package layout

```text
src/
  env.ts                          # explicit public demo env (SvelteKit 3)
  lib/
    index.ts                      # public export surface
    types/index.ts                # strict protocol + public API types
    runes/useConversation.svelte.ts
    audio/audioManager.ts
    components/AudioVisualizer.svelte
    components/ConversationWidget.svelte
  routes/
    +page.svelte                  # live signal-console showcase
    api/signed-url/+server.ts     # server-only signed URL exchange
```

## Security checklist

1. Keep `ELEVENLABS_API_KEY` server-side. Never use a `PUBLIC_` prefix for it.
2. Require an authenticated session or rate limiting on `/api/signed-url` in production.
3. Prefer signed URLs for non-public agents.
4. Serve over HTTPS (or localhost) so microphone access is available.
5. The library logs actionable errors to the browser console; it does not log signed URLs, tokens, or transcript text. Your own `onTranscript` callback is opt-in.

## Scope and limitations

This project is community-maintained and not an official ElevenLabs SDK. The wire protocol can change independently; the parser ignores unknown events rather than crashing. Audio runs only in the browser. The included server route is a starter implementation, not a multi-tenant authorization system.

If you need server-side audio processing, telephony, or a managed token broker, add that layer around this client rather than exposing an API key to it.

## License

[MIT](LICENSE) © 2026 svelte-elevenlabs contributors.

---

**This is an independent community project. Not affiliated with or endorsed by Eleven Labs Inc.**
