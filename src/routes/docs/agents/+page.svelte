<script lang="ts">
	import { resolve } from '$app/paths';
	import Callout from '../_components/Callout.svelte';
	import CodeBlock from '../_components/CodeBlock.svelte';
	import DocsPage from '../_components/DocsPage.svelte';
</script>

<DocsPage
	title="Agent kit"
	summary="Give Claude Code, Cursor, OpenCode, Copilot, Windsurf, Cline, Gemini CLI, and other coding agents one accurate guide to this package."
	toc={[
		{ id: 'why', label: 'Why a kit' },
		{ id: 'install', label: 'Install' },
		{ id: 'targets', label: 'Targets' },
		{ id: 'behavior', label: 'What it writes' },
		{ id: 'use', label: 'Use it' },
		{ id: 'manual', label: 'Manual setup' },
		{ id: 'machine', label: 'Machine docs' },
		{ id: 'safety', label: 'Safety' }
	]}
>
	<h2 id="why">Why a kit</h2>
	<p>
		Coding agents are useful when they already know the shape of an API. They are less useful when
		they invent a method name, forget that <code>useConversation</code> must run during component initialisation,
		or move an API key into a client component. The agent kit gives them one reviewed source file and
		puts it where their tool already looks.
	</p>
	<p>
		The guide is plain Markdown. It describes the public surface, the lifecycle rules, the signed
		URL route, the ready-made components, client tools, error codes, and a review checklist. It
		contains no credentials.
	</p>

	<h2 id="install">Install</h2>
	<p>Run the command inside the project that already depends on the package:</p>
	<CodeBlock
		filename="Terminal"
		lang="shell"
		code={`# Bun
bunx svelte-elevenlabs agents install

# npm
npx svelte-elevenlabs agents install`}
	/>
	<p>
		With no target names, the command detects the agent configuration in the project. When it cannot
		detect one, it adds a managed block to <code>AGENTS.md</code>. Choose targets explicitly when
		you want more than detection finds:
	</p>
	<CodeBlock
		filename="Terminal"
		lang="shell"
		code={`bunx svelte-elevenlabs agents install claude cursor opencode
bunx svelte-elevenlabs agents install --all
bunx svelte-elevenlabs agents install claude --dry-run
bunx svelte-elevenlabs agents install claude --force`}
	/>
	<p>
		<code>agents list</code> prints every target and destination path. <code>agents print</code> sends
		the guide to standard output so you can review it or pipe it into another file.
	</p>

	<h2 id="targets">Targets</h2>
	<div class="docs-table-wrap">
		<table class="docs-table">
			<caption>Supported agent tools and their destination files</caption>
			<thead>
				<tr><th scope="col">Name</th><th scope="col">Tool</th><th scope="col">Destination</th></tr>
			</thead>
			<tbody>
				<tr
					><td><code>claude</code></td><td>Claude Code</td><td
						><code>.claude/skills/svelte-elevenlabs/SKILL.md</code></td
					></tr
				>
				<tr
					><td><code>cursor</code></td><td>Cursor</td><td
						><code>.cursor/rules/svelte-elevenlabs.mdc</code></td
					></tr
				>
				<tr
					><td><code>opencode</code></td><td>OpenCode</td><td
						><code>.opencode/skills/svelte-elevenlabs/SKILL.md</code></td
					></tr
				>
				<tr
					><td><code>copilot</code></td><td>GitHub Copilot</td><td
						><code>.github/copilot-instructions.md</code></td
					></tr
				>
				<tr
					><td><code>windsurf</code></td><td>Windsurf</td><td
						><code>.windsurf/rules/svelte-elevenlabs.md</code></td
					></tr
				>
				<tr
					><td><code>cline</code></td><td>Cline</td><td
						><code>.clinerules/svelte-elevenlabs.md</code></td
					></tr
				>
				<tr><td><code>gemini</code></td><td>Gemini CLI</td><td><code>GEMINI.md</code></td></tr>
				<tr
					><td><code>agents</code></td><td>Codex, OpenCode, Jules, and other AGENTS.md tools</td><td
						><code>AGENTS.md</code></td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		Claude Code and OpenCode skills use the standard <code>name</code> and <code>description</code>
		frontmatter. Cursor and Windsurf receive rule frontmatter. Copilot, Gemini, and generic agent files
		use a marked block.
	</p>

	<h2 id="behavior">What it writes</h2>
	<p>
		Shared files such as <code>AGENTS.md</code>, <code>GEMINI.md</code>, and the Copilot
		instructions keep your existing content. The installer adds or updates only the block between
		<code>svelte-elevenlabs:agent-kit:start</code> and <code>svelte-elevenlabs:agent-kit:end</code>.
		Running the command again replaces that block, so updates do not duplicate text.
	</p>
	<p>
		Dedicated skill and rule files are treated as owned files. If one already exists without a
		managed block, the installer skips it and tells you to use <code>--force</code> before it replaces
		your work. A dry run reports every planned write and changes nothing.
	</p>
	<Callout tone="note" title="No network calls">
		<p>
			The installer reads the guide from the installed package and writes local Markdown. It never
			calls ElevenLabs, never asks for a key, and never edits source code.
		</p>
	</Callout>

	<h2 id="use">Use it</h2>
	<p>
		Restart the agent session after installation so the tool reloads its rules. Then describe the
		outcome, not the implementation detail:
	</p>
	<CodeBlock
		filename="Agent prompt"
		lang="text"
		code={`Add a voice conversation panel to src/routes/support/+page.svelte.
Use svelte-elevenlabs with a signed URL route and the ready-made
ConversationWidget. Keep the API key on the server, render errors with
role="alert", and make the start action a real user gesture.`}
	/>
	<p>For a review, ask for the checklist directly:</p>
	<CodeBlock
		filename="Agent prompt"
		lang="text"
		code={`Review this SvelteKit app for svelte-elevenlabs misuse. Check lifecycle,
secret exposure, secure context handling, text only mode, and teardown.
Report findings before changing files.`}
	/>
	<p>
		The guide includes the exact controller fields, methods, options, error codes, and code samples
		the agent needs. It also points to this documentation and to the full machine reference.
	</p>

	<h2 id="manual">Manual setup</h2>
	<p>
		If you cannot run the CLI, copy
		<a href="https://github.com/GABRYCA/svelte-elevenlabs/blob/main/agent-kit/instructions.md"
			>the canonical guide</a
		>
		into the file your tool reads. For Claude Code or OpenCode, add this frontmatter above the guide:
	</p>
	<CodeBlock
		filename="SKILL.md"
		lang="markdown"
		code={`---
name: svelte-elevenlabs
description: Build or review Svelte 5 ElevenLabs Conversational AI voice and text sessions with svelte-elevenlabs.
license: MIT
---`}
	/>
	<p>
		For a shared file, wrap the guide in the two markers shown above. The CLI uses the same format,
		so a later install can update the manual copy without touching the rest of the file.
	</p>

	<h2 id="machine">Machine docs</h2>
	<p>
		The kit complements the existing plain text documentation. Use
		<a href={resolve('/llms.txt')}><code>llms.txt</code></a> as a compact index and
		<a href={resolve('/llms-full.txt')}><code>llms-full.txt</code></a> as the complete reference. The
		agent guide is shorter than the full reference and focuses on decisions an agent has to make while
		editing an application.
	</p>

	<h2 id="safety">Safety</h2>
	<p>
		The installer is deliberately conservative. It reads the guide from the installed package,
		writes only the targets you name or detection finds, and never calls the network, runs a
		generated script, or asks for credentials. Run a dry run before a real install when the project
		already has agent rules you want to keep.
	</p>
	<Callout tone="security" title="Keep secrets out of prompts">
		<p>
			Never paste <code>ELEVENLABS_API_KEY</code> into a prompt, an agent rule file, or a committed
			<code>.env</code>. Point the agent at the server route and let it read the key from the
			runtime environment. The same rule applies to a signed URL, which is a short lived credential.
		</p>
	</Callout>
	<ul>
		<li>
			Run <code>agents install --dry-run</code> first and review every destination path before the installer
			writes a file.
		</li>
		<li>
			Keep <code>.env</code> and local overrides out of version control. The bundled guide contains no
			key, no account data, and no agent configuration.
		</li>
		<li>
			Keep <code>ELEVENLABS_API_KEY</code> in server code such as
			<code>src/routes/api/signed-url/+server.ts</code>, never in a <code>PUBLIC_*</code> variable and
			never in a static artifact.
		</li>
		<li>
			Review generated code as you would review a pull request. The kit describes the public API,
			but it cannot verify that the agent used it correctly.
		</li>
		<li>
			Treat a change to the signed URL route, audio permissions, or dependencies as security
			sensitive and inspect it by hand.
		</li>
		<li>
			Run <code>bun run check</code>, <code>bun run test</code>, and <code>bun run lint</code> before
			you merge an agent change in this repository.
		</li>
	</ul>
	<p>
		The guide is documentation, not a sandbox. An agent can still make an unsafe choice, so keep the
		review checklist in the loop and keep production credentials out of the workspace you hand to
		it.
	</p>
</DocsPage>
