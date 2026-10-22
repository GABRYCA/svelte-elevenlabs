<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Client tools"
	summary="Register named tools, share them through context, answer MCP approval requests, and observe agent side tool calls."
	toc={[
		{ id: 'how-tools-work', label: 'How tools work' },
		{ id: 'named-tools', label: 'Named tools' },
		{ id: 'provider-tools', label: 'Provider tools' },
		{ id: 'fallback', label: 'Fallback handler' },
		{ id: 'mcp', label: 'MCP approvals' },
		{ id: 'agent-tools', label: 'Agent tools' },
		{ id: 'debugging', label: 'Debugging' }
	]}
>
	<h2 id="how-tools-work">How tools work</h2>
	<p>
		A client tool is a function the agent can ask your browser to run. The server sends a
		<code>client_tool_call</code> event with a tool name, an argument object, a call id, and an
		<code>expects_response</code> flag. The controller looks up a handler, executes it, converts the
		return value to a protocol string, and sends a <code>client_tool_result</code> when the server is
		waiting for one.
	</p>
	<ul>
		<li>
			<strong>Named tools</strong> are matched by the key in <code>clientTools</code> or by
			<code>registerClientTool</code>.
		</li>
		<li><strong>The fallback</strong> receives every call that has no named handler.</li>
		<li>
			<strong>Unhandled calls</strong> still receive an error result and trigger
			<code>onUnhandledClientToolCall</code>.
		</li>
	</ul>
	<p>
		Return values follow a simple rule: a string is sent unchanged, <code>undefined</code> or
		<code>null</code> becomes <code>Client tool execution successful.</code>, and every other value
		is serialized with <code>JSON.stringify</code>. A thrown error produces an error result with
		<code>error_type: 'external_client'</code>.
	</p>

	<h2 id="named-tools">Named tools</h2>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  clientTools: {
    get_order: async ({ orderId }) => {
      const id = String(orderId ?? '');
      const order = await fetchOrder(id);
      return { id, status: order.status };
    }
  }
});`}
	/>
	<p>
		The first argument is typed as <code>Record&lt;string, unknown&gt;</code>, so narrow each field
		before using it. The second argument is the full <code>ClientToolCallRequest</code>, including
		<code>tool_call_id</code> and the raw parameters.
	</p>
	<p>Register a tool later in the session when the handler depends on current component state:</p>
	<CodeBlock
		lang="ts"
		code={`const remove = conversation.registerClientTool('get_order', async ({ orderId }) => {
  return { orderId, status: 'shipped' };
});

// The registration is removed when you call the returned function.
remove();`}
	/>
	<p>Named tools always win over the fallback handler.</p>

	<h2 id="provider-tools">Provider tools</h2>
	<p>
		<code>useConversationClientTool</code> registers a named tool on the nearest
		<code>ConversationProvider</code>. The registration follows the component lifecycle and is
		removed on unmount, which keeps tool ownership close to the UI that implements it.
	</p>
	<CodeBlock
		filename="ToolRow.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { useConversationClientTool } from 'svelte-elevenlabs';

  useConversationClientTool('get_order', async ({ orderId }) => {
    return { orderId, status: 'shipped' };
  });
\u003C/script>

<span>Tool ready</span>`}
	/>
	<CodeBlock
		filename="App.svelte"
		lang="svelte"
		code={`<script lang="ts">
  import { ConversationProvider } from 'svelte-elevenlabs';
  import ToolRow from './ToolRow.svelte';
\u003C/script>

<ConversationProvider options={{ agentId: 'agent_your_public_id' }}>
  <ToolRow />
</ConversationProvider>`}
	/>
	<p>
		Call the hook during component initialisation, directly in <code>&lt;script&gt;</code>. It reads
		the provider context, so it must render inside a provider. Use
		<code>getConversationContext()</code> when a component needs the controller itself.
	</p>

	<h2 id="fallback">Fallback handler</h2>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  onClientToolCall: async (call) => {
    return { tool: call.tool_name, parameters: call.parameters };
  },
  onUnhandledClientToolCall: (call) => {
    console.warn('No handler for', call.tool_name);
  }
});`}
	/>
	<p>
		The fallback is useful for a small number of dynamic tools or for a generic proxy to your
		backend. It does not replace named tools: a matching named handler is always preferred. Keep the
		fallback fast and avoid returning secrets or large payloads.
	</p>

	<h2 id="mcp">MCP approvals</h2>
	<p>
		When an MCP tool call reaches the <code>awaiting_approval</code> state, the controller can ask
		your UI for a decision. The handler must resolve to a boolean. Anything else is treated as a
		denial and publishes a <code>protocol-error</code>.
	</p>
	<CodeBlock
		lang="ts"
		code={`const conversation = useConversation({
  agentId: 'agent_your_public_id',
  onMCPToolApprovalRequest: async (call, { signal }) => {
    const approved = await confirmInYourUi(call.tool_name, call.parameters);
    if (signal.aborted) return false;
    return approved;
  }
});`}
	/>
	<p>
		The controller sends exactly one <code>mcp_tool_approval_result</code> per call. The
		<code>signal</code> aborts when the session ends or the call leaves the approval state, so a late
		answer cannot reach the server.
	</p>
	<p>
		If the decision belongs to a component that is not the controller owner, call
		<code>sendMCPToolApprovalResult(toolCallId, approved)</code> from that component after the user
		acts.
		<code>onMCPToolCall</code> and <code>onMCPConnectionStatus</code> expose the lifecycle updates for
		your approval UI.
	</p>

	<h2 id="agent-tools">Agent tools</h2>
	<p>Server side tool calls are observable but not executed by the browser:</p>
	<ul>
		<li><code>onAgentToolRequest</code> receives the request before the agent tool runs.</li>
		<li><code>onAgentToolResponse</code> receives the completed result.</li>
		<li><code>onGuardrailTriggered</code> reports a guardrail that fired during the turn.</li>
	</ul>
	<p>
		The built-in <code>end_call</code> tool is honored automatically: when the agent reports it, the controller
		stops the session and preserves the transcript.
	</p>

	<h2 id="debugging">Debugging</h2>
	<p>
		Set <code>debug: true</code> to print redacted protocol diagnostics through
		<code>console.debug</code>. For a structured stream inside your own panel, use
		<code>onDebug</code>
		plus
		<code>onIncomingEvent</code> and <code>onOutgoingEvent</code>.
	</p>
	<Callout tone="security" title="Keep payloads out of logs">
		<p>
			Tool arguments can contain user data. Redact them before sending diagnostics to a third-party
			service, and never log API keys or signed URLs.
		</p>
	</Callout>
	<p>
		The protocol types for every incoming and outgoing frame live in
		<a href={resolve('/docs/reference')}>API reference</a>. Start there when a tool call has an
		unexpected shape.
	</p>
</DocsPage>
