<script lang="ts">
	import { PUBLIC_ELEVENLABS_AGENT_ID } from '$app/env/public';
	import { AudioManager, AudioVisualizer, useConversation } from '#lib';

	const configuredAgentId = (PUBLIC_ELEVENLABS_AGENT_ID ?? '').trim();
	const installCommand = 'bun add svelte-elevenlabs';

	const conversation = useConversation({
		agentId: configuredAgentId,
		maxTranscripts: 100
	});

	let agentId = $state(configuredAgentId);
	let authMode = $state<'signed' | 'public'>('signed');
	let elapsed = $state(0);
	// Browser capability can only be probed after hydration; deriving during SSR mismatches markup.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let audioSupport = $state<'checking' | 'supported' | 'unsupported'>('checking');
	let transcriptEl = $state<HTMLDivElement | null>(null);
	let pinnedToBottom = true;
	let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	const active = $derived(conversation.status !== 'disconnected');
	const connected = $derived(conversation.status === 'connected');
	const statusText = $derived.by(() => {
		if (conversation.queueStatus === 'waiting') return 'Queued';
		if (conversation.status === 'connecting') return 'Dialing';
		if (conversation.status === 'disconnected') return conversation.error ? 'Fault' : 'Standby';
		if (conversation.isSpeaking) return 'Agent speaking';
		if (conversation.isUserSpeaking) return 'Listening to you';
		return 'Line open';
	});
	const statusTone = $derived.by(() => {
		if (conversation.queueStatus === 'waiting') return 'waiting';
		if (connected) return 'live';
		if (conversation.status === 'connecting') return 'connecting';
		if (conversation.error) return 'fault';
		return 'idle';
	});
	const primaryLabel = $derived(
		conversation.status === 'connected'
			? 'End session'
			: conversation.status === 'connecting'
				? 'Cancel handshake'
				: 'Start session'
	);
	const primaryHint = $derived(
		conversation.status === 'connected'
			? 'Live · speak freely'
			: conversation.status === 'connecting'
				? 'Negotiating formats'
				: 'Mic permission on press'
	);
	const helperText = $derived.by(() => {
		if (audioSupport === 'unsupported') {
			return 'This browser cannot open the Web Audio + microphone APIs required for a call.';
		}
		if (conversation.status === 'connected') {
			return conversation.isMuted
				? 'Your microphone is muted. The agent can still speak; unmute to reply.'
				: 'Your microphone is live. Start speaking at any time — barge-in flushes agent audio.';
		}
		if (conversation.status === 'connecting') {
			return 'Hold the line. Microphone, signed URL, and WebSocket metadata are being prepared.';
		}
		if (authMode === 'signed') {
			return 'The server exchanges the agent id for a short-lived signed URL. The API key never enters the browser.';
		}
		return 'Public ids connect directly to ElevenLabs. Prefer signed URLs when the agent is not public.';
	});
	const elapsedLabel = $derived(formatClock(elapsed));
	const latencyLabel = $derived(
		conversation.latency === null ? '—' : `${conversation.latency.toLocaleString()} ms`
	);
	const formatIn = $derived(formatFormat(conversation.inputAudioFormat));
	const formatOut = $derived(formatFormat(conversation.outputAudioFormat));
	const sessionCode = $derived(shortId(conversation.conversationId));
	const latencyMax = $derived(Math.max(300, ...conversation.latencyHistory));
	const latencyHeights = $derived.by(() => {
		const slots = 18;
		const history = conversation.latencyHistory;
		const offset = Math.max(0, slots - history.length);
		return Array.from({ length: slots }, (_, index) => {
			const value = history[index - offset];
			return value === undefined ? 4 : Math.max(8, Math.round((value / latencyMax) * 100));
		});
	});
	const startDisabled = $derived(
		conversation.status === 'disconnected' && (!agentId.trim() || audioSupport === 'unsupported')
	);

	$effect(() => {
		audioSupport = AudioManager.isSupported() ? 'supported' : 'unsupported';
	});

	$effect(() => {
		if (conversation.status !== 'connected') {
			elapsed = 0;
			return;
		}

		const startedAt = Date.now();
		const timer = setInterval(() => {
			elapsed = Math.floor((Date.now() - startedAt) / 1_000);
		}, 1_000);

		return () => clearInterval(timer);
	});

	$effect(() => {
		const count = conversation.transcripts.length;
		const tail = count > 0 ? conversation.transcripts[count - 1] : null;
		void tail?.text;
		void tail?.isFinal;

		if (!transcriptEl || !pinnedToBottom) return;
		transcriptEl.scrollTop = transcriptEl.scrollHeight;
	});

	$effect(() => {
		return () => {
			if (copyTimer) clearTimeout(copyTimer);
		};
	});

	function startOrStop(): void {
		if (conversation.status !== 'disconnected') {
			conversation.stopConversation();
			return;
		}

		const target = agentId.trim();
		if (!target) return;

		pinnedToBottom = true;
		void conversation.startConversation(target, { signed: authMode === 'signed' });
	}

	function handleLogScroll(): void {
		if (!transcriptEl) return;
		const distance = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight;
		pinnedToBottom = distance < 48;
	}

	function clearLog(): void {
		conversation.clearTranscripts();
		pinnedToBottom = true;
	}

	async function copyInstall(): Promise<void> {
		try {
			await navigator.clipboard.writeText(installCommand);
			copyState = 'copied';
		} catch {
			copyState = 'failed';
		}

		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copyState = 'idle';
			copyTimer = null;
		}, 2_000);
	}

	function formatClock(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const seconds = (totalSeconds % 60).toString().padStart(2, '0');
		return `${minutes}:${seconds}`;
	}

	function formatFormat(format: string | null): string {
		if (!format) return '—';
		return format.replace('pcm_', '').replace('ulaw_', 'µ-law ');
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function shortId(id: string | null): string {
		if (!id) return '—';
		return id.length > 13 ? `${id.slice(0, 9)}…${id.slice(-3)}` : id;
	}

	function errorLabel(code: string | null): string {
		return code ? code.replaceAll('-', ' ') : 'connection issue';
	}
</script>

{#snippet brandMark()}
	<span class="brand-mark" aria-hidden="true">
		<svg viewBox="0 0 32 32" focusable="false">
			<path d="M7 23V16M12 23V9M17 23V12M22 23V6M27 23V18" />
			<path d="M5 26.5h22" />
		</svg>
	</span>
{/snippet}

<svelte:head>
	<title>svelte-elevenlabs — give your interface a voice</title>
	<meta
		name="description"
		content="An independent Svelte 5 library and starter kit for ElevenLabs Conversational AI, with signed URLs, low-latency audio, and zero-leak cleanup."
	/>
</svelte:head>

<a class="skip-link" href="#console">Skip to the live console</a>

<div id="top" class="page">
	<header class="masthead page-wrap">
		<a class="brand" href="#top" aria-label="svelte-elevenlabs, back to top">
			{@render brandMark()}
			<span class="brand__name">
				<span>svelte</span><span class="brand__slash">/</span><span>elevenlabs</span>
			</span>
		</a>

		<nav class="masthead__nav" aria-label="Page sections">
			<a href="#console">Console</a>
			<a href="#architecture">Architecture</a>
			<a href="#install">Install</a>
			<a href="#api">API</a>
		</nav>

		<div class="masthead__meta">
			<span class="masthead__version">v0.1.0</span>
			<span class="masthead__flag">Community build</span>
		</div>
	</header>

	<main>
		<section class="hero page-wrap" aria-labelledby="hero-title">
			<div class="hero__copy">
				<p class="hero__kicker">
					<span class="hero__kicker-line" aria-hidden="true"></span>
					Voice I/O for Svelte 5
				</p>

				<h1 id="hero-title">
					Give your
					<span class="hero__line">interface <em>a voice.</em></span>
				</h1>

				<p class="hero__lede">
					A production-minded SvelteKit library for ElevenLabs Conversational AI. One rune opens a
					low-latency audio line, keeps state reactive, and closes every resource when the component
					leaves the room.
				</p>

				<div class="hero__actions">
					<a class="button button--ink" href="#console">
						<span>Open the console</span>
						<span class="button__arrow" aria-hidden="true">↘</span>
					</a>
					<a class="text-link" href="#install">
						Read the install
						<span aria-hidden="true">→</span>
					</a>
				</div>

				<ul class="hero__facts" aria-label="Library highlights">
					<li><strong>Svelte 5</strong><span>runes · SSR-safe</span></li>
					<li><strong>Signed URLs</strong><span>key stays server-side</span></li>
					<li><strong>16–24 kHz</strong><span>PCM · AudioWorklet</span></li>
				</ul>
			</div>

			<aside class="spec" aria-label="Library specification">
				<span class="spec__screw spec__screw--tl" aria-hidden="true"></span>
				<span class="spec__screw spec__screw--br" aria-hidden="true"></span>

				<div class="spec__top">
					<span>Unit spec</span>
					<span>SE—01</span>
				</div>

				<div class="spec__wave" aria-hidden="true">
					{#each [38, 64, 48, 92, 100, 62, 36, 74, 88, 44, 28, 52, 70, 24] as bar (bar)}
						<span style:height={`${bar}%`}></span>
					{/each}
				</div>

				<dl class="spec__list">
					<div>
						<dt>Runtime</dt>
						<dd>Bun 1.4+</dd>
					</div>
					<div>
						<dt>Reactivity</dt>
						<dd>Svelte 5 runes</dd>
					</div>
					<div>
						<dt>Transport</dt>
						<dd>WSS / ConvAI</dd>
					</div>
					<div>
						<dt>Capture</dt>
						<dd>PCM16 · resampled</dd>
					</div>
					<div>
						<dt>Cleanup</dt>
						<dd>$effect teardown</dd>
					</div>
					<div>
						<dt>License</dt>
						<dd>MIT</dd>
					</div>
				</dl>

				<div class="spec__footer">
					<span>Status</span>
					<strong>0.1 / experimental</strong>
				</div>

				<p class="spec__note">
					An unofficial, community-maintained bridge. No telemetry. No hidden client key.
				</p>

				<span class="spec__stamp" aria-hidden="true">Community<br />build</span>
			</aside>
		</section>

		<div class="data-strip">
			<div class="page-wrap data-strip__inner">
				<span>01 / LOW LATENCY</span>
				<span>02 / BARGE-IN READY</span>
				<span>03 / ZERO LEAKS</span>
				<span>04 / BUN + SVELTEKIT</span>
				<span class="data-strip__badge">MIT</span>
			</div>
		</div>

		<section id="console" class="console-section page-wrap" aria-labelledby="console-title">
			<header class="section-head">
				<p class="section-head__tag"><span>01</span> Live console</p>
				<h2 id="console-title">Talk to the machine.</h2>
				<p class="section-head__copy">
					Point the console at a public agent id or let the server mint a signed URL. Your
					microphone opens only after you press start.
				</p>
			</header>

			<div class="console">
				<div class="console__titlebar">
					<div class="console__brandline">
						<span class="console__lamp" data-tone={statusTone} aria-hidden="true"></span>
						<span>SEL—01 / Signal console</span>
					</div>
					<div class="console__channel">
						<span>CH 01</span>
						<span class="console__serial">{sessionCode}</span>
					</div>
					<div class="console__auth">
						<span>{authMode === 'signed' ? 'SIGNED' : 'PUBLIC'}</span>
						<span class="console__auth-key" aria-hidden="true"></span>
					</div>
				</div>

				<div class="console__body">
					<div class="console__display">
						<div class="display__head">
							<div class="display__status" data-tone={statusTone}>
								<span class="display__status-lamp" aria-hidden="true"></span>
								<span role="status" aria-live="polite">{statusText}</span>
							</div>
							<div class="display__clock">
								<span>T+</span>
								<span>{elapsedLabel}</span>
							</div>
						</div>

						<AudioVisualizer
							{conversation}
							height={212}
							label="Live microphone and agent room tone"
						/>

						<dl class="readouts" aria-label="Session telemetry">
							<div>
								<dt>First audio</dt>
								<dd class="readouts__signal">{latencyLabel}</dd>
							</div>
							<div>
								<dt>You / in</dt>
								<dd>{formatIn}</dd>
							</div>
							<div>
								<dt>Agent / out</dt>
								<dd>{formatOut}</dd>
							</div>
							<div>
								<dt>Turns</dt>
								<dd>{conversation.messageCount.toString().padStart(2, '0')}</dd>
							</div>
							<div>
								<dt>Barge-ins</dt>
								<dd>{conversation.interruptions.toString().padStart(2, '0')}</dd>
							</div>
						</dl>

						{#if conversation.queueStatus === 'waiting'}
							<p class="queue-note">
								<span class="queue-note__lamp" aria-hidden="true"></span>
								Agent at capacity. Holding your place in the queue.
							</p>
						{/if}
					</div>

					<aside class="console__controls" aria-label="Conversation controls">
						<div class="controls__top">
							<span>Connection</span>
							<span>{authMode === 'signed' ? '/ API' : '/ DIRECT'}</span>
						</div>

						<form
							class="control-form"
							onsubmit={(event) => {
								event.preventDefault();
								startOrStop();
							}}
						>
							<label class="target" for="agent-target">
								<span class="target__label">
									<span>Target feed</span>
									<span class="target__mode">
										{authMode === 'signed' ? 'server exchange' : 'public agent'}
									</span>
								</span>
								<span class="target__field">
									<span class="target__prompt" aria-hidden="true">›</span>
									<input
										id="agent-target"
										type="text"
										bind:value={agentId}
										placeholder="agent_… or wss://…"
										autocomplete="off"
										autocapitalize="off"
										spellcheck="false"
										disabled={active}
										aria-describedby="target-help"
									/>
								</span>
							</label>

							<fieldset class="auth" disabled={active}>
								<legend>Credential route</legend>
								<div class="auth__options">
									<label class="auth__option" class:is-active={authMode === 'signed'}>
										<input type="radio" name="auth-mode" value="signed" bind:group={authMode} />
										<span class="auth__radio" aria-hidden="true"></span>
										<span>
											<strong>Signed URL</strong>
											<small>server route</small>
										</span>
									</label>
									<label class="auth__option" class:is-active={authMode === 'public'}>
										<input type="radio" name="auth-mode" value="public" bind:group={authMode} />
										<span class="auth__radio" aria-hidden="true"></span>
										<span>
											<strong>Public ID</strong>
											<small>direct socket</small>
										</span>
									</label>
								</div>
							</fieldset>

							<button
								type="submit"
								class="connect"
								class:connect--active={active}
								disabled={startDisabled}
								aria-busy={conversation.status === 'connecting'}
							>
								<span class="connect__icon" aria-hidden="true">
									{#if conversation.status === 'connected'}
										<span class="connect__stop"></span>
									{:else if conversation.status === 'connecting'}
										<span class="connect__wait"></span>
									{:else}
										<span class="connect__play"></span>
									{/if}
								</span>
								<span class="connect__copy">
									<strong>{primaryLabel}</strong>
									<small>{primaryHint}</small>
								</span>
								<span class="connect__arrow" aria-hidden="true">
									{active ? '×' : '↗'}
								</span>
							</button>
						</form>

						<p id="target-help" class="control-help">{helperText}</p>

						{#if conversation.error}
							<div class="console-error" role="alert">
								<span class="console-error__mark" aria-hidden="true">!</span>
								<div>
									<p class="console-error__label">{errorLabel(conversation.errorCode)}</p>
									<p>{conversation.error}</p>
								</div>
								<button
									type="button"
									class="icon-button"
									aria-label="Dismiss error"
									onclick={() => conversation.clearError()}
								>
									×
								</button>
							</div>
						{/if}

						<div class="control-divider" aria-hidden="true"></div>

						<div class="utility-row">
							<button
								type="button"
								class="utility"
								disabled={!connected}
								aria-pressed={conversation.isMuted}
								onclick={() => conversation.toggleMute()}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
									<path d="M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V22M8.5 22h7"></path>
									{#if conversation.isMuted}
										<path class="utility__slash" d="M4 4 20 20"></path>
									{/if}
								</svg>
								<span>{conversation.isMuted ? 'Mic muted' : 'Mute mic'}</span>
							</button>

							<button
								type="button"
								class="utility"
								disabled={conversation.messageCount === 0}
								onclick={clearLog}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path>
								</svg>
								<span>Clear log</span>
							</button>
						</div>

						<div class="latency">
							<div class="latency__head">
								<span>First-audio latency</span>
								<span>{latencyLabel}</span>
							</div>
							<div class="latency__bars" aria-hidden="true">
								{#each latencyHeights as height, index (index)}
									<span
										style:height={`${height}%`}
										data-latest={index === latencyHeights.length - 1}
									></span>
								{/each}
							</div>
							<div class="latency__foot">
								<span>Turn → sound</span>
								<span>{conversation.latencyHistory.length} readings</span>
							</div>
						</div>
					</aside>
				</div>

				<div class="printer">
					<div class="printer__head">
						<div class="printer__title">
							<span class="printer__lamp" data-live={active} aria-hidden="true"></span>
							<span>Transcript printer / CH 01</span>
						</div>
						<span class="printer__count">
							{conversation.messageCount}
							{conversation.messageCount === 1 ? 'entry' : 'entries'}
						</span>
						<span class="printer__meta">live · partials supported</span>
					</div>

					<!-- Keyboard users must be able to scroll the live transcript. -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						class="printer__paper"
						bind:this={transcriptEl}
						onscroll={handleLogScroll}
						role="log"
						aria-label="Conversation transcript"
						aria-live="polite"
						tabindex="0"
					>
						{#if conversation.transcripts.length === 0}
							<div class="printer__empty">
								<span class="printer__cross" aria-hidden="true">+</span>
								<div>
									<p>
										{active
											? 'The line is open. The first turn will print here.'
											: 'The line is quiet. Press start, grant the microphone, and talk.'}
									</p>
									<p class="printer__small">
										Agent text may stream in word by word. Corrections replace the same entry.
									</p>
								</div>
							</div>
						{:else}
							{#each conversation.transcripts as message (message.id)}
								<article class="printer__entry" data-role={message.role}>
									<div class="printer__entry-meta">
										<span>{message.role === 'user' ? 'You' : 'Agent'}</span>
										<span>{formatTime(message.timestamp)}</span>
									</div>
									<p>
										{message.text}{#if !message.isFinal}<span
												class="printer__caret"
												aria-hidden="true"
											></span>{/if}
									</p>
								</article>
							{/each}
						{/if}
					</div>
				</div>

				<div class="console__footer">
					<span>Web Audio / AudioWorklet</span>
					<span class="console__footer-signal" data-on={connected}>PCM16 / STREAM</span>
					<span class="console__footer-spacer"></span>
					<span>SEL—01</span>
					<span class="console__footer-dim">No client key</span>
				</div>
			</div>
		</section>

		<section id="architecture" class="architecture" aria-labelledby="architecture-title">
			<div class="page-wrap">
				<header class="section-head section-head--architecture">
					<p class="section-head__tag"><span>02</span> Under the hood</p>
					<h2 id="architecture-title">A short path from<br />click to conversation.</h2>
					<p class="section-head__copy">
						The rune owns the socket, the audio graph, and the teardown. Your component owns the
						interface.
					</p>
				</header>

				<div class="architecture__grid">
					<ol class="steps">
						<li>
							<span class="steps__num">01</span>
							<div>
								<h3>Prepare inside the gesture</h3>
								<p>
									Microphone permission and both AudioContexts start in the click handler, avoiding
									autoplay gates. Then the URL is resolved and the socket opens with the <code
										>convai</code
									> subprotocol.
								</p>
							</div>
						</li>
						<li>
							<span class="steps__num">02</span>
							<div>
								<h3>Stream up</h3>
								<p>
									A worklet captures ~100 ms chunks. They are low-pass filtered, resampled to the
									negotiated rate, encoded as PCM16 little-endian base64, and sent as <code
										>user_audio_chunk</code
									>.
								</p>
							</div>
						</li>
						<li>
							<span class="steps__num">03</span>
							<div>
								<h3>Schedule down</h3>
								<p>
									Agent chunks are decoded onto one playback clock. The
									<code>AnalyserNode</code> feeds the spectrum; local or server barge-in flushes every
									queued source with a 12 ms gain ramp.
								</p>
							</div>
						</li>
						<li>
							<span class="steps__num">04</span>
							<div>
								<h3>Leave nothing running</h3>
								<p>
									An <code>$effect</code> teardown closes the socket, stops media tracks, disconnects
									the graph, revokes worklet URLs, closes both contexts, and clears every timer.
								</p>
							</div>
						</li>
					</ol>

					<div class="schematic">
						<div class="schematic__head">
							<span>Fig. 01 / Signal path</span>
							<span>WSS · CONVAI</span>
						</div>

						<div
							class="diagram"
							role="img"
							aria-label="Architecture diagram. A Svelte component calls useConversation, which opens a WebSocket to ElevenLabs and drives AudioWorklet capture and scheduled playback. In signed mode a SvelteKit API route exchanges the agent id for a short-lived URL using the server API key."
						>
							<div class="diagram__column">
								<span class="diagram__label">YOUR APP</span>
								<div class="node">
									<span class="node__pin" aria-hidden="true"></span>
									<strong>Svelte 5 UI</strong>
									<small>status · transcript · controls</small>
								</div>
								<div class="diagram__wire">
									<span></span>
									<small>useConversation()</small>
								</div>
								<div class="node node--orange">
									<span class="node__pin" aria-hidden="true"></span>
									<strong>ConversationController</strong>
									<small>socket · parser · cleanup</small>
								</div>
								<div class="diagram__wire">
									<span></span>
									<small>audio + events</small>
								</div>
								<div class="diagram__duo">
									<div>AudioWorklet<small>capture</small></div>
									<div>Playback clock<small>schedulers</small></div>
								</div>
							</div>

							<div class="diagram__bridge" aria-hidden="true">
								<span>wss</span>
								<i>→</i>
								<i>←</i>
								<span>pcm</span>
							</div>

							<div class="diagram__column">
								<span class="diagram__label">ELEVENLABS</span>
								<div class="node node--lime">
									<span class="node__pin" aria-hidden="true"></span>
									<strong>Conversational agent</strong>
									<small>ASR · LLM · TTS</small>
								</div>
								<div class="diagram__wire diagram__wire--dashed">
									<span></span>
									<small>metadata / transcripts</small>
								</div>
								<div class="node">
									<span class="node__pin" aria-hidden="true"></span>
									<strong>Streaming audio</strong>
									<small>PCM / µ-law chunks</small>
								</div>
							</div>
						</div>

						<div class="signed-route">
							<span class="signed-route__label">Signed mode</span>
							<span>Browser</span>
							<span class="signed-route__arrow" aria-hidden="true">→</span>
							<span class="signed-route__box">/api/signed-url</span>
							<span class="signed-route__arrow" aria-hidden="true">→</span>
							<span class="signed-route__key">xi-api-key</span>
							<span>ElevenLabs</span>
						</div>

						<div class="schematic__foot">
							<span><i aria-hidden="true"></i> Client-side latency</span>
							<span><i class="schematic__foot-lime" aria-hidden="true"></i> Server-only key</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section id="install" class="install" aria-labelledby="install-title">
			<div class="page-wrap">
				<header class="section-head section-head--dark">
					<p class="section-head__tag"><span>03</span> Install &amp; start</p>
					<h2 id="install-title">Five lines to<br />a first sentence.</h2>
					<p class="section-head__copy">
						Add the package, give the rune an agent, and let Svelte handle the rest. The demo below
						uses signed mode; it needs one server secret.
					</p>
				</header>

				<div class="install__grid">
					<div class="install__left">
						<div class="install__step">
							<div class="install__step-head">
								<span>01</span>
								<span>Install with Bun 1.4+</span>
							</div>
							<div class="command">
								<code>{installCommand}</code>
								<button type="button" class="command__copy" onclick={copyInstall}>
									{copyState === 'copied'
										? 'Copied'
										: copyState === 'failed'
											? 'Copy failed'
											: 'Copy'}
								</button>
							</div>
							<p>
								Peer dependency: Svelte 5. The library is ESM-only and publishes its TypeScript
								surface.
							</p>
						</div>

						<div class="install__step">
							<div class="install__step-head">
								<span>02</span>
								<span>Keep the secret on the server</span>
							</div>
							<pre class="env"><code
									><span class="code-comment"># .env — never expose this through PUBLIC_*</span>
ELEVENLABS_API_KEY=your_key_here
<span class="code-comment"># optional demo prefill</span>
PUBLIC_ELEVENLABS_AGENT_ID=agent_your_id</code
								></pre>
							<p>
								The included SvelteKit route reads <code>process.env</code> and returns only a short-lived
								signed URL.
							</p>
						</div>

						<div class="install__step">
							<div class="install__step-head">
								<span>03</span>
								<span>Run it</span>
							</div>
							<pre class="env"><code
									>bun install
bun run dev</code
								></pre>
							<p>
								Open the console on <code>localhost</code> or HTTPS. Microphone access is blocked in insecure
								contexts by design.
							</p>
						</div>
					</div>

					<div class="quickstart">
						<div class="quickstart__top">
							<span>Quickstart</span>
							<span>SVELTE 5 / RUNES</span>
						</div>
						<pre class="quickstart__code"><code
								><span class="code-tag">&lt;script lang="ts"&gt;</span>
  <span class="code-keyword">import</span> &#123; useConversation &#125; <span class="code-keyword"
									>from</span
								> <span class="code-string">'svelte-elevenlabs'</span>;
  <span class="code-keyword">const</span> conversation = <span class="code-function"
									>useConversation</span
								>(&#123; agentId: <span class="code-string">'agent_…'</span> &#125;);
<span class="code-tag">&lt;/script&gt;</span>
<span class="code-tag">&lt;button</span
								> onclick=&#123;() =&gt; conversation.startConversation()&#125;<span
									class="code-tag">&gt;</span
								>Talk<span class="code-tag">&lt;/button&gt;</span></code
							></pre>
						<div class="quickstart__foot">
							<p>
								State is plain Svelte reactivity: read <code>conversation.status</code>,
								<code>transcripts</code>, and <code>volume</code> directly in markup.
							</p>
							<a class="text-link text-link--light" href="#api">API map <span>↓</span></a>
						</div>
						<div class="quickstart__sticker" aria-hidden="true">
							<span>5</span>
							<small>lines to<br />lift off</small>
						</div>
					</div>
				</div>

				<div class="install__note">
					<span class="install__note-mark" aria-hidden="true">i</span>
					<p>
						When using <code>ConversationWidget</code> in your own Tailwind app, add
						<code>@source '../node_modules/svelte-elevenlabs/dist';</code> to your stylesheet so utility
						classes can be discovered. Scoped component styles do not require it.
					</p>
				</div>
			</div>
		</section>

		<section id="api" class="api page-wrap" aria-labelledby="api-title">
			<header class="section-head">
				<p class="section-head__tag"><span>04</span> API map</p>
				<h2 id="api-title">Small surface.<br />Deep control.</h2>
				<p class="section-head__copy">
					The core rune exposes the six reactive values and three lifecycle methods the interface
					needs. Everything else is an optional extension.
				</p>
			</header>

			<div class="api__grid">
				<div class="api__panel">
					<div class="api__panel-head">
						<span>Reactive state</span>
						<span>Read-only from markup</span>
					</div>
					<dl class="api__list">
						<div>
							<dt><code>status</code></dt>
							<dd><span class="type">"disconnected" | "connecting" | "connected"</span></dd>
						</div>
						<div>
							<dt><code>isSpeaking</code></dt>
							<dd>Agent playback is scheduled or audible.</dd>
						</div>
						<div>
							<dt><code>isListening</code></dt>
							<dd>Microphone is live and the agent can hear it.</dd>
						</div>
						<div>
							<dt><code>volume</code></dt>
							<dd><span class="type">number</span> — combined level, 0–1.</dd>
						</div>
						<div>
							<dt><code>transcripts</code></dt>
							<dd><span class="type">TranscriptMessage[]</span> — stable streaming entries.</dd>
						</div>
						<div>
							<dt><code>error</code></dt>
							<dd>
								<span class="type">string | null</span> — safe to render; code in
								<code>errorCode</code>.
							</dd>
						</div>
					</dl>
				</div>

				<div class="api__panel api__panel--methods">
					<div class="api__panel-head">
						<span>Methods &amp; helpers</span>
						<span>Browser lifecycle</span>
					</div>
					<div class="method-list">
						<div class="method">
							<code>startConversation(target?, &#123; signed? &#125;)</code>
							<p>
								Opens the mic and socket. Accepts a public agent id, signed
								<code>wss://</code> URL, or configured default.
							</p>
						</div>
						<div class="method">
							<code>stopConversation()</code>
							<p>Ends the call, flushes playback, closes audio, and preserves transcripts.</p>
						</div>
						<div class="method">
							<code>toggleMute()</code>
							<p>Stops outgoing chunks without closing the microphone track. Instant undo.</p>
						</div>
						<div class="method">
							<code>sendContextualUpdate(text)</code>
							<p>Injects context for the agent's next turn without interrupting speech.</p>
						</div>
						<div class="method">
							<code>sendUserMessage(text)</code>
							<p>Adds a typed user turn over the same WebSocket.</p>
						</div>
					</div>
				</div>
			</div>

			<div class="api__components">
				<div>
					<span class="api__component-label">Included UI</span>
					<h3>Use the parts, or none of them.</h3>
					<p>
						<code>&lt;AudioVisualizer&gt;</code> renders the live analyser data.
						<code>&lt;ConversationWidget&gt;</code> packages the field controls, transcript, mute, and
						telemetry. Both accept a controller you already own.
					</p>
				</div>
				<div class="api__component-code">
					<code
						>import &#123; AudioVisualizer, ConversationWidget &#125; from 'svelte-elevenlabs';</code
					>
				</div>
			</div>

			<p class="api__caveat">
				<strong>Browser only.</strong> Call <code>useConversation</code> during component
				initialisation; it registers the cleanup effect. Use
				<code>createConversation</code> when you need to own teardown yourself.
			</p>
		</section>

		<section class="community" aria-labelledby="community-title">
			<div class="page-wrap community__grid">
				<div>
					<p class="section-head__tag"><span>05</span> Community file</p>
					<h2 id="community-title">Independent<br />by design.</h2>
				</div>
				<div class="community__copy">
					<p class="community__lede">
						This is an independent library built in public, not an official SDK. It tracks the
						public Conversational AI protocol, documents its failure modes, and favors a clear error
						over a silent dead line.
					</p>
					<p class="community__disclaimer">
						This is an independent community project. Not affiliated with or endorsed by Eleven Labs
						Inc.
					</p>
					<div class="community__meta">
						<span>MIT licensed</span>
						<span>Built with Bun 1.4</span>
						<span>Issues welcome</span>
					</div>
				</div>
			</div>
		</section>
	</main>

	<footer class="footer">
		<div class="page-wrap footer__top">
			<a class="brand brand--footer" href="#top" aria-label="svelte-elevenlabs, back to top">
				{@render brandMark()}
				<span class="brand__name">
					<span>svelte</span><span class="brand__slash">/</span><span>elevenlabs</span>
				</span>
			</a>

			<nav class="footer__nav" aria-label="Footer">
				<a href="#console">Console</a>
				<a href="#architecture">Architecture</a>
				<a href="#install">Install</a>
				<a href="#api">API</a>
				<a href="https://elevenlabs.io/docs/conversational-ai/overview" rel="noreferrer">
					ElevenLabs docs ↗
				</a>
			</nav>
		</div>

		<div class="page-wrap footer__disclaimer">
			<span class="footer__mark" aria-hidden="true">!</span>
			<p>
				This is an independent community project. Not affiliated with or endorsed by Eleven Labs
				Inc.
			</p>
		</div>

		<div class="page-wrap footer__bottom">
			<span>© 2026 svelte-elevenlabs contributors</span>
			<span>Svelte 5 · SvelteKit · Bun · MIT</span>
			<a href="#top">Back to top ↑</a>
		</div>
	</footer>
</div>

<style>
	.page {
		--rule: rgba(23, 23, 18, 0.19);
		--rule-strong: rgba(23, 23, 18, 0.48);
		position: relative;
	}

	.page-wrap {
		width: min(100%, var(--page-max));
		margin-inline: auto;
		padding-inline: var(--page-pad);
	}

	.skip-link {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 1001;
		padding: 0.6rem 0.8rem;
		background: var(--ink);
		color: var(--paper-bright);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-decoration: none;
		transform: translateY(-180%);
		transition: transform 120ms ease;
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.58rem;
		color: inherit;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 1.85rem;
		height: 1.85rem;
		flex: 0 0 auto;
		border: 1px solid currentColor;
		background: var(--ink);
		color: var(--agent);
	}

	.brand-mark svg {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: var(--signal);
		stroke-linecap: square;
		stroke-width: 1.6;
	}

	.brand-mark svg path:last-child {
		stroke: currentColor;
		stroke-width: 1;
		opacity: 0.55;
	}

	.brand__name {
		display: inline-flex;
		align-items: baseline;
		font-size: 0.92rem;
		font-weight: 680;
		letter-spacing: -0.035em;
		line-height: 1;
	}

	.brand__slash {
		padding-inline: 0.14rem;
		color: var(--signal-deep);
		font-family: var(--font-mono);
		font-weight: 400;
	}

	.masthead {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1.5rem;
		padding-block: 1.1rem;
		border-bottom: 1px solid var(--rule);
	}

	.masthead__nav {
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 2.3vw, 1.8rem);
	}

	.masthead__nav a {
		position: relative;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.09em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.masthead__nav a::after {
		position: absolute;
		right: 0;
		bottom: -0.28rem;
		left: 0;
		height: 1px;
		background: var(--signal-deep);
		content: '';
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 160ms ease;
	}

	.masthead__nav a:hover::after {
		transform: scaleX(1);
	}

	.masthead__meta {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.masthead__version {
		padding: 0.24rem 0.4rem;
		border: 1px solid var(--rule);
		color: var(--ink-soft);
	}

	.masthead__flag {
		display: flex;
		align-items: center;
		gap: 0.34rem;
		color: var(--ink-soft);
	}

	.masthead__flag::before {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--signal);
		content: '';
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.45fr) minmax(17rem, 0.55fr);
		align-items: end;
		gap: clamp(2rem, 7vw, 7rem);
		padding-top: clamp(3.4rem, 9vw, 7.2rem);
		padding-bottom: clamp(3.3rem, 7vw, 6rem);
	}

	.hero__copy {
		min-width: 0;
	}

	.hero__kicker {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 1.2rem;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.hero__kicker-line {
		width: 2.3rem;
		height: 1px;
		background: var(--signal-deep);
	}

	h1 {
		max-width: 58rem;
		margin: 0;
		font-size: clamp(3.5rem, 8.3vw, 7.75rem);
		font-weight: 690;
		letter-spacing: -0.072em;
		line-height: 0.87;
	}

	.hero__line {
		display: block;
		padding-left: clamp(0rem, 3.3vw, 3rem);
	}

	h1 em {
		display: inline-block;
		margin-top: 0.08em;
		padding: 0.015em 0.13em 0.075em;
		background: var(--signal);
		color: var(--chassis);
		font-style: normal;
		line-height: 0.8;
		transform: rotate(-1.1deg);
		transform-origin: 20% 70%;
	}

	.hero__lede {
		max-width: 38rem;
		margin: clamp(1.8rem, 3.5vw, 2.8rem) 0 0;
		color: var(--ink-soft);
		font-size: clamp(1.02rem, 1.55vw, 1.2rem);
		line-height: 1.55;
	}

	.hero__actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.25rem;
		margin-top: 2rem;
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: 1.3rem;
		min-height: 2.9rem;
		padding: 0.2rem 0.35rem 0.2rem 1rem;
		border: 1px solid var(--ink);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-weight: 580;
		letter-spacing: 0.08em;
		line-height: 1;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.button--ink {
		background: var(--ink);
		color: var(--paper-bright);
	}

	.button--ink:hover {
		background: var(--signal);
		color: var(--ink);
	}

	.button__arrow {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border-left: 1px solid rgba(241, 234, 219, 0.26);
		font-size: 0.9rem;
	}

	.button--ink:hover .button__arrow {
		border-color: rgba(23, 23, 18, 0.26);
	}

	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding-bottom: 0.14rem;
		border-bottom: 1px solid currentColor;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.07em;
		line-height: 1.2;
		text-decoration: none;
		text-transform: uppercase;
	}

	.text-link:hover {
		color: var(--signal-deep);
	}

	.hero__facts {
		display: flex;
		flex-wrap: wrap;
		gap: 1.3rem 2.3rem;
		margin: 3.2rem 0 0;
		padding: 1.1rem 0 0;
		border-top: 1px solid var(--rule);
		list-style: none;
	}

	.hero__facts li {
		display: grid;
		gap: 0.18rem;
	}

	.hero__facts strong {
		font-family: var(--font-mono);
		font-size: 0.61rem;
		font-weight: 580;
		letter-spacing: 0.04em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.hero__facts span {
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.4;
	}

	.spec {
		position: relative;
		align-self: center;
		padding: 1rem 1.1rem 1.2rem;
		border: 1px solid rgba(23, 23, 18, 0.9);
		background: var(--chassis);
		color: var(--chalk);
		box-shadow:
			10px 10px 0 rgba(23, 23, 18, 0.1),
			0 1px 0 rgba(255, 255, 255, 0.06) inset;
		transform: rotate(1.4deg);
	}

	.spec__screw {
		position: absolute;
		width: 0.45rem;
		height: 0.45rem;
		border: 1px solid rgba(241, 234, 219, 0.28);
		border-radius: 50%;
	}

	.spec__screw::after {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0.22rem;
		height: 1px;
		background: rgba(241, 234, 219, 0.4);
		content: '';
		transform: translate(-50%, -50%) rotate(36deg);
	}

	.spec__screw--tl {
		top: 0.55rem;
		left: 0.55rem;
	}

	.spec__screw--br {
		right: 0.55rem;
		bottom: 0.55rem;
	}

	.spec__top,
	.spec__footer {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.spec__top {
		padding: 0 1.2rem 0.8rem;
		border-bottom: 1px solid var(--chassis-line);
	}

	.spec__wave {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 4.5rem;
		padding: 0.9rem 0 0.8rem;
	}

	.spec__wave span {
		flex: 1;
		min-height: 2px;
		background: var(--signal);
		opacity: 0.88;
	}

	.spec__wave span:nth-child(3n) {
		background: var(--agent);
		opacity: 0.65;
	}

	.spec__list {
		margin: 0;
		border-top: 1px solid var(--chassis-line);
	}

	.spec__list > div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--chassis-line);
	}

	.spec__list dt {
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.07em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.spec__list dd {
		margin: 0;
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.61rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		line-height: 1.3;
		text-align: right;
	}

	.spec__footer {
		margin-top: 1rem;
		color: var(--chalk);
	}

	.spec__footer strong {
		color: var(--agent);
		font-weight: 500;
	}

	.spec__note {
		margin: 1rem 0 0;
		padding-top: 0.85rem;
		border-top: 1px solid var(--chassis-line);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.55;
	}

	.spec__stamp {
		position: absolute;
		right: 0.8rem;
		bottom: -1.3rem;
		padding: 0.25rem 0.45rem;
		border: 1px solid var(--ink);
		background: var(--agent);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.25;
		text-align: center;
		text-transform: uppercase;
		transform: rotate(-6deg);
	}

	.data-strip {
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
	}

	.data-strip__inner {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.8rem 2rem;
		min-height: 2.55rem;
		font-family: var(--font-mono);
		font-size: 0.53rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.data-strip__inner > span:not(.data-strip__badge) {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
	}

	.data-strip__badge {
		margin-left: auto;
		padding: 0.2rem 0.35rem;
		border: 1px solid rgba(241, 234, 219, 0.36);
		color: var(--agent);
	}

	.console-section {
		padding-top: clamp(3.4rem, 6vw, 5.4rem);
		padding-bottom: clamp(4rem, 8vw, 8rem);
	}

	.section-head {
		display: grid;
		grid-template-columns: minmax(8rem, 0.48fr) minmax(0, 1.1fr) minmax(15rem, 0.72fr);
		align-items: start;
		gap: 2rem;
		margin-bottom: clamp(1.8rem, 4vw, 3rem);
	}

	.section-head__tag {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0.3rem 0 0;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.57rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.section-head__tag span {
		display: inline-grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		border: 1px solid currentColor;
		color: var(--signal-deep);
		font-size: 0.48rem;
		font-weight: 600;
	}

	.section-head h2 {
		margin: 0;
		font-size: clamp(2.05rem, 4.1vw, 3.5rem);
		font-weight: 660;
		letter-spacing: -0.055em;
		line-height: 0.98;
	}

	.section-head__copy {
		max-width: 30rem;
		margin: 0.2rem 0 0;
		color: var(--ink-soft);
		font-size: 0.84rem;
		line-height: 1.65;
	}

	.console {
		position: relative;
		border: 1px solid #000;
		background: var(--chassis);
		color: var(--chalk);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.08) inset,
			0 20px 0 rgba(23, 23, 18, 0.06),
			0 42px 80px rgba(23, 23, 18, 0.16);
	}

	.console::before {
		position: absolute;
		top: -0.38rem;
		right: 1.1rem;
		left: 1.1rem;
		height: 0.38rem;
		background: repeating-linear-gradient(
			90deg,
			rgba(23, 23, 18, 0.38) 0,
			rgba(23, 23, 18, 0.38) 1px,
			transparent 1px,
			transparent 9px
		);
		content: '';
		opacity: 0.55;
	}

	.console__titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 2.6rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--chassis-line);
		background: #0d0d0b;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.console__brandline,
	.console__channel,
	.console__auth {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.console__lamp {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(241, 234, 219, 0.24);
	}

	.console__lamp[data-tone='live'] {
		background: var(--agent);
		box-shadow: 0 0 8px rgba(205, 246, 108, 0.7);
	}

	.console__lamp[data-tone='connecting'],
	.console__lamp[data-tone='waiting'] {
		background: var(--signal);
		box-shadow: 0 0 8px rgba(255, 93, 43, 0.6);
		animation: pulse 1.2s ease-in-out infinite;
	}

	.console__lamp[data-tone='fault'] {
		background: #ff8b6b;
	}

	.console__channel {
		color: var(--chalk);
	}

	.console__serial {
		color: var(--chalk-muted);
	}

	.console__auth {
		padding-left: 1rem;
		border-left: 1px solid var(--chassis-line);
	}

	.console__auth-key {
		display: inline-block;
		width: 0.65rem;
		height: 0.35rem;
		border: 1px solid var(--signal);
		border-radius: 50% 50% 0 0;
		opacity: 0.8;
	}

	.console__body {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(19rem, 0.75fr);
	}

	.console__display {
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: clamp(0.9rem, 2vw, 1.4rem);
		border-right: 1px solid var(--chassis-line);
		background:
			radial-gradient(ellipse at 45% 40%, rgba(241, 234, 219, 0.035), transparent 52%), #10100d;
	}

	.display__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.display__status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--chalk-muted);
	}

	.display__status[data-tone='live'] {
		color: var(--agent);
	}

	.display__status[data-tone='connecting'],
	.display__status[data-tone='waiting'] {
		color: var(--signal);
	}

	.display__status[data-tone='fault'] {
		color: #ff8b6b;
	}

	.display__status-lamp {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.display__status[data-tone='live'] .display__status-lamp {
		animation: pulse 2.3s ease-in-out infinite;
	}

	.display__clock {
		display: flex;
		gap: 0.5rem;
		color: var(--chalk);
		font-variant-numeric: tabular-nums;
	}

	.display__clock span:first-child {
		color: var(--chalk-muted);
	}

	.readouts {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin: 0;
		border-top: 1px solid var(--chassis-line);
		border-bottom: 1px solid var(--chassis-line);
	}

	.readouts > div {
		min-width: 0;
		padding: 0.65rem 0.7rem 0.68rem 0;
	}

	.readouts > div + div {
		padding-left: 0.7rem;
		border-left: 1px solid var(--chassis-line);
	}

	.readouts dt {
		margin-bottom: 0.3rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.49rem;
		letter-spacing: 0.1em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.readouts dd {
		overflow: hidden;
		margin: 0;
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.readouts__signal {
		color: var(--agent) !important;
	}

	.queue-note {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		padding: 0.55rem 0.7rem;
		border-left: 2px solid var(--signal);
		background: rgba(255, 93, 43, 0.07);
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		line-height: 1.5;
	}

	.queue-note__lamp {
		width: 5px;
		height: 5px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--signal);
		animation: pulse 1s ease-in-out infinite;
	}

	.console__controls {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-width: 0;
		padding: clamp(0.9rem, 2vw, 1.4rem);
		background: var(--chassis-raised);
	}

	.controls__top,
	.control-divider {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.controls__top {
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.controls__top span:last-child {
		color: var(--signal);
	}

	.control-form {
		display: grid;
		gap: 0.8rem;
	}

	.target {
		display: grid;
		gap: 0.4rem;
	}

	.target__label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.target__mode {
		color: var(--agent);
		font-size: 0.48rem;
		letter-spacing: 0.03em;
		text-transform: none;
	}

	.target__field {
		position: relative;
		display: flex;
		align-items: center;
		border: 1px solid var(--chassis-line);
		background: #0e0e0b;
	}

	.target__field:focus-within {
		border-color: var(--signal);
		box-shadow: 0 0 0 1px rgba(255, 93, 43, 0.25);
	}

	.target__prompt {
		padding-left: 0.7rem;
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1;
	}

	.target input {
		width: 100%;
		min-width: 0;
		height: 2.75rem;
		padding: 0 0.7rem 0 0.45rem;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1;
	}

	.target input::placeholder {
		color: rgba(241, 234, 219, 0.28);
	}

	.target input:disabled {
		color: var(--chalk-muted);
		opacity: 0.7;
	}

	.auth {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.auth legend {
		margin-bottom: 0.4rem;
		padding: 0;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.auth__options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid var(--chassis-line);
	}

	.auth__option {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.55rem 0.6rem;
		cursor: pointer;
	}

	.auth__option + .auth__option {
		border-left: 1px solid var(--chassis-line);
	}

	.auth__option.is-active {
		background: rgba(205, 246, 108, 0.065);
		box-shadow: inset 0 -2px 0 var(--agent);
	}

	.auth__option input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.auth__option:focus-within {
		outline: 2px solid var(--agent);
		outline-offset: 2px;
	}

	.auth__option > span:last-child {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.auth__option strong {
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		font-weight: 520;
		letter-spacing: 0.02em;
		line-height: 1.35;
	}

	.auth__option small {
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.48rem;
		line-height: 1.3;
	}

	.auth__radio {
		width: 0.55rem;
		height: 0.55rem;
		flex: 0 0 auto;
		border: 1px solid var(--chalk-muted);
		border-radius: 50%;
	}

	.auth__option.is-active .auth__radio {
		border-color: var(--agent);
		background: radial-gradient(circle, var(--agent) 0 38%, transparent 42%);
	}

	.auth:disabled {
		opacity: 0.62;
	}

	.auth:disabled .auth__option {
		cursor: not-allowed;
	}

	.connect {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.7rem;
		min-height: 3.2rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid color-mix(in srgb, var(--signal) 70%, black);
		border-radius: 0;
		background: var(--signal);
		color: #17100c;
		cursor: pointer;
		text-align: left;
		transition:
			background-color 140ms ease,
			transform 120ms ease;
	}

	.connect:hover:not(:disabled) {
		background: #ff784c;
	}

	.connect:active:not(:disabled) {
		transform: translateY(1px);
	}

	.connect:disabled {
		cursor: not-allowed;
		background: rgba(241, 234, 219, 0.12);
		color: var(--chalk-muted);
		border-color: var(--chassis-line);
	}

	.connect--active {
		background: transparent;
		color: var(--signal);
		border-color: rgba(255, 93, 43, 0.6);
	}

	.connect--active:hover:not(:disabled) {
		background: rgba(255, 93, 43, 0.1);
	}

	.connect__icon {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid currentColor;
	}

	.connect__play {
		width: 0;
		height: 0;
		margin-left: 2px;
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		border-left: 6px solid currentColor;
	}

	.connect__stop {
		width: 0.45rem;
		height: 0.45rem;
		background: currentColor;
	}

	.connect__wait {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 0.9s ease-in-out infinite;
	}

	.connect__copy {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.connect__copy strong {
		font-family: var(--font-mono);
		font-size: 0.61rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.connect__copy small {
		font-family: var(--font-mono);
		font-size: 0.49rem;
		font-weight: 420;
		letter-spacing: 0.01em;
		line-height: 1.4;
		opacity: 0.65;
	}

	.connect__arrow {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 400;
		line-height: 1;
	}

	.control-help {
		margin: -0.15rem 0 0;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.54rem;
		line-height: 1.55;
	}

	.console-error {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: start;
		gap: 0.6rem;
		padding: 0.65rem;
		border: 1px solid rgba(255, 139, 107, 0.36);
		border-left: 3px solid #ff8b6b;
		background: rgba(255, 139, 107, 0.06);
	}

	.console-error__mark {
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border: 1px solid #ff8b6b;
		color: #ffb49d;
		font-family: var(--font-mono);
		font-size: 0.56rem;
		line-height: 1;
	}

	.console-error__label {
		margin: 0 0 0.15rem;
		color: #ffb49d;
		font-family: var(--font-mono);
		font-size: 0.48rem;
		font-weight: 550;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.console-error p:not(.console-error__label) {
		margin: 0;
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.55;
	}

	.icon-button {
		width: 1.35rem;
		height: 1.35rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--chalk-muted);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 1rem;
		line-height: 1;
	}

	.icon-button:hover {
		color: var(--chalk);
	}

	.control-divider {
		height: 1px;
		margin: 0.15rem 0;
		background: var(--chassis-line);
	}

	.utility-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.utility {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 2rem;
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--chassis-line);
		border-radius: 0;
		background: transparent;
		color: var(--chalk-muted);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.49rem;
		letter-spacing: 0.05em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.utility:hover:not(:disabled) {
		border-color: var(--chalk-muted);
		color: var(--chalk);
	}

	.utility:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.utility[aria-pressed='true'] {
		border-color: rgba(255, 93, 43, 0.5);
		color: var(--signal);
	}

	.utility svg {
		width: 12px;
		height: 12px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}

	.utility__slash {
		stroke: var(--signal);
	}

	.latency {
		margin-top: auto;
		padding-top: 0.65rem;
		border-top: 1px solid var(--chassis-line);
	}

	.latency__head,
	.latency__foot {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-family: var(--font-mono);
		font-size: 0.48rem;
		letter-spacing: 0.06em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.latency__head {
		color: var(--chalk-muted);
	}

	.latency__head span:last-child {
		color: var(--agent);
		font-variant-numeric: tabular-nums;
	}

	.latency__bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 2.4rem;
		margin: 0.55rem 0 0.4rem;
		padding: 0.15rem 0;
		border-bottom: 1px solid var(--chassis-line);
	}

	.latency__bars span {
		flex: 1;
		min-height: 3px;
		background: rgba(205, 246, 108, 0.36);
	}

	.latency__bars span[data-latest='true'] {
		background: var(--agent);
		box-shadow: 0 0 6px rgba(205, 246, 108, 0.4);
	}

	.latency__foot {
		color: var(--chalk-muted);
		font-size: 0.46rem;
	}

	.printer {
		border-top: 1px solid var(--chassis-line);
		background: #0d0d0b;
	}

	.printer__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 1rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.09em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.printer__title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--chalk);
	}

	.printer__lamp {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--chalk-muted);
	}

	.printer__lamp[data-live='true'] {
		background: var(--signal);
		animation: pulse 1s ease-in-out infinite;
	}

	.printer__count {
		margin-left: auto;
	}

	.printer__meta {
		color: var(--chalk-muted);
		font-size: 0.48rem;
	}

	.printer__paper {
		position: relative;
		max-height: 15.5rem;
		min-height: 9.6rem;
		overflow-y: auto;
		margin: 0 1rem 1rem;
		padding: 0.75rem 1rem 0.8rem;
		background:
			repeating-linear-gradient(
				to bottom,
				transparent 0,
				transparent 27px,
				rgba(23, 23, 18, 0.13) 28px
			),
			var(--paper-bright);
		color: var(--ink);
		scrollbar-color: rgba(23, 23, 18, 0.3) transparent;
		scrollbar-width: thin;
	}

	.printer__paper:focus-visible {
		outline: 2px solid var(--signal);
		outline-offset: -3px;
	}

	.printer__paper::before {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		height: 0.32rem;
		background: radial-gradient(
				circle at 0.25rem 0,
				transparent 0.22rem,
				var(--paper-bright) 0.23rem
			)
			0 0 / 0.5rem 0.32rem repeat-x;
		content: '';
		transform: translateY(-100%);
	}

	.printer__empty {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		min-height: 6.5rem;
		padding: 0.55rem 0;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.65rem;
		line-height: 1.6;
	}

	.printer__empty p {
		max-width: 42rem;
		margin: 0;
	}

	.printer__cross {
		display: grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
		flex: 0 0 auto;
		border: 1px solid rgba(23, 23, 18, 0.36);
		color: var(--signal-deep);
		font-size: 0.7rem;
		line-height: 1;
	}

	.printer__small {
		margin-top: 0.35rem !important;
		color: rgba(23, 23, 18, 0.56);
		font-size: 0.56rem;
	}

	.printer__entry {
		display: grid;
		grid-template-columns: 5.6rem minmax(0, 1fr);
		gap: 1rem;
		padding: 0.38rem 0 0.55rem;
		border-bottom: 1px solid rgba(23, 23, 18, 0.12);
	}

	.printer__entry:last-child {
		border-bottom: 0;
	}

	.printer__entry-meta {
		display: grid;
		align-content: start;
		gap: 0.12rem;
		padding-top: 0.08rem;
		color: rgba(23, 23, 18, 0.55);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		letter-spacing: 0.04em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	.printer__entry[data-role='agent'] .printer__entry-meta span:first-child {
		color: #527411;
		font-weight: 600;
	}

	.printer__entry[data-role='user'] .printer__entry-meta span:first-child {
		color: var(--signal-deep);
		font-weight: 600;
	}

	.printer__entry p {
		margin: 0;
		font-size: 0.79rem;
		line-height: 1.58;
		overflow-wrap: anywhere;
	}

	.printer__caret {
		display: inline-block;
		width: 0.38em;
		height: 0.9em;
		margin-left: 0.16em;
		background: var(--signal);
		vertical-align: -0.08em;
		animation: blink 0.9s steps(1) infinite;
	}

	.console__footer {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 2.2rem;
		padding: 0.55rem 1rem;
		border-top: 1px solid var(--chassis-line);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.47rem;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.console__footer-spacer {
		flex: 1;
	}

	.console__footer-signal {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--chalk-muted);
	}

	.console__footer-signal::before {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: currentColor;
		content: '';
	}

	.console__footer-signal[data-on='true'] {
		color: var(--agent);
	}

	.console__footer-dim {
		color: rgba(241, 234, 219, 0.32);
	}

	.architecture {
		padding-block: clamp(3.8rem, 8vw, 7rem);
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		background:
			linear-gradient(90deg, transparent 49.94%, rgba(23, 23, 18, 0.055) 50%, transparent 50.06%),
			linear-gradient(rgba(23, 23, 18, 0.035) 1px, transparent 1px) 0 0 / 100% 3.9rem,
			var(--paper-bright);
	}

	.section-head--architecture {
		margin-bottom: 3rem;
	}

	.architecture__grid {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(24rem, 1.1fr);
		gap: clamp(2rem, 5vw, 5.5rem);
		align-items: start;
	}

	.steps {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: steps;
	}

	.steps li {
		display: grid;
		grid-template-columns: 2.4rem minmax(0, 1fr);
		gap: 1rem;
		padding: 1.1rem 0 1.25rem;
		border-top: 1px solid var(--rule);
	}

	.steps li:last-child {
		border-bottom: 1px solid var(--rule);
	}

	.steps__num {
		color: var(--signal-deep);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		font-weight: 550;
		letter-spacing: 0.06em;
		line-height: 1.5;
	}

	.steps h3 {
		margin: 0 0 0.35rem;
		font-size: 1.02rem;
		font-weight: 630;
		letter-spacing: -0.02em;
		line-height: 1.25;
	}

	.steps p {
		max-width: 32rem;
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.78rem;
		line-height: 1.62;
	}

	.steps code {
		padding: 0.05rem 0.22rem;
		background: rgba(23, 23, 18, 0.065);
		font-family: var(--font-mono);
		font-size: 0.68em;
	}

	.schematic {
		border: 1px solid var(--ink);
		background: var(--chassis);
		color: var(--chalk);
		box-shadow: 0 12px 0 rgba(23, 23, 18, 0.08);
	}

	.schematic__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.8rem;
		border-bottom: 1px solid var(--chassis-line);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.09em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.diagram {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 3.1rem minmax(0, 1fr);
		align-items: stretch;
		gap: 0.75rem;
		padding: 1rem;
		background:
			linear-gradient(rgba(241, 234, 219, 0.045) 1px, transparent 1px) 0 0 / 100% 2.1rem,
			linear-gradient(90deg, rgba(241, 234, 219, 0.045) 1px, transparent 1px) 0 0 / 2.1rem 100%;
	}

	.diagram__column {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
	}

	.diagram__label {
		margin-bottom: 0.6rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.49rem;
		letter-spacing: 0.11em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.node {
		position: relative;
		padding: 0.7rem 0.6rem 0.65rem;
		border: 1px solid rgba(241, 234, 219, 0.23);
		background: rgba(241, 234, 219, 0.045);
	}

	.node--orange {
		border-color: rgba(255, 93, 43, 0.65);
		background: rgba(255, 93, 43, 0.09);
	}

	.node--lime {
		border-color: rgba(205, 246, 108, 0.58);
		background: rgba(205, 246, 108, 0.065);
	}

	.node__pin {
		position: absolute;
		top: 0.3rem;
		right: 0.3rem;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--signal);
	}

	.node--lime .node__pin {
		background: var(--agent);
	}

	.node strong {
		display: block;
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.57rem;
		font-weight: 520;
		letter-spacing: -0.02em;
		line-height: 1.4;
	}

	.node small {
		display: block;
		margin-top: 0.2rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.46rem;
		line-height: 1.4;
	}

	.diagram__wire {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: 1.65rem;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.44rem;
		line-height: 1.3;
	}

	.diagram__wire span {
		width: 1px;
		height: 100%;
		margin-left: 0.65rem;
		background: rgba(241, 234, 219, 0.28);
	}

	.diagram__wire--dashed span {
		background: repeating-linear-gradient(
			to bottom,
			rgba(241, 234, 219, 0.35) 0,
			rgba(241, 234, 219, 0.35) 2px,
			transparent 2px,
			transparent 5px
		);
	}

	.diagram__duo {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
		margin-top: auto;
	}

	.diagram__duo > div {
		padding: 0.55rem 0.45rem;
		border: 1px solid rgba(241, 234, 219, 0.14);
		color: var(--chalk);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		line-height: 1.35;
	}

	.diagram__duo small {
		display: block;
		margin-top: 0.15rem;
		color: var(--chalk-muted);
		font-size: 0.44rem;
	}

	.diagram__bridge {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding-top: 1.5rem;
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.46rem;
		letter-spacing: 0.05em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.diagram__bridge i {
		font-size: 1rem;
		font-style: normal;
		line-height: 0.9;
	}

	.diagram__bridge i:nth-of-type(2) {
		color: var(--agent);
	}

	.signed-route {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.42rem 0.55rem;
		margin: 0 1rem;
		padding: 0.65rem 0.6rem;
		border: 1px dashed rgba(205, 246, 108, 0.32);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.46rem;
		letter-spacing: 0.02em;
		line-height: 1.4;
	}

	.signed-route__label {
		padding: 0.18rem 0.28rem;
		background: rgba(205, 246, 108, 0.12);
		color: var(--agent);
		font-size: 0.42rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.signed-route__arrow {
		color: rgba(241, 234, 219, 0.35);
	}

	.signed-route__box {
		padding: 0.18rem 0.28rem;
		border: 1px solid rgba(241, 234, 219, 0.16);
		color: var(--chalk);
	}

	.signed-route__key {
		color: var(--signal);
	}

	.schematic__foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 1rem;
		border-top: 1px solid var(--chassis-line);
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.45rem;
		letter-spacing: 0.05em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.schematic__foot span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.schematic__foot i {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--signal);
	}

	.schematic__foot i.schematic__foot-lime {
		background: var(--agent);
	}

	.install {
		padding-block: clamp(3.8rem, 8vw, 7rem);
		background:
			radial-gradient(ellipse at 80% 20%, rgba(255, 93, 43, 0.12), transparent 34%), var(--ink);
		color: var(--paper-bright);
	}

	.section-head--dark h2,
	.section-head--dark .section-head__tag {
		color: var(--paper-bright);
	}

	.section-head--dark .section-head__tag span {
		color: var(--signal);
	}

	.section-head--dark .section-head__copy {
		color: rgba(241, 234, 219, 0.62);
	}

	.install__grid {
		display: grid;
		grid-template-columns: minmax(0, 0.76fr) minmax(24rem, 1.24fr);
		gap: clamp(2rem, 5vw, 5rem);
		align-items: start;
	}

	.install__left {
		display: grid;
		gap: 0;
		min-width: 0;
	}

	.install__step {
		min-width: 0;
		padding: 1rem 0 1.25rem;
		border-top: 1px solid rgba(241, 234, 219, 0.17);
	}

	.install__step:last-child {
		border-bottom: 1px solid rgba(241, 234, 219, 0.17);
	}

	.install__step-head {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
		margin-bottom: 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.57rem;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.install__step-head span:first-child {
		color: var(--signal);
		font-size: 0.48rem;
	}

	.install__step-head span:last-child {
		color: var(--paper-bright);
	}

	.install__step p {
		margin: 0.55rem 0 0;
		color: rgba(241, 234, 219, 0.56);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.6;
	}

	.install__step p code,
	.install__note code {
		color: var(--agent);
		font-family: var(--font-mono);
	}

	.command {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.2rem 0.25rem 0.2rem 0.7rem;
		border: 1px solid rgba(241, 234, 219, 0.2);
		background: #0c0c09;
	}

	.command code {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		color: var(--agent);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 2.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.command code::before {
		color: var(--signal);
		content: '$ ';
	}

	.command__copy {
		flex: 0 0 auto;
		padding: 0.38rem 0.55rem;
		border: 1px solid rgba(241, 234, 219, 0.22);
		border-radius: 0;
		background: transparent;
		color: var(--paper-bright);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.47rem;
		letter-spacing: 0.06em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.command__copy:hover {
		border-color: var(--agent);
		color: var(--agent);
	}

	.env {
		overflow-x: auto;
		margin: 0;
		padding: 0.7rem;
		border: 1px solid rgba(241, 234, 219, 0.14);
		background: #0c0c09;
		color: var(--paper-bright);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		line-height: 1.75;
	}

	.code-comment {
		color: rgba(241, 234, 219, 0.37);
	}

	.quickstart {
		position: relative;
		min-width: 0;
		border: 1px solid rgba(241, 234, 219, 0.22);
		background: #0b0b08;
		box-shadow: 12px 12px 0 rgba(255, 93, 43, 0.13);
	}

	.quickstart__top {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.8rem;
		border-bottom: 1px solid rgba(241, 234, 219, 0.17);
		color: var(--agent);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.quickstart__top span:last-child {
		color: rgba(241, 234, 219, 0.45);
	}

	.quickstart__code {
		overflow-x: auto;
		margin: 0;
		padding: clamp(1.1rem, 3vw, 2rem);
		color: #e6dfd1;
		font-family: var(--font-mono);
		font-size: clamp(0.62rem, 1.2vw, 0.76rem);
		line-height: 1.95;
		tab-size: 2;
	}

	.code-tag {
		color: #ff8b6b;
	}
	.code-keyword {
		color: var(--agent);
	}
	.code-function {
		color: #ffd166;
	}
	.code-string {
		color: #f1b49d;
	}

	.quickstart__foot {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.9rem 1.2rem 1.1rem;
		border-top: 1px solid rgba(241, 234, 219, 0.14);
	}

	.quickstart__foot p {
		max-width: 30rem;
		margin: 0;
		color: rgba(241, 234, 219, 0.54);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.6;
	}

	.quickstart__foot code {
		color: var(--chalk);
	}

	.text-link--light {
		color: var(--paper-bright);
		font-size: 0.53rem;
	}

	.quickstart__sticker {
		position: absolute;
		right: -0.8rem;
		bottom: -0.9rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--ink);
		background: var(--agent);
		color: var(--ink);
		transform: rotate(-4deg);
	}

	.quickstart__sticker span {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.06em;
		line-height: 0.8;
	}

	.quickstart__sticker small {
		font-family: var(--font-mono);
		font-size: 0.38rem;
		line-height: 1.25;
		text-transform: uppercase;
	}

	.install__note {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-top: 2.2rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(241, 234, 219, 0.16);
	}

	.install__note-mark {
		display: grid;
		place-items: center;
		width: 1.05rem;
		height: 1.05rem;
		flex: 0 0 auto;
		border: 1px solid var(--signal);
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		line-height: 1;
	}

	.install__note p {
		max-width: 61rem;
		margin: 0;
		color: rgba(241, 234, 219, 0.5);
		font-family: var(--font-mono);
		font-size: 0.53rem;
		line-height: 1.6;
	}

	.api {
		padding-top: clamp(3.8rem, 8vw, 7rem);
		padding-bottom: clamp(3.8rem, 8vw, 7rem);
	}

	.api__grid {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 1rem;
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
	}

	.api__panel {
		padding: 1.15rem 1.1rem 1.3rem;
		border-right: 1px solid var(--rule);
	}

	.api__panel--methods {
		border-right: 0;
		background: rgba(255, 255, 255, 0.16);
	}

	.api__panel-head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.8rem;
		border-bottom: 1px solid var(--rule);
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.api__panel-head span:last-child {
		color: var(--ink-soft);
		opacity: 0.56;
	}

	.api__list {
		margin: 0;
	}

	.api__list > div {
		display: grid;
		grid-template-columns: 7.3rem minmax(0, 1fr);
		gap: 0.8rem;
		padding: 0.68rem 0;
		border-bottom: 1px solid var(--rule);
	}

	.api__list > div:last-child {
		border-bottom: 0;
	}

	.api__list dt,
	.method code,
	.api__component-code code {
		font-family: var(--font-mono);
	}

	.api__list dt code {
		color: var(--signal-deep);
		font-size: 0.62rem;
		font-weight: 560;
	}

	.api__list dd {
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.7rem;
		line-height: 1.55;
	}

	.type {
		padding: 0.08rem 0.2rem;
		background: rgba(23, 23, 18, 0.07);
		font-family: var(--font-mono);
		font-size: 0.56rem;
	}

	.method-list {
		display: grid;
	}

	.method {
		padding: 0.72rem 0;
		border-bottom: 1px solid var(--rule);
	}

	.method:last-child {
		border-bottom: 0;
	}

	.method code {
		display: inline-block;
		padding: 0.16rem 0.28rem;
		background: var(--ink);
		color: var(--agent);
		font-size: 0.57rem;
		line-height: 1.4;
	}

	.method p {
		margin: 0.35rem 0 0;
		color: var(--ink-soft);
		font-size: 0.7rem;
		line-height: 1.55;
	}

	.api__components {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
		align-items: center;
		gap: 2rem;
		margin-top: 1rem;
		padding: 1.3rem 0;
		border-bottom: 1px solid var(--rule);
	}

	.api__component-label {
		display: block;
		margin-bottom: 0.45rem;
		color: var(--signal-deep);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.api__components h3 {
		margin: 0 0 0.4rem;
		font-size: 1.1rem;
		font-weight: 630;
		letter-spacing: -0.03em;
		line-height: 1.2;
	}

	.api__components p {
		max-width: 39rem;
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.73rem;
		line-height: 1.6;
	}

	.api__components code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.api__component-code {
		overflow-x: auto;
		padding: 0.85rem;
		border: 1px solid var(--rule-strong);
		background: var(--chassis);
		color: var(--agent);
	}

	.api__component-code code {
		font-size: 0.56rem;
		line-height: 1.55;
		white-space: nowrap;
	}

	.api__caveat {
		max-width: 52rem;
		margin: 1.4rem 0 0;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.57rem;
		line-height: 1.65;
	}

	.api__caveat strong {
		color: var(--ink);
		font-weight: 550;
	}

	.api__caveat code {
		padding: 0.06rem 0.22rem;
		background: rgba(23, 23, 18, 0.08);
	}

	.community {
		padding-block: clamp(3.4rem, 7vw, 6rem);
		border-top: 1px solid var(--rule);
		background:
			repeating-linear-gradient(
					90deg,
					transparent 0,
					transparent calc(100% - 1px),
					rgba(23, 23, 18, 0.055) calc(100% - 1px)
				)
				0 0 / 4.8rem 100%,
			var(--paper-deep);
	}

	.community__grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: clamp(2rem, 8vw, 7rem);
		align-items: start;
	}

	.community h2 {
		margin: 1.2rem 0 0;
		font-size: clamp(2.1rem, 5vw, 4.1rem);
		font-weight: 680;
		letter-spacing: -0.06em;
		line-height: 0.92;
	}

	.community__copy {
		padding-top: 0.2rem;
	}

	.community__lede {
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.92rem;
		line-height: 1.65;
	}

	.community__disclaimer {
		margin: 1.8rem 0 1.6rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--ink);
		background: var(--signal);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 530;
		line-height: 1.55;
	}

	.community__meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.08em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.community__meta span {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
	}

	.community__meta span::before {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--signal-deep);
		content: '';
	}

	.footer {
		padding-top: 2.4rem;
		background: var(--chassis);
		color: var(--chalk);
	}

	.footer__top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		padding-bottom: 2rem;
	}

	.brand--footer .brand-mark {
		border-color: rgba(241, 234, 219, 0.32);
	}

	.brand--footer .brand__name {
		font-size: 1.1rem;
	}

	.footer__nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem 1.5rem;
		max-width: 36rem;
		justify-content: flex-end;
	}

	.footer__nav a {
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.07em;
		line-height: 1.5;
		text-decoration: none;
		text-transform: uppercase;
	}

	.footer__nav a:hover {
		color: var(--agent);
	}

	.footer__disclaimer {
		display: flex;
		align-items: flex-start;
		gap: 0.8rem;
		padding-block: 1.15rem;
		border-top: 1px solid var(--chassis-line);
		border-bottom: 1px solid var(--chassis-line);
	}

	.footer__mark {
		display: grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
		flex: 0 0 auto;
		border: 1px solid var(--signal);
		color: var(--signal);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		line-height: 1;
	}

	.footer__disclaimer p {
		max-width: 54rem;
		margin: 0;
		color: var(--chalk-muted);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		line-height: 1.6;
	}

	.footer__bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.7rem 1.5rem;
		padding-block: 1rem 1.2rem;
		color: rgba(241, 234, 219, 0.4);
		font-family: var(--font-mono);
		font-size: 0.47rem;
		letter-spacing: 0.07em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.footer__bottom a {
		color: var(--chalk-muted);
		text-decoration: none;
	}

	.footer__bottom a:hover {
		color: var(--agent);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	@keyframes blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}

	@media (max-width: 1040px) {
		.hero {
			grid-template-columns: minmax(0, 1.25fr) minmax(16rem, 0.6fr);
			gap: 3rem;
		}

		.section-head {
			grid-template-columns: minmax(7rem, 0.4fr) minmax(0, 1fr);
		}

		.section-head__copy {
			grid-column: 2;
			margin-top: -0.4rem;
		}

		.section-head--architecture .section-head__copy {
			grid-column: 2;
		}

		.console__body {
			grid-template-columns: minmax(0, 1.25fr) minmax(17rem, 0.75fr);
		}

		.architecture__grid,
		.install__grid {
			gap: 2.5rem;
		}

		.api__grid {
			grid-template-columns: 1fr;
		}

		.api__panel {
			border-right: 0;
		}

		.api__panel + .api__panel {
			border-top: 1px solid var(--rule);
		}
	}

	@media (max-width: 820px) {
		.masthead {
			grid-template-columns: 1fr auto;
		}

		.masthead__nav {
			display: none;
		}

		.masthead__meta {
			align-self: start;
		}

		.hero {
			grid-template-columns: 1fr;
			gap: 3rem;
			padding-top: 3.4rem;
		}

		.spec {
			max-width: 24rem;
			justify-self: end;
		}

		.console__body {
			grid-template-columns: 1fr;
		}

		.console__display {
			border-right: 0;
			border-bottom: 1px solid var(--chassis-line);
		}

		.console__controls {
			min-height: 0;
		}

		.latency {
			margin-top: 0;
		}

		.architecture__grid,
		.install__grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.schematic {
			max-width: 38rem;
		}

		.install__grid {
			gap: 2.5rem;
		}

		.quickstart {
			margin-bottom: 1rem;
		}

		.quickstart__sticker {
			right: 0.55rem;
		}

		.community__grid {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.footer__top {
			flex-direction: column;
		}

		.footer__nav {
			justify-content: flex-start;
		}
	}

	@media (max-width: 620px) {
		:global(html) {
			scroll-padding-top: 1rem;
		}

		.masthead {
			gap: 0.75rem;
			padding-block: 0.9rem;
		}

		.masthead__flag {
			display: none;
		}

		.hero {
			padding-top: 2.8rem;
			padding-bottom: 3rem;
		}

		h1 {
			font-size: clamp(3.3rem, 17vw, 5.2rem);
		}

		.hero__line {
			padding-left: 0;
		}

		.hero__lede {
			font-size: 0.98rem;
		}

		.hero__facts {
			gap: 1rem 1.5rem;
			margin-top: 2.3rem;
		}

		.spec {
			justify-self: stretch;
			max-width: none;
			transform: rotate(0.8deg);
		}

		.data-strip__inner {
			gap: 0.5rem 1.2rem;
			padding-block: 0.65rem;
			font-size: 0.48rem;
		}

		.data-strip__inner > span:nth-child(3) {
			display: none;
		}

		.section-head {
			grid-template-columns: 1fr;
			gap: 0.55rem;
		}

		.section-head__copy {
			grid-column: 1;
			margin-top: 0.5rem;
		}

		.section-head__tag {
			margin-top: 0;
		}

		.console__titlebar {
			flex-wrap: wrap;
			gap: 0.45rem 0.8rem;
			padding-inline: 0.8rem;
		}

		.console__channel {
			order: 3;
			width: 100%;
			padding-top: 0.35rem;
			border-top: 1px solid var(--chassis-line);
		}

		.console__auth {
			margin-left: auto;
			padding-left: 0;
			border-left: 0;
		}

		.console__body {
			display: block;
		}

		.console__display,
		.console__controls {
			padding: 0.85rem;
		}

		.readouts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.readouts > div:nth-child(n + 4) {
			border-top: 1px solid var(--chassis-line);
		}

		.readouts > div:nth-child(4) {
			padding-left: 0;
			border-left: 0;
		}

		.printer__head {
			flex-wrap: wrap;
			gap: 0.3rem 0.8rem;
			padding-inline: 0.85rem;
		}

		.printer__count {
			margin-left: 0;
		}

		.printer__meta {
			width: 100%;
			padding-top: 0.2rem;
			border-top: 1px solid var(--chassis-line);
		}

		.printer__paper {
			margin-inline: 0.85rem;
			padding-inline: 0.7rem;
			max-height: 18rem;
		}

		.printer__entry {
			grid-template-columns: 4.2rem minmax(0, 1fr);
			gap: 0.65rem;
		}

		.console__footer {
			flex-wrap: wrap;
			gap: 0.35rem 0.8rem;
			padding-inline: 0.85rem;
		}

		.console__footer-spacer {
			display: none;
		}

		.console__footer-dim {
			margin-left: auto;
		}

		.diagram {
			grid-template-columns: 1fr;
			gap: 0.8rem;
			padding: 0.85rem;
		}

		.diagram__column {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.45rem;
			align-items: start;
		}

		.diagram__label {
			grid-column: 1 / -1;
			margin-bottom: 0.1rem;
		}

		.node {
			grid-column: span 1;
		}

		.diagram__wire {
			display: none;
		}

		.diagram__duo {
			grid-column: 1 / -1;
		}

		.node--lime {
			grid-column: 1 / -1;
		}

		.diagram__bridge {
			flex-direction: row;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.2rem 0;
			border-top: 1px dashed rgba(241, 234, 219, 0.18);
			border-bottom: 1px dashed rgba(241, 234, 219, 0.18);
		}

		.diagram__bridge i {
			transform: rotate(90deg);
		}

		.diagram__bridge i:nth-of-type(2) {
			display: none;
		}

		.signed-route {
			margin-inline: 0.85rem;
		}

		.schematic__foot {
			padding-inline: 0.85rem;
		}

		.install__note p {
			font-size: 0.51rem;
		}

		.api__list > div {
			grid-template-columns: 6.3rem minmax(0, 1fr);
			gap: 0.55rem;
		}

		.api__components {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}

		.api__component-code {
			overflow-x: auto;
		}

		.community h2 {
			font-size: clamp(2.7rem, 13vw, 4rem);
		}

		.footer__disclaimer p {
			font-size: 0.54rem;
		}

		.footer__bottom {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (max-width: 440px) {
		.hero__actions {
			align-items: flex-start;
			flex-direction: column;
			gap: 1rem;
		}

		.button {
			width: 100%;
			justify-content: space-between;
		}

		.spec {
			padding-inline: 0.9rem;
		}

		.spec__stamp {
			right: 0.4rem;
		}

		.section-head h2 {
			font-size: 2.15rem;
		}

		.readouts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.readouts > div:nth-child(3),
		.readouts > div:nth-child(5) {
			padding-left: 0;
			border-left: 0;
		}

		.readouts > div:nth-child(4) {
			padding-left: 0.7rem;
			border-left: 1px solid var(--chassis-line);
		}

		.readouts > div:nth-child(n + 3) {
			border-top: 1px solid var(--chassis-line);
		}

		.auth__options {
			grid-template-columns: 1fr;
		}

		.auth__option + .auth__option {
			border-top: 1px solid var(--chassis-line);
			border-left: 0;
		}

		.printer__entry {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}

		.printer__entry-meta {
			display: flex;
			gap: 0.5rem;
		}

		.diagram__column {
			grid-template-columns: 1fr;
		}

		.node,
		.node--lime,
		.diagram__duo {
			grid-column: 1 / -1;
		}

		.quickstart__foot {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.7rem;
		}

		.footer__nav {
			flex-direction: column;
			gap: 0.45rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.console__lamp,
		.display__status-lamp,
		.queue-note__lamp,
		.printer__lamp,
		.printer__caret,
		.connect__wait {
			animation: none;
		}

		.spec {
			transform: none;
		}

		.skip-link {
			transition: none;
		}
	}
</style>
