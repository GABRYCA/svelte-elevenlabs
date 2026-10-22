<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Install"
	summary="Requirements, package setup, server environment, and the one Tailwind setting the ready-made components need."
	toc={[
		{ id: 'requirements', label: 'Requirements' },
		{ id: 'install-package', label: 'Install the package' },
		{ id: 'environment', label: 'Environment' },
		{ id: 'signed-endpoint', label: 'Signed URL endpoint' },
		{ id: 'tailwind', label: 'Tailwind discovery' },
		{ id: 'verify', label: 'Verify the install' }
	]}
>
	<h2 id="requirements">Requirements</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Supported toolchain</caption>
			<thead>
				<tr><th scope="col">Requirement</th><th scope="col">Version or note</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>node</code></td><td>22.17 or newer for the server build and package tooling</td
					></tr
				>
				<tr><td><code>bun</code></td><td>1.4 or newer for the included scripts</td></tr>
				<tr><td><code>svelte</code></td><td>5.x peer dependency</td></tr>
				<tr
					><td><code>sveltekit</code></td><td
						>Optional. Needed only for the signed URL server route.</td
					></tr
				>
				<tr><td>Browser</td><td>WebSocket, Web Audio, getUserMedia, and a secure context</td></tr>
				<tr><td>ElevenLabs</td><td>An agent id and, for signed mode, a workspace API key</td></tr>
			</tbody>
		</table>
	</div>
	<p>
		The microphone requires <strong>HTTPS or localhost</strong>. Browsers block
		<code>getUserMedia</code> in insecure contexts, and the controller reports that as an
		<code>insecure-context</code> error rather than failing without a message.
	</p>

	<h2 id="install-package">Install the package</h2>
	<CodeBlock lang="sh" code="bun add svelte-elevenlabs" />
	<p>With npm:</p>
	<CodeBlock lang="sh" code="npm install svelte-elevenlabs" />
	<p>
		The package is ESM only and ships its TypeScript declarations. The root entry contains Svelte
		components, so use a Svelte-aware bundler. Node scripts, tests, and server code can import the
		Node-safe subpaths:
	</p>
	<CodeBlock
		lang="ts"
		code={`import { parseAudioFormat, resampleLinear } from 'svelte-elevenlabs/audio';
import type { AudioFormat, ConversationOptions } from 'svelte-elevenlabs/types';`}
	/>
	<p>Published subpaths:</p>
	<ul>
		<li><code>svelte-elevenlabs</code> for the rune, audio engine, types, and components.</li>
		<li>
			<code>svelte-elevenlabs/audio</code> for the framework-agnostic audio manager and helpers.
		</li>
		<li>
			<code>svelte-elevenlabs/types</code> for the public type surface and
			<code>ConversationError</code>.
		</li>
		<li><code>svelte-elevenlabs/package.json</code> for tooling.</li>
	</ul>

	<h2 id="environment">Environment</h2>
	<p>
		Signed mode needs one server-only secret. Public agent ids do not need a key, which is why the
		static showcase can connect without a server. Start from <code>.env.example</code> in this repository:
	</p>
	<CodeBlock
		lang="sh"
		filename=".env"
		code={`# Server only. Never expose this through PUBLIC_*.
ELEVENLABS_API_KEY=your_key_here

# Optional and public. Prefills the showcase target field.
PUBLIC_ELEVENLABS_AGENT_ID=agent_examplePublicId`}
	/>
	<p>
		Bun loads <code>.env</code> directly. The Node <code>start</code> script passes
		<code>--env-file-if-exists=.env</code>, so both runtimes read the same file. In a container or a
		hosting platform, set the values in the process environment instead.
	</p>
	<Callout tone="security" title="Never publish the key">
		<p>
			Do not put <code>ELEVENLABS_API_KEY</code> in a <code>PUBLIC_*</code> variable, a client
			component, a static build, or a browser request. Only the server route reads it from
			<code>process.env</code>.
		</p>
	</Callout>

	<h2 id="signed-endpoint">Signed URL endpoint</h2>
	<p>
		The package defaults <code>signedUrlEndpoint</code> to <code>/api/signed-url</code>. The
		included SvelteKit route implements that contract and validates <code>agent_</code> and
		<code>seng_</code> ids. Read <a href={resolve('/docs/signed-urls')}>Signed URLs</a> for the full route,
		the response shape, and the security checklist.
	</p>
	<p>
		For a quick local start, copy the route from
		<code>src/routes/api/signed-url/+server.ts</code> in this repository, or use a public agent id and
		skip the server exchange entirely.
	</p>

	<h2 id="tailwind">Tailwind discovery</h2>
	<p>
		No global stylesheet is required. The components use scoped styles and themeable CSS variables.
		If you use <code>ConversationWidget</code> or another ready-made component inside a Tailwind v4 app,
		make the package output discoverable so utility classes are generated:
	</p>
	<CodeBlock
		lang="css"
		filename="app.css"
		code={`@import 'tailwindcss';
@source '../node_modules/svelte-elevenlabs/dist';`}
	/>
	<p>
		Scoped component styles do not require this line. It only tells Tailwind where to scan the
		package output for utility class names.
	</p>

	<h2 id="verify">Verify the install</h2>
	<ol class="docs-steps">
		<li>
			<p>
				Import the rune in a component and run your type check. For this repository, that is
				<code>bun run check</code>.
			</p>
		</li>
		<li>
			<p>
				Start the dev server on <code>localhost</code> or an HTTPS origin. Open the page in a browser
				that supports Web Audio.
			</p>
		</li>
		<li>
			<p>
				Start a session from a click. The browser should ask for microphone permission and the
				controller should reach <code>status === 'connected'</code> after metadata negotiation.
			</p>
		</li>
	</ol>
	<p>
		If the connection fails, read <a href={resolve('/docs/troubleshooting')}>Troubleshooting</a>
		before changing the audio code. The controller publishes a stable <code>errorCode</code> for each
		failure category.
	</p>
</DocsPage>
