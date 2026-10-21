<script lang="ts">
	import { untrack } from 'svelte';
	import AudioVisualizer from './AudioVisualizer.svelte';
	import { useConversation, type ConversationController } from '../runes/useConversation.svelte.js';
	import type { ConversationStatus } from '../types/index.js';

	/**
	 * Props for the ready-made conversation widget.
	 *
	 * The widget can own its session (pass `agentId`) or mirror a controller
	 * you already created (pass `controller`). The external controller wins
	 * when both are supplied.
	 */
	interface Props {
		/** An existing controller. When omitted the widget creates its own. */
		controller?: ConversationController;
		/** Default target shown in the agent field. */
		agentId?: string;
		/** Exchange the agent id for a signed URL through `/api/signed-url`. */
		signed?: boolean;
		/** Widget heading. */
		title?: string;
		/** Small line under the heading. */
		subtitle?: string;
		/** Show the target input. Defaults to `true`. */
		showTargetInput?: boolean;
		/** Show the live spectrum. Defaults to `true`. */
		showVisualizer?: boolean;
		/** Show the transcript log. Defaults to `true`. */
		showTranscript?: boolean;
		/** Show latency, format, and session counters. Defaults to `true`. */
		showTelemetry?: boolean;
		/** Extra class names applied to the root element. */
		class?: string;
	}

	let {
		controller,
		agentId = '',
		signed = false,
		title = 'Conversation',
		subtitle = 'ElevenLabs Conversational AI · Svelte 5',
		showTargetInput = true,
		showVisualizer = true,
		showTranscript = true,
		showTelemetry = true,
		class: className = ''
	}: Props = $props();

	const internal = useConversation();
	const conversation = $derived(controller ?? internal);

	// Seed the editable field once; later prop changes should not overwrite typing.
	let target = $state(untrack(() => agentId));
	let elapsed = $state(0);
	let transcriptEl = $state<HTMLDivElement | null>(null);
	let pinnedToBottom = true;

	const active = $derived(conversation.status !== 'disconnected');
	const connected = $derived(conversation.status === 'connected');
	const busy = $derived(conversation.status === 'connecting');
	const statusLabel = $derived.by(() => {
		if (conversation.queueStatus === 'waiting') return 'In queue';
		if (conversation.status === 'connecting') return 'Patching in';
		if (conversation.status === 'disconnected') return conversation.error ? 'Fault' : 'Offline';
		if (conversation.isSpeaking) return 'Agent speaking';
		if (conversation.isUserSpeaking) return 'You are speaking';
		return 'Open line';
	});
	const statusTone = $derived(
		conversation.status === 'connected'
			? 'live'
			: conversation.status === 'connecting'
				? 'waiting'
				: conversation.error
					? 'fault'
					: 'idle'
	);
	const primaryLabel = $derived(
		conversation.status === 'connected'
			? 'End conversation'
			: conversation.status === 'connecting'
				? 'Cancel connection'
				: 'Start conversation'
	);
	const helper = $derived.by(() => {
		if (conversation.status === 'connected') {
			if (conversation.isMuted) return 'Microphone muted. The agent can still speak.';
			return 'Microphone live. Speak naturally. Barge-in flushes agent audio.';
		}
		if (conversation.status === 'connecting') {
			return 'Requesting microphone access and negotiating formats.';
		}
		return signed
			? 'The server exchanges this ID for a short-lived signed URL.'
			: 'Public agent IDs connect directly to ElevenLabs. Use a signed URL in production.';
	});

	$effect(() => {
		if (conversation.status !== 'connected') {
			elapsed = 0;
			return;
		}

		const startedAt = Date.now();
		const timer = setInterval(() => {
			elapsed = Math.floor((Date.now() - startedAt) / 1000);
		}, 1_000);

		return () => clearInterval(timer);
	});

	$effect(() => {
		// Track the newest text so streaming deltas keep the log pinned.
		const count = conversation.transcripts.length;
		const tail = count > 0 ? conversation.transcripts[count - 1] : null;
		void tail?.text;
		void tail?.isFinal;

		if (!transcriptEl || !pinnedToBottom) return;
		transcriptEl.scrollTop = transcriptEl.scrollHeight;
	});

	function handlePrimary(): void {
		if (conversation.status !== 'disconnected') {
			conversation.stopConversation();
			return;
		}

		pinnedToBottom = true;
		const value = target.trim();
		void conversation.startConversation(value || undefined, { signed });
	}

	function handleScroll(): void {
		if (!transcriptEl) return;
		const distance = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight;
		pinnedToBottom = distance < 48;
	}

	function handleClear(): void {
		pinnedToBottom = true;
		conversation.clearTranscripts();
	}

	function formatClock(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const seconds = (totalSeconds % 60).toString().padStart(2, '0');
		return `${minutes}:${seconds}`;
	}

	function formatRate(format: string | null): string {
		if (!format) return '-';
		return format.replace('pcm_', '').replace('ulaw_', 'µ-law ');
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function shortId(id: string | null): string {
		if (!id) return '-';
		return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-3)}` : id;
	}

	function statusClass(status: ConversationStatus): string {
		return `se-widget__status se-widget__status--${status}`;
	}
</script>

<section
	class="se-widget {className}"
	style:--se-widget-accent={conversation.error ? '#ff8b6b' : undefined}
>
	<header class="se-widget__header">
		<div class="se-widget__identity">
			<span class="se-widget__glyph" aria-hidden="true">
				<span></span><span></span><span></span><span></span>
			</span>
			<div>
				<p class="se-widget__eyebrow">Voice module / 01</p>
				<h2>{title}</h2>
			</div>
		</div>

		<p
			class={statusClass(statusTone === 'fault' ? 'disconnected' : conversation.status)}
			role="status"
		>
			<span class="se-widget__lamp" data-tone={statusTone}></span>
			{statusLabel}
		</p>
	</header>

	<p class="se-widget__subtitle">{subtitle}</p>

	{#if conversation.error}
		<div class="se-widget__error" role="alert">
			<div>
				<p class="se-widget__error-title">
					{conversation.errorCode?.replaceAll('-', ' ') ?? 'Connection issue'}
				</p>
				<p>{conversation.error}</p>
			</div>
			<button
				type="button"
				class="se-widget__error-dismiss"
				aria-label="Dismiss error"
				onclick={() => conversation.clearError()}
			>
				×
			</button>
		</div>
	{/if}

	{#if showVisualizer}
		<div class="se-widget__visualizer">
			<AudioVisualizer {conversation} height={166} />
		</div>
	{/if}

	{#if showTelemetry}
		<dl class="se-widget__telemetry">
			<div>
				<dt>Latency</dt>
				<dd>{conversation.latency === null ? '-' : `${conversation.latency} ms`}</dd>
			</div>
			<div>
				<dt>Session</dt>
				<dd>{formatClock(elapsed)}</dd>
			</div>
			<div>
				<dt>In / out</dt>
				<dd>
					{formatRate(conversation.inputAudioFormat)} /
					{formatRate(conversation.outputAudioFormat)}
				</dd>
			</div>
			<div>
				<dt>Interrupts</dt>
				<dd>{conversation.interruptions.toString().padStart(2, '0')}</dd>
			</div>
		</dl>
	{/if}

	{#if showTranscript}
		<div class="se-widget__log-head">
			<span>Transcript / live</span>
			<div class="se-widget__log-actions">
				{#if conversation.transcripts.length > 0}
					<span>{conversation.messageCount} entries</span>
					<button type="button" class="se-widget__text-button" onclick={handleClear}>Clear</button>
				{:else}
					<span>Awaiting first turn</span>
				{/if}
			</div>
		</div>

		<!-- Keyboard users must be able to scroll the live transcript. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="se-widget__transcript"
			bind:this={transcriptEl}
			onscroll={handleScroll}
			role="log"
			aria-label="Conversation transcript"
			aria-live="polite"
			tabindex="0"
		>
			{#if conversation.transcripts.length === 0}
				<p class="se-widget__empty">
					<span>Line open for text.</span>
					Start a session and the exchange will print here, including partial agent responses.
				</p>
			{:else}
				{#each conversation.transcripts as message (message.id)}
					<article class="se-widget__message" data-role={message.role}>
						<div class="se-widget__message-meta">
							<span>{message.role === 'user' ? 'You' : 'Agent'}</span>
							<span>{formatTime(message.timestamp)}</span>
						</div>
						<p>
							{message.text}{#if !message.isFinal}<span class="se-widget__caret" aria-hidden="true"
								></span>{/if}
						</p>
					</article>
				{/each}
			{/if}
		</div>
	{/if}

	<form
		class="se-widget__controls"
		onsubmit={(event) => {
			event.preventDefault();
			handlePrimary();
		}}
	>
		{#if showTargetInput}
			<label class="se-widget__field">
				<span>Agent id or signed URL</span>
				<input
					bind:value={target}
					type="text"
					placeholder="agent_…"
					autocomplete="off"
					spellcheck="false"
					disabled={conversation.status !== 'disconnected'}
				/>
			</label>
		{/if}

		<button
			type="submit"
			class="se-widget__primary"
			class:se-widget__primary--stop={active}
			aria-busy={busy}
		>
			<span class="se-widget__primary-lamp" aria-hidden="true"></span>
			{primaryLabel}
		</button>
	</form>

	<div class="se-widget__footer">
		<p>{helper}</p>
		<button
			type="button"
			class="se-widget__mute"
			onclick={() => conversation.toggleMute()}
			disabled={!connected}
			aria-pressed={conversation.isMuted}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
				<path d="M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V22M8.5 22h7"></path>
				{#if conversation.isMuted}
					<path d="M4 4 20 20" class="se-widget__slash"></path>
				{/if}
			</svg>
			{conversation.isMuted ? 'Unmute' : 'Mute'}
		</button>
	</div>

	{#if conversation.conversationId}
		<p class="se-widget__session-id">
			<span>Conversation</span>
			<span>{shortId(conversation.conversationId)}</span>
			<span>{signed ? 'Signed' : 'Public'}</span>
		</p>
	{/if}
</section>

<style>
	.se-widget {
		--se-widget-bg: var(--se-panel, #12120f);
		--se-widget-raised: var(--se-panel-raised, #1b1a16);
		--se-widget-ink: var(--se-ink, #f1eadb);
		--se-widget-muted: var(--se-muted, rgba(241, 234, 219, 0.56));
		--se-widget-line: var(--se-line, rgba(241, 234, 219, 0.14));
		--se-widget-accent: var(--se-signal, #ff5d2b);
		--se-widget-live: var(--se-agent, #cdf66c);
		--se-widget-font-display: var(
			--se-font-display,
			'Bricolage Grotesque Variable',
			ui-sans-serif,
			system-ui,
			sans-serif
		);
		--se-widget-font-mono: var(
			--se-font-mono,
			'Azeret Mono Variable',
			ui-monospace,
			'SFMono-Regular',
			monospace
		);

		display: grid;
		gap: 1.05rem;
		padding: clamp(1rem, 2.2vw, 1.55rem);
		border: 1px solid var(--se-widget-line);
		border-radius: var(--se-widget-radius, 4px);
		background: var(--se-widget-bg);
		color: var(--se-widget-ink);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 20px 50px rgba(0, 0, 0, 0.18);
		font-family: var(--se-widget-font-display);
		isolation: isolate;
		min-width: 0;
	}

	.se-widget__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.se-widget__identity {
		display: flex;
		align-items: center;
		gap: 0.72rem;
		min-width: 0;
	}

	.se-widget__glyph {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2px;
		width: 2rem;
		height: 2rem;
		padding: 0.4rem;
		flex: 0 0 auto;
		border: 1px solid var(--se-widget-line);
		background: var(--se-widget-raised);
	}

	.se-widget__glyph span {
		display: block;
		width: 2px;
		background: var(--se-widget-accent);
	}

	.se-widget__glyph span:nth-child(1) {
		height: 35%;
	}
	.se-widget__glyph span:nth-child(2) {
		height: 85%;
	}
	.se-widget__glyph span:nth-child(3) {
		height: 55%;
	}
	.se-widget__glyph span:nth-child(4) {
		height: 100%;
		background: var(--se-widget-live);
	}

	.se-widget__eyebrow {
		margin: 0 0 0.12rem;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.55rem;
		font-weight: 560;
		letter-spacing: 0.12em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-size: clamp(1.15rem, 2.2vw, 1.42rem);
		font-weight: 650;
		letter-spacing: -0.035em;
		line-height: 1.1;
	}

	.se-widget__status {
		display: flex;
		align-items: center;
		gap: 0.42rem;
		flex: 0 0 auto;
		margin: 0;
		padding: 0.34rem 0.55rem;
		border: 1px solid var(--se-widget-line);
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.54rem;
		font-weight: 560;
		letter-spacing: 0.09em;
		line-height: 1;
		text-transform: uppercase;
	}

	.se-widget__status--connected {
		color: var(--se-widget-live);
	}

	.se-widget__status--connecting {
		color: var(--se-widget-accent);
	}

	.se-widget__lamp {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--se-widget-muted);
	}

	.se-widget__lamp[data-tone='live'] {
		background: var(--se-widget-live);
		box-shadow: 0 0 9px color-mix(in srgb, var(--se-widget-live) 70%, transparent);
		animation: se-pulse 2.2s ease-in-out infinite;
	}

	.se-widget__lamp[data-tone='waiting'] {
		background: var(--se-widget-accent);
		animation: se-pulse 1s ease-in-out infinite;
	}

	.se-widget__lamp[data-tone='fault'] {
		background: #ff8b6b;
	}

	.se-widget__subtitle {
		margin: -0.55rem 0 0;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.01em;
		line-height: 1.5;
	}

	.se-widget__error {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 0.8rem;
		border-left: 3px solid #ff8b6b;
		background: color-mix(in srgb, #ff8b6b 8%, transparent);
	}

	.se-widget__error p {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.se-widget__error-title {
		margin-bottom: 0.16rem !important;
		color: #ffb49d;
		font-family: var(--se-widget-font-mono);
		font-size: 0.55rem !important;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.se-widget__error-dismiss {
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--se-widget-ink);
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
	}

	.se-widget__visualizer {
		min-width: 0;
	}

	.se-widget__telemetry {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
		border-top: 1px solid var(--se-widget-line);
		border-bottom: 1px solid var(--se-widget-line);
	}

	.se-widget__telemetry > div {
		min-width: 0;
		padding: 0.58rem 0.7rem 0.6rem 0;
	}

	.se-widget__telemetry > div + div {
		padding-left: 0.7rem;
		border-left: 1px solid var(--se-widget-line);
	}

	.se-widget__telemetry dt {
		margin-bottom: 0.18rem;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.11em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.se-widget__telemetry dd {
		overflow: hidden;
		margin: 0;
		font-family: var(--se-widget-font-mono);
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.se-widget__log-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: -0.5rem;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.54rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.se-widget__log-actions {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
	}

	.se-widget__text-button {
		padding: 0;
		border: 0;
		border-bottom: 1px solid currentColor;
		background: transparent;
		color: var(--se-widget-ink);
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
		line-height: 1.2;
		text-transform: inherit;
	}

	.se-widget__transcript {
		position: relative;
		max-height: 13.5rem;
		min-height: 6.8rem;
		overflow-y: auto;
		padding: 0.75rem 0.85rem 0.4rem;
		border: 1px solid var(--se-widget-line);
		background:
			repeating-linear-gradient(
				to bottom,
				transparent 0,
				transparent 25px,
				color-mix(in srgb, var(--se-widget-line) 45%, transparent) 26px
			),
			rgba(0, 0, 0, 0.16);
		scrollbar-color: color-mix(in srgb, var(--se-widget-muted) 45%, transparent) transparent;
		scrollbar-width: thin;
	}

	.se-widget__transcript:focus-visible {
		outline: 2px solid var(--se-widget-accent, var(--se-agent, #cdf66c));
		outline-offset: -3px;
	}

	.se-widget__empty {
		display: grid;
		gap: 0.18rem;
		margin: 0;
		max-width: 31rem;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.62rem;
		line-height: 1.6;
	}

	.se-widget__empty span {
		color: var(--se-widget-ink);
		font-weight: 550;
	}

	.se-widget__message {
		padding: 0.28rem 0 0.6rem;
	}

	.se-widget__message + .se-widget__message {
		border-top: 1px solid color-mix(in srgb, var(--se-widget-line) 65%, transparent);
	}

	.se-widget__message-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.16rem;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.se-widget__message[data-role='agent'] .se-widget__message-meta span:first-child {
		color: var(--se-widget-live);
	}

	.se-widget__message[data-role='user'] .se-widget__message-meta span:first-child {
		color: var(--se-widget-accent);
	}

	.se-widget__message p {
		margin: 0;
		color: var(--se-widget-ink);
		font-size: 0.83rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}

	.se-widget__caret {
		display: inline-block;
		width: 0.42em;
		height: 0.9em;
		margin-left: 0.18em;
		background: var(--se-widget-live);
		vertical-align: -0.1em;
		animation: se-blink 0.9s steps(1) infinite;
	}

	.se-widget__controls {
		display: flex;
		align-items: flex-end;
		gap: 0.65rem;
	}

	.se-widget__field {
		display: grid;
		gap: 0.32rem;
		flex: 1 1 auto;
		min-width: 0;
	}

	.se-widget__field span {
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.se-widget__field input {
		width: 100%;
		min-width: 0;
		height: 2.55rem;
		padding: 0 0.7rem;
		border: 1px solid var(--se-widget-line);
		border-radius: 0;
		outline: 0;
		background: var(--se-widget-raised);
		color: var(--se-widget-ink);
		font-family: var(--se-widget-font-mono);
		font-size: 0.7rem;
		line-height: 1;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.se-widget__field input::placeholder {
		color: color-mix(in srgb, var(--se-widget-muted) 72%, transparent);
	}

	.se-widget__field input:focus-visible {
		border-color: var(--se-widget-accent);
		background: color-mix(in srgb, var(--se-widget-raised) 82%, var(--se-widget-accent));
	}

	.se-widget__field input:disabled {
		opacity: 0.55;
	}

	.se-widget__primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex: 0 0 auto;
		height: 2.55rem;
		padding: 0 1rem;
		border: 1px solid color-mix(in srgb, var(--se-widget-accent) 80%, black);
		border-radius: 0;
		background: var(--se-widget-accent);
		color: #14110d;
		cursor: pointer;
		font-family: var(--se-widget-font-mono);
		font-size: 0.58rem;
		font-weight: 650;
		letter-spacing: 0.07em;
		line-height: 1;
		text-transform: uppercase;
		transition:
			transform 120ms ease,
			background-color 140ms ease;
	}

	.se-widget__primary:hover {
		background: color-mix(in srgb, var(--se-widget-accent) 82%, white);
	}

	.se-widget__primary:active {
		transform: translateY(1px);
	}

	.se-widget__primary:focus-visible,
	.se-widget__mute:focus-visible,
	.se-widget__text-button:focus-visible,
	.se-widget__error-dismiss:focus-visible {
		outline: 2px solid var(--se-widget-live);
		outline-offset: 2px;
	}

	.se-widget__primary--stop {
		background: transparent;
		color: var(--se-widget-accent);
		border-color: color-mix(in srgb, var(--se-widget-accent) 48%, transparent);
	}

	.se-widget__primary--stop:hover {
		background: color-mix(in srgb, var(--se-widget-accent) 12%, transparent);
	}

	.se-widget__primary-lamp {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: currentColor;
	}

	.se-widget__primary[aria-busy='true'] .se-widget__primary-lamp {
		animation: se-blink 0.8s steps(1) infinite;
	}

	.se-widget__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 1.7rem;
	}

	.se-widget__footer p {
		max-width: 32rem;
		margin: 0;
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.58rem;
		line-height: 1.55;
	}

	.se-widget__mute {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		flex: 0 0 auto;
		padding: 0.32rem 0.55rem;
		border: 1px solid var(--se-widget-line);
		border-radius: 0;
		background: transparent;
		color: var(--se-widget-muted);
		cursor: pointer;
		font-family: var(--se-widget-font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}

	.se-widget__mute:hover:not(:disabled) {
		border-color: var(--se-widget-muted);
		color: var(--se-widget-ink);
	}

	.se-widget__mute:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}

	.se-widget__mute svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.4;
	}

	.se-widget__slash {
		stroke: var(--se-widget-accent);
	}

	.se-widget__session-id {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: -0.35rem 0 0;
		padding-top: 0.65rem;
		border-top: 1px solid var(--se-widget-line);
		color: var(--se-widget-muted);
		font-family: var(--se-widget-font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	@keyframes se-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}

	@keyframes se-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}

	@media (max-width: 560px) {
		.se-widget__telemetry {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.se-widget__telemetry > div:nth-child(3) {
			padding-left: 0;
			border-left: 0;
			border-top: 1px solid var(--se-widget-line);
		}

		.se-widget__telemetry > div:nth-child(4) {
			border-top: 1px solid var(--se-widget-line);
		}

		.se-widget__controls {
			flex-direction: column;
			align-items: stretch;
		}

		.se-widget__primary {
			width: 100%;
		}

		.se-widget__footer {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.6rem;
		}

		.se-widget__status {
			font-size: 0;
			gap: 0;
			padding: 0.42rem;
		}

		.se-widget__status .se-widget__lamp {
			width: 7px;
			height: 7px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.se-widget__lamp,
		.se-widget__primary-lamp,
		.se-widget__caret {
			animation: none;
		}
	}
</style>
