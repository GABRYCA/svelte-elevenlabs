import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import pkg from '../package.json';

const CLI = resolve(import.meta.dirname, '..', 'bin', 'svelte-elevenlabs.js');
const START_MARKER = '<!-- svelte-elevenlabs:agent-kit:start -->';
const END_MARKER = '<!-- svelte-elevenlabs:agent-kit:end -->';

const directories: string[] = [];

function createProject(): string {
	const directory = mkdtempSync(join(tmpdir(), 'svelte-elevenlabs-agents-'));
	directories.push(directory);
	return directory;
}

function run(cwd: string, ...args: string[]) {
	return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function read(cwd: string, path: string): string {
	return readFileSync(join(cwd, path), 'utf8');
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('agent kit CLI', () => {
	it('lists every supported target', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'list');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('.claude/skills/svelte-elevenlabs/SKILL.md');
		expect(result.stdout).toContain('.cursor/rules/svelte-elevenlabs.mdc');
		expect(result.stdout).toContain('.opencode/skills/svelte-elevenlabs/SKILL.md');
		expect(result.stdout).toContain('.github/copilot-instructions.md');
		expect(result.stdout).toContain('.windsurf/rules/svelte-elevenlabs.md');
		expect(result.stdout).toContain('.clinerules/svelte-elevenlabs.md');
		expect(result.stdout).toContain('GEMINI.md');
		expect(result.stdout).toContain('AGENTS.md');
	});

	it('prints the canonical guide without markers', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'print');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('# svelte-elevenlabs agent guide');
		expect(result.stdout).not.toContain(START_MARKER);
	});

	it('prints a target with frontmatter and markers', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'print', 'cursor');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('description:');
		expect(result.stdout).toContain(START_MARKER);
		expect(result.stdout).toContain(END_MARKER);
	});

	it('installs a dedicated skill file', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'install', 'claude');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('created');

		const content = read(cwd, '.claude/skills/svelte-elevenlabs/SKILL.md');
		expect(content).toContain('name: svelte-elevenlabs');
		expect(content).toContain(START_MARKER);
		expect(content).toContain('# svelte-elevenlabs agent guide');
	});

	it('detects configured tools and keeps shared files intact', () => {
		const cwd = createProject();
		mkdirSync(join(cwd, '.cursor'));
		writeFileSync(join(cwd, 'AGENTS.md'), '# Project rules\n\nKeep this line.\n');

		const result = run(cwd, 'agents', 'install');

		expect(result.status).toBe(0);
		expect(existsSync(join(cwd, '.cursor/rules/svelte-elevenlabs.mdc'))).toBe(true);

		const agents = read(cwd, 'AGENTS.md');
		expect(agents).toContain('Keep this line.');
		expect(agents).toContain(START_MARKER);
		expect(agents).toContain(END_MARKER);
	});

	it('falls back to AGENTS.md when nothing is detected', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'install');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('No agent configuration was detected');
		expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
	});

	it('is idempotent for shared and dedicated files', () => {
		const cwd = createProject();
		writeFileSync(join(cwd, 'AGENTS.md'), '# Project rules\n\nKeep this line.\n');

		run(cwd, 'agents', 'install', 'agents', 'claude');
		const firstAgents = read(cwd, 'AGENTS.md');
		const firstSkill = read(cwd, '.claude/skills/svelte-elevenlabs/SKILL.md');

		const second = run(cwd, 'agents', 'install', 'agents', 'claude');

		expect(second.status).toBe(0);
		expect(second.stdout).toContain('unchanged');
		expect(read(cwd, 'AGENTS.md')).toBe(firstAgents);
		expect(read(cwd, '.claude/skills/svelte-elevenlabs/SKILL.md')).toBe(firstSkill);
	});

	it('skips an existing dedicated file without --force', () => {
		const cwd = createProject();
		const path = join(cwd, '.claude/skills/svelte-elevenlabs/SKILL.md');
		mkdirSync(join(cwd, '.claude/skills/svelte-elevenlabs'), { recursive: true });
		writeFileSync(path, 'custom content\n');

		const result = run(cwd, 'agents', 'install', 'claude');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('skipped');
		expect(readFileSync(path, 'utf8')).toBe('custom content\n');
	});

	it('replaces an existing dedicated file with --force', () => {
		const cwd = createProject();
		const path = join(cwd, '.claude/skills/svelte-elevenlabs/SKILL.md');
		mkdirSync(join(cwd, '.claude/skills/svelte-elevenlabs'), { recursive: true });
		writeFileSync(path, 'custom content\n');

		const result = run(cwd, 'agents', 'install', 'claude', '--force');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('replaced');
		expect(readFileSync(path, 'utf8')).toContain(START_MARKER);
	});

	it('writes nothing during a dry run', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'install', 'claude', '--dry-run');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('would create');
		expect(existsSync(join(cwd, '.claude'))).toBe(false);
	});

	it('rejects an unknown target', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', 'install', 'unknown-tool');

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Unknown agent target');
	});

	it('prints help for the agents command', () => {
		const cwd = createProject();
		const result = run(cwd, 'agents', '--help');

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('svelte-elevenlabs agent kit');
		expect(result.stdout).toContain('agents install');
	});

	it('refuses to update an incomplete managed block', () => {
		const cwd = createProject();
		writeFileSync(join(cwd, 'AGENTS.md'), `# Project rules\n\n${START_MARKER}\n`);

		const result = run(cwd, 'agents', 'install', 'agents', '--force');

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('without an end marker');
		expect(read(cwd, 'AGENTS.md')).toContain('# Project rules');
	});

	it('publishes the CLI and the canonical kit', () => {
		expect(pkg.bin['svelte-elevenlabs']).toBe('./bin/svelte-elevenlabs.js');
		expect(pkg.files).toContain('agent-kit');
		expect(pkg.files).toContain('bin');
	});
});
