import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { loadDrafterConfig } from '../src/config/load-config.js';
import { DEFAULT_CONFIG } from '../src/config/default-taxonomy.js';

describe('loadDrafterConfig', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('falls back to the built-in default when no config file or git root is found', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drafter-config-'));
    const config = await loadDrafterConfig({ cwd: tmpDir });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('loads an explicit JSON config path and fills missing fields from the default', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drafter-config-'));
    const configPath = join(tmpDir, 'custom.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        prBody: { summaryWordLimit: 50, changedFilesWarningThreshold: 20 },
      }),
    );
    const config = await loadDrafterConfig({ explicitPath: configPath });
    expect(config.prBody.summaryWordLimit).toBe(50);
    // Untouched fields still come from the default.
    expect(config.taxonomy).toEqual(DEFAULT_CONFIG.taxonomy);
    expect(config.diffAtomicity).toEqual(DEFAULT_CONFIG.diffAtomicity);
  });

  it('discovers drafter.config.json at a git root walked up from cwd', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drafter-config-'));
    writeFileSync(join(tmpDir, '.git'), ''); // stand-in marker; existsSync only checks presence
    writeFileSync(
      join(tmpDir, 'drafter.config.json'),
      JSON.stringify({ prBody: { summaryWordLimit: 40, changedFilesWarningThreshold: 15 } }),
    );
    const nestedDir = join(tmpDir, 'a', 'b');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(nestedDir, { recursive: true });

    const config = await loadDrafterConfig({ cwd: nestedDir });
    expect(config.prBody.summaryWordLimit).toBe(40);
  });

  it('throws when an explicit path is given but does not exist', async () => {
    await expect(loadDrafterConfig({ explicitPath: '/does/not/exist/drafter.config.json' })).rejects.toThrow();
  });
});
