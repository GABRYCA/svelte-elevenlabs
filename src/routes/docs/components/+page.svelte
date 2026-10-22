<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Components"
	summary="The live spectrum, the complete conversation widget, the provider, and the CSS variables that theme them."
	toc={[
		{ id: 'visualizer', label: 'AudioVisualizer' },
		{ id: 'widget', label: 'ConversationWidget' },
		{ id: 'provider', label: 'ConversationProvider' },
		{ id: 'theme', label: 'Theme variables' },
		{ id: 'tailwind', label: 'Tailwind v4' },
		{ id: 'accessibility', label: 'Accessibility' }
	]}
>
	<h2 id="visualizer">AudioVisualizer</h2>
	<p>
		<code>AudioVisualizer</code> paints the live analyser data from a controller. It never invents levels:
		when no session is active it draws a quiet standby trace, and when a session is live it switches between
		microphone and agent data based on what the controller reports.
	</p>
	<CodeBlock
		filename="Panel.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { AudioVisualizer, useConversation } from 'svelte-elevenlabs';

  const conversation = useConversation({
    agentId: 'agent_your_public_id'
  });
\u003C/script>

<AudioVisualizer
  {conversation}
  height={212}
  label="Live microphone and agent room tone"
/>`}
	/>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>AudioVisualizer props</caption>
			<thead>
				<tr
					><th scope="col">Prop</th><th scope="col">Type</th><th scope="col">Default</th><th
						scope="col">Notes</th
					></tr
				>
			</thead>
			<tbody>
				<tr
					><td><code>conversation</code></td><td><code>ConversationController | null</code></td><td
						><code>null</code></td
					><td>Controller to read. Renders a standby trace when omitted.</td></tr
				>
				<tr
					><td><code>height</code></td><td><code>number</code></td><td><code>176</code></td><td
						>Canvas height in CSS pixels.</td
					></tr
				>
				<tr
					><td><code>showLegend</code></td><td><code>boolean</code></td><td><code>true</code></td
					><td>Show the YOU and AGENT labels.</td></tr
				>
				<tr
					><td><code>label</code></td><td><code>string</code></td><td
						>Live microphone and agent audio spectrum</td
					><td>Accessible label and description source.</td></tr
				>
				<tr
					><td><code>class</code></td><td><code>string</code></td><td><code>''</code></td><td
						>Extra class names on the root element.</td
					></tr
				>
			</tbody>
		</table>
	</div>

	<h2 id="widget">ConversationWidget</h2>
	<p>
		The widget packages the target field, start and stop control, spectrum, transcript, text
		composer, feedback, playback volume, device selectors, and telemetry. Use it as a complete
		surface or turn sections off and build around the parts you keep.
	</p>
	<CodeBlock
		filename="App.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { ConversationWidget, useConversation } from 'svelte-elevenlabs';

  const conversation = useConversation({
    agentId: 'agent_your_public_id'
  });
\u003C/script>

<ConversationWidget
  controller={conversation}
  title="Support line"
  subtitle="Voice or text"
  showTelemetry={false}
/>`}
	/>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>ConversationWidget props</caption>
			<thead>
				<tr
					><th scope="col">Prop</th><th scope="col">Type</th><th scope="col">Default</th><th
						scope="col">Notes</th
					></tr
				>
			</thead>
			<tbody>
				<tr
					><td><code>controller</code></td><td><code>ConversationController</code></td><td>None</td
					><td>Existing controller. When omitted the widget creates and destroys its own.</td></tr
				>
				<tr
					><td><code>agentId</code></td><td><code>string</code></td><td><code>''</code></td><td
						>Initial target shown in the field.</td
					></tr
				>
				<tr
					><td><code>signed</code></td><td><code>boolean</code></td><td><code>false</code></td><td
						>Exchange the target through the signed URL endpoint.</td
					></tr
				>
				<tr
					><td><code>title</code></td><td><code>string</code></td><td>Conversation</td><td
						>Widget heading.</td
					></tr
				>
				<tr
					><td><code>subtitle</code></td><td><code>string</code></td><td
						>ElevenLabs Conversational AI · Svelte 5</td
					><td>Small line under the heading.</td></tr
				>
				<tr
					><td><code>showTargetInput</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					><td>Show the agent id field.</td></tr
				>
				<tr
					><td><code>showVisualizer</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					><td>Show the live spectrum.</td></tr
				>
				<tr
					><td><code>showTranscript</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					><td>Show the transcript log.</td></tr
				>
				<tr
					><td><code>showTelemetry</code></td><td><code>boolean</code></td><td><code>true</code></td
					><td>Show latency, format, and session counters.</td></tr
				>
				<tr
					><td><code>textOnly</code></td><td><code>boolean</code></td><td><code>false</code></td><td
						>Run widget owned sessions without audio. Ignored with <code>controller</code>.</td
					></tr
				>
				<tr
					><td><code>showTextInput</code></td><td><code>boolean</code></td><td><code>true</code></td
					><td>Show the text composer.</td></tr
				>
				<tr
					><td><code>showFeedback</code></td><td><code>boolean</code></td><td><code>true</code></td
					><td>Show response feedback buttons.</td></tr
				>
				<tr
					><td><code>showAudioControls</code></td><td><code>boolean</code></td><td
						><code>true</code></td
					><td>Show playback volume and device controls.</td></tr
				>
				<tr
					><td><code>class</code></td><td><code>string</code></td><td><code>''</code></td><td
						>Extra class names on the root element.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		When you pass an external controller, the widget still owns its own start and stop button but
		uses your controller, so state stays shared with the rest of the page. The <code>textOnly</code> prop
		is ignored in that mode because the controller already owns the mode.
	</p>

	<h2 id="provider">ConversationProvider</h2>
	<p>
		The provider shares one controller through Svelte context. Pass an existing
		<code>conversation</code>, or pass <code>options</code> and let the provider create and destroy
		its own. Descendants can read it with <code>getConversationContext()</code> or register tools
		with
		<code>useConversationClientTool()</code>.
	</p>
	<CodeBlock
		filename="App.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { ConversationProvider, ConversationWidget } from 'svelte-elevenlabs';
