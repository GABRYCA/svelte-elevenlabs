<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { untrack } from 'svelte';
	import type { ConversationController } from '../runes/useConversation.svelte.js';

	/**
	 * Props for the ready-made audio visualizer.
	 *
	 * The visualizer reads the conversation's live analyser data, so it never
	 * synthesizes fake levels. When no session is active it renders a static
	 * standby grid and baseline.
	 */
	interface Props {
		/** Controller created with `useConversation` or `createConversation`. */
		conversation?: ConversationController | null;
		/** Canvas height in CSS pixels. Defaults to `176`. */
		height?: number;
		/** Show the YOU / AGENT labels. Defaults to `true`. */
		showLegend?: boolean;
		/** Accessible label for the visualizer. */
		label?: string;
		/** Extra class names applied to the root element. */
		class?: string;
	}

	let {
		conversation = null,
		height = 176,
		showLegend = true,
		label = 'Live microphone and agent audio spectra',
		class: className = ''
	}: Props = $props();

	let stage = $state<HTMLDivElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);

	let description = $derived(
		!conversation || conversation.status === 'disconnected'
			? 'Audio spectra idle. No conversation is active.'
			: conversation.status === 'connecting'
				? 'Audio spectra waiting for the conversation to connect.'
				: conversation.isSpeaking
					? 'The agent is speaking. Live microphone and agent spectra are shown.'
					: conversation.isUserSpeaking
						? 'The user is speaking. Live microphone and agent spectra are shown.'
						: conversation.isTextOnly
							? 'The conversation is connected in text only mode.'
							: 'The conversation is connected and listening for audio.'
	);

	$effect(() => {
		if (!BROWSER || !stage || !canvas) return;

		const stageEl = stage;
		const canvasEl = canvas;
		// Track controller identity without subscribing to its rapidly changing state.
		const controller = conversation;
		const context = canvasEl.getContext('2d');
		if (!context) return;

		const inputData = new Uint8Array(512);
		const outputData = new Uint8Array(512);
		const reducedMotion =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let width = 0;
		let drawHeight = 0;
		let bars = 48;
		let smoothedInput = new Float32Array(bars);
		let smoothedOutput = new Float32Array(bars);
		let frame = 0;
		let lastPaint = 0;
		let hasPainted = false;

		const resize = (): void => {
			const rect = stageEl.getBoundingClientRect();
			const nextWidth = Math.max(1, Math.round(rect.width));
			const nextHeight = Math.max(1, Math.round(rect.height));
			const dpr = Math.min(2.5, window.devicePixelRatio || 1);

			if (nextWidth !== width || nextHeight !== drawHeight) {
				width = nextWidth;
				drawHeight = nextHeight;
				canvasEl.width = Math.round(width * dpr);
				canvasEl.height = Math.round(drawHeight * dpr);
				canvasEl.style.width = `${width}px`;
				canvasEl.style.height = `${drawHeight}px`;
				context.setTransform(dpr, 0, 0, dpr, 0, 0);
				hasPainted = false;
			}

			const nextBars = Math.max(28, Math.min(96, Math.floor(width / 7)));
			if (nextBars !== bars) {
				bars = nextBars;
				smoothedInput = new Float32Array(bars);
				smoothedOutput = new Float32Array(bars);
			}
		};

		const sampleBar = (data: Uint8Array, index: number): number => {
			const position = index / Math.max(1, bars - 1);
			// Bias the display toward the speech band while still showing air.
			const center = Math.pow(position, 1.45) * (data.length * 0.62);
			const lower = Math.max(0, Math.floor(center) - 1);
			const upper = Math.min(data.length - 1, Math.floor(center) + 2);
			let peak = 0;

			for (let i = lower; i <= upper; i += 1) {
				peak = Math.max(peak, data[i] ?? 0);
			}
			return peak / 255;
		};

		const drawGrid = (): void => {
			context.clearRect(0, 0, width, drawHeight);
			context.save();
			context.strokeStyle = 'rgba(239, 233, 218, 0.085)';
			context.lineWidth = 1;
			context.setLineDash([1, 5]);

			for (let column = 1; column < 8; column += 1) {
				const x = Math.round((width / 8) * column) + 0.5;
				context.beginPath();
				context.moveTo(x, 0);
				context.lineTo(x, drawHeight);
				context.stroke();
			}

			for (const fraction of [0.25, 0.5, 0.75]) {
				const y = Math.round(drawHeight * fraction) + 0.5;
				context.beginPath();
				context.moveTo(0, y);
				context.lineTo(width, y);
				context.stroke();
			}

			context.restore();
		};

		const drawSpectrum = (): void => {
			resize();
			if (!hasPainted || width <= 0 || drawHeight <= 0) {
				drawGrid();
				hasPainted = true;
			} else {
				context.clearRect(0, 0, width, drawHeight);
				drawGrid();
			}

			const connected = controller?.status === 'connected';
			if (connected && controller) {
				controller.getInputFrequencyData(inputData);
				controller.getOutputFrequencyData(outputData);
			} else {
				inputData.fill(0);
				outputData.fill(0);
			}

			const gap = width < 360 ? 2 : 3;
			const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
			const center = drawHeight / 2;
			const maxHeight = drawHeight * 0.45;
			const smoothing = reducedMotion ? 0.75 : 0.32;

			context.save();
			context.beginPath();
			context.rect(0, 0, width, drawHeight);
			context.clip();

			for (let index = 0; index < bars; index += 1) {
				const x = index * (barWidth + gap);

				const inputValue = connected ? sampleBar(inputData, index) : 0;
				const outputValue = connected ? sampleBar(outputData, index) : 0;

				smoothedInput[index] += (inputValue - smoothedInput[index]) * smoothing;
				smoothedOutput[index] += (outputValue - smoothedOutput[index]) * smoothing;

				const inputHeight = Math.max(1.5, smoothedInput[index] * maxHeight);
				const outputHeight = Math.max(1.5, smoothedOutput[index] * maxHeight);

				const activeInput = controller?.isListening
					? Math.min(1, Math.max(0.18, smoothedInput[index] * 1.4))
					: 0.12;
				const activeOutput = controller?.isSpeaking
					? Math.min(1, Math.max(0.18, smoothedOutput[index] * 1.4))
					: 0.12;

				context.fillStyle = `rgba(255, 93, 43, ${activeInput})`;
				context.fillRect(x, center, barWidth, inputHeight);

				context.fillStyle = `rgba(205, 246, 108, ${activeOutput})`;
				context.fillRect(x, center - outputHeight, barWidth, outputHeight);
			}

			context.restore();

			const gradient = context.createLinearGradient(0, 0, width, 0);
			gradient.addColorStop(0, 'rgba(255, 93, 43, 0)');
			gradient.addColorStop(0.35, 'rgba(255, 93, 43, 0.72)');
			gradient.addColorStop(0.5, 'rgba(239, 233, 218, 0.72)');
			gradient.addColorStop(0.65, 'rgba(205, 246, 108, 0.72)');
			gradient.addColorStop(1, 'rgba(205, 246, 108, 0)');
			context.fillStyle = gradient;
			context.fillRect(0, Math.round(center), width, 1);
		};

		const loop = (now: number): void => {
			frame = window.requestAnimationFrame(loop);
			const minimumInterval = reducedMotion ? 160 : 33;
			if (now - lastPaint < minimumInterval) return;
			lastPaint = now;
			drawSpectrum();
		};

		resize();
		untrack(() => drawSpectrum());
		frame = window.requestAnimationFrame(loop);

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(() => {
				resize();
				hasPainted = false;
			});
			observer.observe(stageEl);
		}

		return () => {
			window.cancelAnimationFrame(frame);
			observer?.disconnect();
		};
	});
