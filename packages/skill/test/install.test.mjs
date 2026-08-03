import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { install, listSkillNames, MANAGED_PREFIX } from '../src/install.mjs';

describe('drafter-skill installer', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('lists both bundled skills', () => {
    expect(listSkillNames().sort()).toEqual(['draft-pr', 'split-scope']);
  });

  it('copies both skills into a custom target with the drafter- prefix', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drafter-skill-install-'));
    const results = install({ target: tmpDir });
    expect(results).toHaveLength(1);

    for (const skillName of ['draft-pr', 'split-scope']) {
      const skillMdPath = join(tmpDir, `${MANAGED_PREFIX}${skillName}`, 'SKILL.md');
      expect(existsSync(skillMdPath)).toBe(true);
      const content = readFileSync(skillMdPath, 'utf8');
      expect(content.startsWith('---\n')).toBe(true);
    }
  });

  it('is idempotent — installing twice produces the same result', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drafter-skill-install-'));
    install({ target: tmpDir });
    const second = install({ target: tmpDir });
    expect(existsSync(join(tmpDir, `${MANAGED_PREFIX}draft-pr`, 'SKILL.md'))).toBe(true);
    expect(second[0].installed).toHaveLength(2);
  });

  it('rejects an unknown --tool name', () => {
    expect(() => install({ tools: ['not-a-real-tool'] })).toThrow(/Unknown --tool/);
  });
});