\u003C/script>

<ConversationProvider options={{ agentId: 'agent_your_public_id' }}>
  <ConversationWidget />
</ConversationProvider>`}
	/>
	<p>
		The context value is set during initialisation and does not change for the life of the provider.
		Use an external <code>conversation</code> when the controller must outlive the provider or come from
		a store.
	</p>

	<h2 id="theme">Theme variables</h2>
	<p>
		Both components read CSS custom properties. Set them on a wrapping element to theme one
		instance, or on <code>:root</code> to theme every instance.
	</p>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>CSS custom properties</caption>
			<thead>
				<tr
					><th scope="col">Variable</th><th scope="col">Used by</th><th scope="col">Purpose</th></tr
				>
			</thead>
			<tbody>
				<tr><td><code>--se-panel</code></td><td>Widget</td><td>Widget background.</td></tr>
				<tr
					><td><code>--se-panel-raised</code></td><td>Widget</td><td>Raised controls and fields.</td
					></tr
				>
				<tr><td><code>--se-ink</code></td><td>Widget</td><td>Primary text.</td></tr>
				<tr><td><code>--se-muted</code></td><td>Widget</td><td>Secondary text and metadata.</td></tr
				>
				<tr><td><code>--se-line</code></td><td>Widget</td><td>Borders and dividers.</td></tr>
				<tr
					><td><code>--se-signal</code></td><td>Both</td><td
						>Accent color for controls and input data.</td
					></tr
				>
				<tr
					><td><code>--se-agent</code></td><td>Both</td><td>Live state and agent output color.</td
					></tr
				>
				<tr><td><code>--se-font-display</code></td><td>Widget</td><td>Display font stack.</td></tr>
				<tr><td><code>--se-font-mono</code></td><td>Both</td><td>Mono font stack.</td></tr>
				<tr
					><td><code>--se-widget-radius</code></td><td>Widget</td><td
						>Widget corner radius. Defaults to 4px.</td
					></tr
				>
				<tr><td><code>--se-viz-bg</code></td><td>Visualizer</td><td>Canvas background.</td></tr>
				<tr><td><code>--se-viz-border</code></td><td>Visualizer</td><td>Canvas border.</td></tr>
				<tr
					><td><code>--se-viz-ink</code></td><td>Visualizer</td><td>Legend and standby text.</td
					></tr
				>
				<tr
					><td><code>--se-viz-radius</code></td><td>Visualizer</td><td
						>Canvas corner radius. Defaults to 2px.</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<CodeBlock
		lang="css"
		code={`.chat-shell {
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
}`}
	/>

	<h2 id="tailwind">Tailwind v4</h2>
	<p>
		The components use scoped styles. When they render utility class names inside a Tailwind v4 app,
		add the package output to Tailwind's source scanning:
	</p>
	<CodeBlock
		lang="css"
		filename="app.css"
		code={`@import 'tailwindcss';
@source '../node_modules/svelte-elevenlabs/dist';`}
	/>
	<p>
		If you only use the rune and the audio helpers, no Tailwind setting is required. See
		<a href={resolve('/docs/install')}>Install</a> for the package setup.
	</p>

	<h2 id="accessibility">Accessibility</h2>
	<p>
		The visualizer exposes a text description that follows the session state instead of hiding the
		canvas from assistive technology. The widget uses native buttons, inputs, selects, and a
		labelled transcript log, and it respects <code>prefers-reduced-motion</code>. The default
		visualizer label can be replaced when the surrounding page already provides context.
	</p>
	<Callout tone="note" title="Do not rely on color alone">
		<p>
			The widget pairs its live color with text labels. If you build a custom surface, keep a
			visible status string and an accessible error message in addition to any color change.
		</p>
	</Callout>
</DocsPage>