</script>

<figure class="se-viz {className}" aria-label={`${label}. ${description}`}>
	<div class="se-viz__stage" bind:this={stage} style:height={`${height}px`}>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>

		{#if showLegend}
			<div class="se-viz__legend se-viz__legend--input" aria-hidden="true">
				<span class="se-viz__dot se-viz__dot--input"></span>
				YOU / IN
			</div>
			<div class="se-viz__legend se-viz__legend--output" aria-hidden="true">
				AGENT / OUT
				<span class="se-viz__dot se-viz__dot--output"></span>
			</div>
		{/if}

		<span class="se-viz__source" aria-hidden="true">
			{conversation?.status === 'connected'
				? (conversation.outputAudioFormat?.replace('_', ' ') ?? 'LIVE')
				: 'STANDBY'}
		</span>
	</div>
	<figcaption class="se-viz__caption">
		<span>Mic · analyser / 30 fps</span>
		<span>Agent · wave clock</span>
	</figcaption>
</figure>

<style>
	.se-viz {
		--viz-border: var(--se-viz-border, rgba(239, 233, 218, 0.16));
		--viz-ink: var(--se-viz-ink, rgba(239, 233, 218, 0.62));
		--viz-bg: var(--se-viz-bg, #0d0d0b);
		--viz-orange: var(--se-signal, #ff5d2b);
		--viz-lime: var(--se-agent, #cdf66c);

		display: grid;
		gap: 0.55rem;
		margin: 0;
		min-width: 0;
	}

	.se-viz__stage {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--viz-border);
		background:
			radial-gradient(ellipse at 50% 50%, rgba(239, 233, 218, 0.04), transparent 68%), var(--viz-bg);
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.55),
			inset 0 0 40px rgba(0, 0, 0, 0.4);
		isolation: isolate;
		border-radius: var(--se-viz-radius, 2px);
	}

	.se-viz__stage::after {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: repeating-linear-gradient(
			to bottom,
			transparent 0,
			transparent 3px,
			rgba(0, 0, 0, 0.13) 4px
		);
		content: '';
		pointer-events: none;
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
	}

	.se-viz__legend {
		position: absolute;
		z-index: 3;
		top: 0.7rem;
		display: flex;
		align-items: center;
		gap: 0.42rem;
		color: var(--viz-ink);
		font-family: var(--se-font-mono, 'Azeret Mono Variable', ui-monospace, monospace);
		font-size: 0.56rem;
		font-weight: 550;
		letter-spacing: 0.14em;
		line-height: 1;
		pointer-events: none;
	}

	.se-viz__legend--input {
		left: 0.85rem;
		color: color-mix(in srgb, var(--viz-orange) 82%, white);
	}

	.se-viz__legend--output {
		right: 0.85rem;
		color: color-mix(in srgb, var(--viz-lime) 82%, white);
	}

	.se-viz__dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}

	.se-viz__dot--input {
		background: var(--viz-orange);
		box-shadow: 0 0 8px color-mix(in srgb, var(--viz-orange) 60%, transparent);
	}

	.se-viz__dot--output {
		background: var(--viz-lime);
		box-shadow: 0 0 8px color-mix(in srgb, var(--viz-lime) 60%, transparent);
	}

	.se-viz__source {
		position: absolute;
		z-index: 3;
		right: 0.85rem;
		bottom: 0.66rem;
		color: var(--viz-ink);
		font-family: var(--se-font-mono, 'Azeret Mono Variable', ui-monospace, monospace);
		font-size: 0.52rem;
		letter-spacing: 0.13em;
		line-height: 1;
		opacity: 0.62;
		pointer-events: none;
		text-transform: uppercase;
	}

	.se-viz__caption {
		display: flex;
		justify-content: space-between;
		color: var(--viz-ink);
		font-family: var(--se-font-mono, 'Azeret Mono Variable', ui-monospace, monospace);
		font-size: 0.5rem;
		letter-spacing: 0.09em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	@media (max-width: 480px) {
		.se-viz__caption span:last-child {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.se-viz__dot {
			box-shadow: none;
		}
	}
</style>
