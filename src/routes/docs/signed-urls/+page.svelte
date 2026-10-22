<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Signed URLs"
	summary="Keep the ElevenLabs API key on your server and hand the browser a short-lived WebSocket URL instead."
	toc={[
		{ id: 'why', label: 'Why signed URLs' },
		{ id: 'contract', label: 'Route contract' },
		{ id: 'server-route', label: 'Server route' },
		{ id: 'client', label: 'Client usage' },
		{ id: 'security', label: 'Security checklist' },
		{ id: 'static', label: 'Static hosting' }
	]}
>
	<h2 id="why">Why signed URLs</h2>
	<p>
		A public agent id can open a socket directly from the browser. That is convenient for demos and
		openly shareable agents, but it is not a good fit for a private agent or for production traffic
		where you want control over who can start a conversation.
	</p>
	<p>
		A signed URL is minted on your server with the workspace API key and expires quickly. The
		browser receives only the URL. The key never enters the bundle, the HTML, the WebSocket
		handshake, or the network tab.
	</p>

	<h2 id="contract">Route contract</h2>
	<p>
		The controller calls a same-origin route when you pass <code>signed: true</code>. The default
		endpoint is <code>/api/signed-url</code>.
	</p>
	<CodeBlock lang="http" code="GET /api/signed-url?agent_id=agent_..." />
	<p>Success response:</p>
	<CodeBlock
		lang="json"
		code={`{ "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=..." }`}
	/>
	<p>Error response:</p>
	<CodeBlock lang="json" code={`{ "error": { "message": "Human-readable explanation." } }`} />
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Status codes used by the included route</caption>
			<thead>
				<tr><th scope="col">Status</th><th scope="col">Meaning</th></tr>
			</thead>
			<tbody>
				<tr><td><code>200</code></td><td>Signed URL created.</td></tr>
				<tr><td><code>400</code></td><td>Missing or malformed agent id.</td></tr>
				<tr><td><code>404</code></td><td>ElevenLabs could not find the agent.</td></tr>
				<tr
					><td><code>500</code></td><td
						><code>ELEVENLABS_API_KEY</code> is missing on the server.</td
					></tr
				>
				<tr
					><td><code>502</code></td><td
						>Upstream rejection, unexpected payload, or network failure.</td
					></tr
				>
				<tr><td><code>503</code></td><td>ElevenLabs is rate limiting the request.</td></tr>
				<tr><td><code>499</code></td><td>The client cancelled the request.</td></tr>
			</tbody>
		</table>
	</div>
	<p>
		Every response sets <code>Cache-Control: no-store</code>. The route validates
		<code>agent_</code> and <code>seng_</code> ids before it calls ElevenLabs, and it never echoes the
		API key.
	</p>

	<h2 id="server-route">Server route</h2>
	<p>
		The repository route at <code>src/routes/api/signed-url/+server.ts</code> is the reference implementation.
		A condensed version looks like this:
	</p>
	<CodeBlock
		filename="src/routes/api/signed-url/+server.ts"
		lang="ts"
		code={`import { json } from '@sveltejs/kit';
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
    typeof body === 'object' && body !== null && 'signed_url' in body
      ? body.signed_url
      : null;

  if (typeof signedUrl !== 'string') {
    return json({ error: { message: 'Unexpected upstream response.' } }, { status: 502 });
  }

  return json({ signed_url: signedUrl });
};`}
	/>
	<Callout tone="note" title="The included route is stricter">
		<p>
			The repository version maps upstream 401, 403, 404, and 429 responses to clearer client
			messages, validates the returned URL protocol, and logs failures without logging the key. Use
			it as the starting point instead of retyping the sample.
		</p>
	</Callout>

	<h2 id="client">Client usage</h2>
	<p>
		Pass <code>signed: true</code> as the second argument. The controller appends the agent id to
		your endpoint and fetches JSON with an <code>Accept</code> header.
	</p>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  signedUrlEndpoint: '/api/signed-url'
});

await conversation.startConversation('agent_your_public_id', { signed: true });`}
	/>
	<p>
		An already-minted <code>wss://</code> URL skips the exchange and connects directly:
	</p>
	<CodeBlock
		lang="ts"
		code="await conversation.startConversation('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...');"
	/>
	<p>
		The signed URL request has a 12 second timeout. A failed exchange appears as
		<code>signed-url-failed</code> with a message from your route when one is available.
	</p>

	<h2 id="security">Security checklist</h2>
	<ul>
		<li>
			Read <code>ELEVENLABS_API_KEY</code> from <code>process.env</code> inside the server route only.
		</li>
		<li>
			Never use a <code>PUBLIC_*</code> name for the key and never import the route into client code.
		</li>
		<li>Set <code>Cache-Control: no-store</code> on success and error responses.</li>
		<li>Validate the agent id shape before calling ElevenLabs.</li>
		<li>
			Add authentication or rate limiting when the endpoint is public. A route that mints URLs for
			arbitrary ids can spend your quota.
		</li>
		<li>Do not log the key, the signed URL, or full request headers.</li>
		<li>Keep the key out of static builds, preview deployments, and issue reports.</li>
	</ul>
	<Callout tone="security" title="Treat the signed URL as a credential">
		<p>
			Anyone who receives a signed URL can open the conversation until it expires. Use short-lived
			URLs, serve them over HTTPS, and avoid putting them in analytics, chat logs, or error
			tracking.
		</p>
	</Callout>

	<h2 id="static">Static hosting</h2>
	<p>
		A static host has no server runtime, so it cannot mint signed URLs. The showcase handles this by
		building with <code>PUBLIC_HOSTING_MODE=static</code>: signed mode is hidden and disabled, and
		visitors use a public agent id or paste a signed URL they already have.
	</p>
	<CodeBlock
		lang="sh"
		code="PUBLIC_ELEVENLABS_AGENT_ID=agent_examplePublicId bun run build:pages"
	/>
	<p>
		The static output is written to <code>build</code>. Set <code>PAGES_BASE_PATH</code> for a
		GitHub project site, for example <code>/svelte-elevenlabs</code>, so links and assets resolve
		under the repository path. The workflow supplies it automatically and the same build also works
		at a domain root.
	</p>
	<p>
		Read <a href={resolve('/docs/troubleshooting')}>Troubleshooting</a> if signed mode works locally but
		fails after deployment, or see the README for the full Pages workflow.
	</p>
</DocsPage>
