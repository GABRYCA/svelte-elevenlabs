# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Documentation section at `/docs` with start here pages, task guides, a searchable sidebar, copyable code samples, previous and next links, and a full API reference.
- Docs links in the showcase masthead and footer, plus a direct "Read the docs" action in the hero.

### Changed

- The showcase now offers a documentation path that works in the Node, Bun, and static Pages builds through `resolve()` and `PAGES_BASE_PATH`.

## [0.4.0] - 2026-10-21

### Added

- Text only sessions with `textOnly` on conversation options and `StartConversationOptions`, skipping microphone permission and Web Audio setup while keeping typed turns on the same socket.
- `ConversationProvider`, `getConversationContext`, and `useConversationClientTool` for shared controllers and component scoped client tools.
- Named client tools through `clientTools`, plus `registerClientTool` and `onUnhandledClientToolCall`.
- Server location selection for `us`, `eu-residency`, `in-residency`, and `global`.
- MCP tool approval handling with `onMCPToolApprovalRequest` and `sendMCPToolApprovalResult`.
- Response feedback, user activity throttling, VAD score, LLM context usage, audio alignment, and agent tool callbacks.
- Audio input and output device selection, live device switching, device enumeration through `listAudioDevices`, and playback gain through `setVolume` and `outputGain`.
- `endSession`, `getInputVolume`, `getOutputVolume`, `getId`, and byte frequency aliases on the controller.
- Text composer, feedback buttons, playback volume, and device selectors in `ConversationWidget` and the showcase.
- Offline tests for server locations, text only guards, feedback, user activity throttling, client tools, MCP approvals, volume clamping, and device enumeration guards.

### Changed

- Replaced the README package comparison with a plain description of the library, plus documentation for text only sessions, server locations, client tools, feedback, and audio controls.
- Documented the new controller fields and methods, widget props, provider, and client tool hook in the README.
- Updated the showcase with voice and text modes, typed turns, feedback, volume, and device controls.
- Bumped the package version from `0.3.0` to `0.4.0`.

### Fixed

- Accept current protocol `error` events as well as legacy `client_error` events.
- Send a client tool result when the incoming payload omits `expects_response`.
- Restore the selected audio device after a failed input or output switch.
- Report the same start error again when a retry fails within the console deduplication window.

## [0.3.0] - 2026-10-21

### Added

- Automatic version tagging on pushes to `main` through `.github/workflows/release.yml`.
- GitHub release publishing with generated notes and the packed npm tarball as a release asset.
- GitHub Pages deployment from the release workflow, plus downloadable package and static demo artifacts.
- Pull request CI through `.github/workflows/ci.yml` with type checks, tests, lint, the Node build, and the static build.
- Opt-in live ElevenLabs tests for the agent REST endpoint, signed URL endpoint, and WebSocket initiation metadata.
- Separate `vitest.live.config.ts` and `bun run test:live`, so quota-consuming tests never run in CI or in the default suite.
- Expanded offline coverage for audio formats, resampling, PCM16 clamping, µ-law decoding, `AudioManager` guards, protocol parsing, target validation, URL normalization, close messages, error classes, the signed URL route, and controller state.
- `include-hidden-files` for Pages uploads so `.nojekyll` reaches the deployed artifact.

### Changed

- Extracted protocol parsing, target validation, URL normalization, and error formatting into `src/lib/protocol/helpers.ts` for direct unit testing.
- `startConversation` now reports a destroyed controller before the browser support check.
- Bumped the package version from `0.2.0` to `0.3.0`.
- Updated the README with the release flow, artifact names, CI behavior, and live test instructions.
- Updated the repository guidance for the new workflows and test commands.

## [0.2.0] - 2026-10-21

### Added

- Node 22.17+ support and `@sveltejs/adapter-node` as the default application adapter.
- Optional `@sveltejs/adapter-bun` build with `build:bun` and `start:bun` scripts.
- Static GitHub Pages build with `@sveltejs/adapter-static`, including a deployment workflow.
- `PUBLIC_HOSTING_MODE=static` to hide and disable signed URL exchange on GitHub Pages.
- `PAGES_BASE_PATH` support for project sites, user sites, and custom domains.
- Node-safe `svelte-elevenlabs/audio`, `svelte-elevenlabs/types`, and `svelte-elevenlabs/package.json` subpath exports.
- Automatic `.env` loading for the Node start script with `--env-file-if-exists`.
- `CHANGELOG.md` and expanded publishing documentation.

### Changed

- Bumped the package version from `0.1.0` to `0.2.0`.
- Rewrote the README for Node and Bun, npm publishing, static hosting, and security guidance.
- Updated the showcase for static mode with public agent ids and a disabled signed URL option.
- Moved the showcase environment contract to SvelteKit 3 `$app/env/public`.
- Added author attribution for GABRYCA in package metadata, the showcase, and the license.
- Replaced reactive `SvelteMap`, `SvelteSet`, and `SvelteURL` with native `Map`, `Set`, and `URL` where reactivity is not required.
- Restricted negotiated `ulaw` formats to `ulaw_8000`.
- Removed long dashes from source, tests, static files, and documentation.
- Documented the Keep a Changelog 1.1.0 format and Semantic Versioning policy.
- Added a changelog section to `README.md`.

### Fixed

- Fixed signed URL prerendering when `PAGES_BASE_PATH` is set. The Pages build now resolves the base path after SvelteKit reloads the Vite configuration.
- Hardened `AudioManager` against races between `prepare()`, `startInput()`, and `close()`.
- Added closed guards around microphone capture, worklet loading, and audio context creation.
- Added target validation before microphone permission is requested.
- Added negotiated audio format validation through `parseAudioFormat`.
- Corrected `startConversation()` documentation to match its non-rejecting behavior.
- Forced the Bun adapter build to run Vite under the Bun runtime instead of Node.
