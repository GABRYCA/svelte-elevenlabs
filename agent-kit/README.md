# Agent kit

Rules, snippets, and a one-command installer that teach coding agents how to use
`svelte-elevenlabs` correctly.

Coding agents often guess API names, forget that `useConversation` must run
during component initialisation, or move an API key into a client component.
This kit gives them one accurate source file and places it where Claude Code,
Cursor, OpenCode, GitHub Copilot, Windsurf, Cline, Gemini CLI, and generic
`AGENTS.md` aware tools already look.

## Install

Run the command inside the SvelteKit project that uses the package:

```sh
# Bun
bunx svelte-elevenlabs agents install

# npm
npx svelte-elevenlabs agents install
```

With no target names the command detects the agents configured in the project.
When it cannot detect one, it adds a managed block to `AGENTS.md`.

Choose targets explicitly when you want more than detection finds:

```sh
bunx svelte-elevenlabs agents install claude cursor opencode
bunx svelte-elevenlabs agents install --all
bunx svelte-elevenlabs agents install claude --dry-run
bunx svelte-elevenlabs agents install claude --force
```

Use `agents list` to see every target and destination path, and `agents print`
to send the guide to standard output:

```sh
bunx svelte-elevenlabs agents list
bunx svelte-elevenlabs agents print cursor
```

## Targets

| Name       | Tool                                                | Destination                                   |
| ---------- | --------------------------------------------------- | --------------------------------------------- |
| `claude`   | Claude Code                                         | `.claude/skills/svelte-elevenlabs/SKILL.md`   |
| `cursor`   | Cursor                                              | `.cursor/rules/svelte-elevenlabs.mdc`         |
| `opencode` | OpenCode                                            | `.opencode/skills/svelte-elevenlabs/SKILL.md` |
| `copilot`  | GitHub Copilot                                      | `.github/copilot-instructions.md`             |
| `windsurf` | Windsurf                                            | `.windsurf/rules/svelte-elevenlabs.md`        |
| `cline`    | Cline                                               | `.clinerules/svelte-elevenlabs.md`            |
| `gemini`   | Gemini CLI                                          | `GEMINI.md`                                   |
| `agents`   | Codex, OpenCode, Jules, and other `AGENTS.md` tools | `AGENTS.md`                                   |

Shared files such as `AGENTS.md`, `GEMINI.md`, and the Copilot instructions keep
your existing content. The installer adds or updates a marked block between
`svelte-elevenlabs:agent-kit:start` and `svelte-elevenlabs:agent-kit:end`.
Running the command again replaces only that block.

Dedicated skill and rule files are only overwritten with `--force`.

## Manual installation

If you cannot run the command, copy the contents of
[`instructions.md`](./instructions.md) into the file your tool reads. For a
Claude Code or OpenCode skill, add this frontmatter above it:

```yaml
---
name: svelte-elevenlabs
description: Build or review Svelte 5 ElevenLabs Conversational AI voice and text sessions with svelte-elevenlabs.
license: MIT
---
```

The canonical guide is also published at
[gabryca.github.io/svelte-elevenlabs/docs/agents](https://gabryca.github.io/svelte-elevenlabs/docs/agents),
and the full API reference is at
[llms-full.txt](https://gabryca.github.io/svelte-elevenlabs/llms-full.txt).

## What the guide covers

- The non negotiable rules for secrets, lifecycle, and secure contexts.
- A minimal voice component and a signed URL server route.
- `ConversationWidget`, `AudioVisualizer`, and `ConversationProvider`.
- Text only sessions and typed turns.
- Client tools, MCP approvals, feedback, and device controls.
- The reactive controller surface and the options that change behavior.
- Error codes and a review checklist.

## Safety

The agent kit never contains an API key and never asks an agent to create one in
the browser. Signed URL work stays on the server. The kit is plain Markdown, so
you can review every line before you commit it.
