<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Audio"
	summary="How the library negotiates formats, captures the microphone, schedules playback, routes devices, and exposes analyser data."
	toc={[
		{ id: 'formats', label: 'Negotiated formats' },
		{ id: 'capture', label: 'Capture path' },
		{ id: 'playback', label: 'Playback path' },
		{ id: 'barge-in', label: 'Barge-in' },
		{ id: 'devices', label: 'Devices' },
		{ id: 'analyser', label: 'Analyser data' },
		{ id: 'requirements', label: 'Browser requirements' }
	]}
>
	<h2 id="formats">Negotiated formats</h2>
	<p>
		The server chooses both directions in <code>conversation_initiation_metadata</code>. The
		controller validates the values, stores them on <code>inputAudioFormat</code> and
		<code>outputAudioFormat</code>, and passes them to the audio manager. Never assume 16 kHz.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Supported audio format ids</caption>
			<thead>
				<tr
					><th scope="col">Format</th><th scope="col">Encoding</th><th scope="col">Rate</th><th
						scope="col">Notes</th
					></tr
				>
			</thead>
			<tbody>
				<tr
					><td><code>pcm_8000</code></td><td>PCM16 little-endian</td><td>8 kHz</td><td>Mono.</td
					></tr
				>
				<tr
					><td><code>pcm_16000</code></td><td>PCM16 little-endian</td><td>16 kHz</td><td
						>Common default.</td
					></tr
				>
				<tr
					><td><code>pcm_22050</code></td><td>PCM16 little-endian</td><td>22.05 kHz</td><td
						>Mono.</td
					></tr
				>
				<tr
					><td><code>pcm_24000</code></td><td>PCM16 little-endian</td><td>24 kHz</td><td>Mono.</td
					></tr
				>
				<tr
					><td><code>pcm_44100</code></td><td>PCM16 little-endian</td><td>44.1 kHz</td><td>Mono.</td
					></tr
				>
				<tr
					><td><code>pcm_48000</code></td><td>PCM16 little-endian</td><td>48 kHz</td><td>Mono.</td
					></tr
				>
				<tr
					><td><code>ulaw_8000</code></td><td>G.711 µ-law</td><td>8 kHz</td><td
						>Mono, 8-bit companded.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		If the server negotiates a format the browser cannot handle, the start fails with a
		<code>protocol-error</code> before audio flows. You can validate a value yourself with
		<code>parseAudioFormat(id)</code>.
	</p>

	<h2 id="capture">Capture path</h2>
	<p>
		The default path uses an <code>AudioWorklet</code> and falls back to
		<code>ScriptProcessor</code>
		when a worklet cannot load. Once audio is flowing, each chunk goes through the same chain:
	</p>
	<ol class="docs-steps">
		<li>
			<p>
				Capture roughly 100 milliseconds of microphone audio. The window is controlled by <code
					>inputChunkDurationMs</code
				>.
			</p>
		</li>
		<li><p>Apply a low-pass filter to reduce aliasing before the sample rate change.</p></li>
		<li>
			<p>
				Resample from the browser context rate to the negotiated input rate with linear
				interpolation.
			</p>
		</li>
		<li>
			<p>Clamp the samples, encode signed 16-bit little-endian PCM, and base64 the result.</p>
		</li>
		<li><p>Send the frame as <code>user_audio_chunk</code> over the existing WebSocket.</p></li>
	</ol>
	<p>
		Set <code>inputChunkDurationMs</code> between 50 and 250. Values outside that range are clamped. Smaller
		chunks reduce latency and increase frame rate. The default of 100 is a practical balance for speech.
	</p>
	<p>
		Microphone capture starts muted when <code>micMuted</code> is true. Muting stops frames without stopping
		the track, so the browser permission indicator may stay active for the whole session.
	</p>

	<h2 id="playback">Playback path</h2>
	<p>
		Agent audio arrives as base64 chunks. The audio manager decodes PCM16 or µ-law, schedules
		accepted chunks on one <code>AudioContext</code> clock, and exposes the result through an analyser
		node. Scheduling on one clock avoids the gaps and overlaps that appear when every chunk starts its
		own source at the current time.
	</p>
	<CodeBlock
		lang="ts"
		code={`conversation.setVolume(0.8);      // Linear gain from 0 to 1.
conversation.outputGain;         // Reactive gain value.
conversation.getOutputVolume();  // Latest normalized playback level.`}
	/>
	<p>
		<code>outputVolume</code> controls the initial gain. <code>setVolume</code> clamps values and
		can accept either a number or an object with a <code>volume</code> property. The value is applied
		to the playback gain node immediately.
	</p>

	<h2 id="barge-in">Barge-in</h2>
	<p>Barge-in is handled locally and confirmed by the server. Two signals can flush playback:</p>
	<ul>
		<li>
			<strong>Local voice activity.</strong> When the microphone level crosses
			<code>vadThreshold</code> (default <code>0.075</code>) and
			<code>interruptOnUserSpeech</code> is true, queued audio is flushed with a short gain ramp.
		</li>
		<li>
			<strong>Server interruption.</strong> An <code>interruption</code> event flushes every queued
			source and updates <code>isSpeaking</code>.
		</li>
	</ul>
	<p>
		The controller records one interruption when both signals describe the same barge-in.
		<code>interruptions</code> is the session counter. Set <code>interruptOnUserSpeech: false</code>
		when you want the agent to finish its current response before listening again.
	</p>

	<h2 id="devices">Devices</h2>
	<p>
		Device selection requires an active voice session. Labels are usually hidden until the user
		grants microphone permission, so refresh the list after the first session starts.
	</p>
	<CodeBlock
		lang="ts"
		code={`const devices = await conversation.listAudioDevices();
const microphones = devices.filter((device) => device.kind === 'audioinput');

await conversation.changeInputDevice(microphones[0]?.deviceId);
await conversation.changeOutputDevice('speaker-device-id');`}
	/>
	<p>
		Both switch methods return a boolean. A failed switch restores the previous device and publishes
		a typed error such as <code>device-not-found</code>, <code>device-busy</code>, or
		<code>device-constraints</code>. Output routing depends on <code>setSinkId</code> support in the browser.
	</p>
	<p>
		Passing <code>undefined</code> selects the system default. The chosen ids are available on
		<code>inputDeviceId</code> and <code>outputDeviceId</code>.
	</p>

	<h2 id="analyser">Analyser data</h2>
	<p>
		The audio manager keeps a 512-bin analyser for the microphone and another for agent playback.
		Both are safe to call when no session is active and return zeroed data.
	</p>
	<CodeBlock
		lang="ts"
		code={`const bins = new Uint8Array(512);

function paint(): void {
  conversation.getInputFrequencyData(bins);
  conversation.getOutputFrequencyData(bins);
  // Draw the bytes with canvas, SVG, or CSS.
}`}
	/>
	<p>
		Pass a reusable buffer to avoid allocating on every animation frame. The buffer must hold at
		least 512 entries. <code>getInputByteFrequencyData</code> and
		<code>getOutputByteFrequencyData</code>
		are aliases for the same data. <code>getInputVolume()</code> and <code>getOutputVolume()</code> return
		normalized levels when you only need a meter.
	</p>
	<p>
		<code>AudioVisualizer</code> already handles the animation loop and
		<code>prefers-reduced-motion</code>. Use the raw analyser methods only when you need a custom
		visual.
	</p>

	<h2 id="requirements">Browser requirements</h2>
	<p>
		Voice sessions need a secure context, <code>navigator.mediaDevices.getUserMedia</code>, Web
		Audio, and WebSocket. An <code>AudioWorklet</code> is preferred, with a
		<code>ScriptProcessor</code>
		fallback for older engines.
	</p>
	<Callout tone="warning" title="Text only skips the audio stack">
		<p>
			Text only sessions do not request a microphone or create audio contexts. The negotiated format
			fields may still be present in metadata, but there is no capture or playback graph to control.
		</p>
	</Callout>
	<p>
		If a browser cannot satisfy these requirements, call <code>AudioManager.isSupported()</code>
		before showing a start button, or offer the text only path. See
		<a href={resolve('/docs/troubleshooting')}>Troubleshooting</a> for the error codes that map to each
		failure.
	</p>
</DocsPage>
