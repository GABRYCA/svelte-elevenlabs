# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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