<script lang="ts">
	import { PUBLIC_ELEVENLABS_AGENT_ID, PUBLIC_HOSTING_MODE } from '$app/env/public';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { ConversationWidget, useConversation } from '#lib';

	const configuredAgentId = (PUBLIC_ELEVENLABS_AGENT_ID ?? '').trim();
	const staticHosting = PUBLIC_HOSTING_MODE === 'static';
	const signed = !staticHosting;

	const conversation = useConversation({
		agentId: configuredAgentId,
		signedUrlEndpoint: '/api/signed-url',
		maxTranscripts: 60
	});

	let focus = $state(false);

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('focus') === '1') focus = true;

		function handleKeydown(event: KeyboardEvent): void {
			if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key.toLowerCase() !== 'f') return;

			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
			) {
				return;
			}

			event.preventDefault();
			focus = !focus;
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function toggleFocus(): void {
		focus = !focus;
	}
</script>

<svelte:head>
	<title>Live demo | svelte-elevenlabs</title>
	<meta
		name="description"
		content="A live ConversationWidget session built with svelte-elevenlabs, Svelte 5, and ElevenLabs Conversational AI."
	/>
</svelte:head>

<div class="demo" class:demo--focus={focus}>
	<header class="demo__bar">
		<a class="demo__brand" href={resolve('/')} aria-label="svelte-elevenlabs, back to the showcase">
			<span class="demo__mark" aria-hidden="true">
				<svg viewBox="0 0 32 32" focusable="false">
					<path d="M7 23V16M12 23V9M17 23V12M22 23V6M27 23V18" />
					<path d="M5 26.5h22" />
				</svg>
			</span>
			<span class="demo__name">svelte<span class="demo__slash">/</span>elevenlabs</span>
		</a>

		<span class="demo__tag">Live demo</span>

		<nav class="demo__nav" aria-label="Demo links">
			<a href={resolve('/docs')}>Docs</a>
			<a href={resolve('/docs/components')}>Widget</a>
			<a href="https://github.com/GABRYCA/svelte-elevenlabs" rel="noreferrer">GitHub ↗</a>
			<button type="button" class="demo__focus-toggle" aria-pressed={focus} onclick={toggleFocus}>
				{focus ? 'Exit focus' : 'Focus view'}
			</button>
		</nav>
	</header>

	<main class="demo__main">
		<section class="demo__intro" aria-labelledby="demo-title">
			<p class="demo__kicker">
				<span aria-hidden="true"></span>
				ConversationWidget / live
			</p>
			<h1 id="demo-title">A real session,<br />not a mock.</h1>
			<p class="demo__lede">
				This page renders the shipped <code>ConversationWidget</code> against a live agent. The controller
				owns the socket, the microphone, the audio graph, and the teardown. The widget only renders the
				state it publishes.
			</p>

			<ul class="demo__facts" aria-label="Demo highlights">
				<li>
					<strong>{signed ? 'Signed URL' : 'Public id'}</strong>
					<span>{signed ? 'The key stays on the server' : 'Direct socket connection'}</span>
				</li>
				<li>
					<strong>One gesture</strong>
					<span>The microphone opens on start</span>
				</li>
				<li>
					<strong>Clean exit</strong>
					<span>The socket and tracks close</span>
				</li>
			</ul>

			<p class="demo__note">
				{#if staticHosting}
					This static build uses a public agent id. Signed URLs need the Node or Bun server build.
				{:else}
					The server exchanges the agent id for a short-lived signed URL. The API key never enters
					the browser.
				{/if}
			</p>
		</section>

		<div class="demo__stage">
			<div class="demo__widget-wrap">
				<ConversationWidget
					controller={conversation}
					agentId={configuredAgentId}
					{signed}
					showTargetInput={!configuredAgentId}
					title="Conversation"
					subtitle={signed ? 'Signed URL / Svelte 5' : 'Public agent / Svelte 5'}
				/>
			</div>

			<p class="demo__hint">
				Press <kbd>F</kbd> for a clean focus view. Press it again to return. Add
				<code>?focus=1</code> to the URL to open in focus view.
			</p>
		</div>
	</main>

	<footer class="demo__foot">
		<span>Independent community project. Not affiliated with or endorsed by ElevenLabs Inc.</span>
		<a href={resolve('/')}>Back to the showcase ↑</a>
	</footer>

	{#if focus}
		<button type="button" class="demo__exit" onclick={toggleFocus}>
			Exit focus <kbd>F</kbd>
		</button>
	{/if}
</div>

<style>
	.demo {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 18% 0%, rgba(255, 93, 43, 0.13), transparent 42%),
			radial-gradient(ellipse at 88% 78%, rgba(205, 246, 108, 0.06), transparent 38%),
			var(--chassis);
		color: var(--chalk);
	}

	.demo::before {
		position: absolute;
		inset: 0;
		background-image: linear-gradient(rgba(241, 234, 219, 0.035) 1px, transparent 1px);
		background-size: 100% 4.5rem;
		content: '';
		mask-image: linear-gradient(to bottom, black, transparent 78%);
		pointer-events: none;
	}

	.demo__bar {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 1rem;
		width: min(100%, 78rem);
		margin-inline: auto;
		padding: 1.1rem clamp(1rem, 4vw, 3rem);
		border-bottom: 1px solid var(--chassis-line);
	}

	.demo__brand {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--chalk);
		text-decoration: none;
	}

	.demo__mark {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid rgba(241, 234, 219, 0.4);
		background: rgba(255, 93, 43, 0.12);
	}

	.demo__mark svg {
		width: 1.15rem;
		height: 1.15rem;
		fill: none;
		stroke: var(--signal);
		stroke-linecap: square;
		stroke-width: 1.6;
	}

	.demo__mark svg path:last-child {
		stroke: currentColor;
		stroke-width: 1;
		opacity: 0.55;
	}

	.demo__name {
		font-size: 0.98rem;
		font-weight: 680;
		letter-spacing: -0.035em;
	}

	.demo__slash {
		padding-inline: 0.12rem;
		color: var(--signal);
		font-family: var(--font-mono);
		font-weight: 400;
	}

	.demo__tag {
		padding: 0.2rem 0.45rem;
		border: 1px solid var(--chassis-line);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.demo__nav {
		display: flex;
		align-items: center;
		gap: clamp(0.7rem, 2vw, 1.4rem);
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.demo__nav a {
		color: var(--chalk-muted);
		text-decoration: none;
	}

	.demo__nav a:hover {
		color: var(--signal);
	}

	.demo__focus-toggle {
		padding: 0.5rem 0.7rem;
		border: 1px solid rgba(241, 234, 219, 0.3);
		background: transparent;
		color: var(--chalk);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.demo__focus-toggle:hover {
		background: var(--signal);
		color: var(--chassis);
	}

	.demo__main {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(21rem, 1fr);
		align-items: center;
		gap: clamp(2rem, 6vw, 6rem);
		width: min(100%, 78rem);
		margin-inline: auto;
		padding: clamp(2.4rem, 6vw, 5rem) clamp(1rem, 4vw, 3rem);
		flex: 1;
	}

	.demo__kicker {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0 0 1.1rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.demo__kicker span {
		width: 1.8rem;
		height: 1px;
		background: var(--signal);
	}

	h1 {
		margin: 0;
		font-size: clamp(2.9rem, 6.4vw, 5.6rem);
		font-weight: 690;
		letter-spacing: -0.065em;
		line-height: 0.9;
	}

	.demo__lede {
		max-width: 31rem;
		margin: 1.6rem 0 0;
		color: var(--chalk-muted);
		font-size: clamp(1rem, 1.4vw, 1.12rem);
		line-height: 1.6;
	}

	.demo__lede code {
		color: var(--agent);
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.demo__facts {
		display: grid;
		gap: 0;
		max-width: 31rem;
		margin: 2rem 0 0;
		padding: 0;
		border-top: 1px solid var(--chassis-line);
		list-style: none;
	}

	.demo__facts li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--chassis-line);
	}

	.demo__facts strong {
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 560;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.demo__facts span {
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-align: right;
	}

	.demo__note {
		max-width: 31rem;
		margin: 1.5rem 0 0;
		color: var(--chalk-muted);
		font-size: 0.88rem;
		line-height: 1.55;
	}

	.demo__stage {
		min-width: 0;
	}

	.demo__widget-wrap {
		--se-panel: #191913;
		--se-panel-raised: #23231b;
		--se-ink: var(--chalk);
		--se-muted: rgba(241, 234, 219, 0.58);
		--se-line: rgba(241, 234, 219, 0.16);
		--se-signal: var(--signal);
		--se-agent: var(--agent);

		box-shadow:
			0 0 0 1px rgba(241, 234, 219, 0.05),
			1.4rem 1.4rem 0 rgba(0, 0, 0, 0.22);
	}

	.demo__hint {
		margin: 1rem 0 0;
		color: rgba(241, 234, 219, 0.42);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		line-height: 1.6;
	}

	.demo__hint kbd,
	.demo__exit kbd {
		padding: 0.05rem 0.3rem;
		border: 1px solid rgba(241, 234, 219, 0.26);
		font-family: inherit;
		font-size: 0.92em;
	}

	.demo__hint code {
		color: rgba(241, 234, 219, 0.64);
	}

	.demo__foot {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: min(100%, 78rem);
		margin-inline: auto;
		padding: 1rem clamp(1rem, 4vw, 3rem);
		border-top: 1px solid var(--chassis-line);
		color: rgba(241, 234, 219, 0.42);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1.5;
	}

	.demo__foot a {
		color: var(--chalk-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	.demo__foot a:hover {
		color: var(--signal);
	}

	.demo__exit {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 10;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid rgba(241, 234, 219, 0.28);
		background: rgba(18, 18, 15, 0.82);
		color: var(--chalk);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		backdrop-filter: blur(8px);
	}

	.demo__exit:hover {
		background: var(--signal);
		color: var(--chassis);
	}

	.demo--focus .demo__bar,
	.demo--focus .demo__intro,
	.demo--focus .demo__foot,
	.demo--focus .demo__hint {
		display: none;
	}

	.demo--focus .demo__main {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		padding: 1.5rem;
	}

	.demo--focus .demo__stage {
		width: min(100%, 38rem);
	}

	.demo--focus .demo__widget-wrap {
		box-shadow:
			0 0 0 1px rgba(241, 234, 219, 0.06),
			0 2rem 6rem rgba(0, 0, 0, 0.42);
	}

	@media (max-width: 860px) {
		.demo__main {
			grid-template-columns: minmax(0, 1fr);
			align-items: start;
		}

		.demo__nav a {
			display: none;
		}
	}

	@media (max-width: 540px) {
		.demo__tag {
			display: none;
		}

		.demo__facts li {
			display: grid;
			gap: 0.2rem;
		}

		.demo__facts span {
			text-align: left;
		}

		.demo__foot {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.demo__focus-toggle,
		.demo__exit {
			transition: none;
		}
	}
</style>
