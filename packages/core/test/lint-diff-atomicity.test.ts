import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/default-taxonomy.js';
import { lintDiffAtomicity } from '../src/diff-atomicity/lint-diff-atomicity.js';

function diffBlock(path: string, added: string[], context: string[] = []): string {
  const hunkLines = [...context.map((l) => ` ${l}`), ...added.map((l) => `+${l}`)];
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${context.length} +1,${context.length + added.length} @@`,
    ...hunkLines,
  ].join('\n');
}

describe('lintDiffAtomicity', () => {
  it('flags generated files mixed with hand-written source as fatal', () => {
    const diffText = [diffBlock('dist/index.js', ['new content']), diffBlock('src/index.ts', ['new content'])].join('\n');
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'mixed-generated-and-source' && f.severity === 'fatal')).toBe(true);
  });

  it('flags an orphaned lockfile change with no manifest change as fatal', () => {
    const diffText = diffBlock('pnpm-lock.yaml', ['- some-dep: 1.0.0']);
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'orphaned-lockfile' && f.severity === 'fatal')).toBe(true);
  });

  it('does not flag a lockfile change accompanied by a manifest change', () => {
    const diffText = [diffBlock('pnpm-lock.yaml', ['dep: 1.0.0']), diffBlock('package.json', ['"dep": "1.0.0"'])].join('\n');
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'orphaned-lockfile')).toBe(false);
  });

  it('flags an added debugger statement as fatal', () => {
    const diffText = diffBlock('src/foo.ts', ['debugger;'], ['function foo() {', '}']);
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'debugger-statement' && f.severity === 'fatal')).toBe(true);
  });

  it('flags an added .only test as fatal and an added .skip test as a warning', () => {
    const onlyDiff = diffBlock('src/foo.test.ts', ["it.only('x', () => {});"], ["describe('x', () => {", '});']);
    const onlyFindings = lintDiffAtomicity({ diffText: onlyDiff, config: DEFAULT_CONFIG });
    expect(onlyFindings.some((f) => f.kind === 'focused-test' && f.severity === 'fatal')).toBe(true);

    const skipDiff = diffBlock('src/foo.test.ts', ["it.skip('x', () => {});"], ["describe('x', () => {", '});']);
    const skipFindings = lintDiffAtomicity({ diffText: skipDiff, config: DEFAULT_CONFIG });
    expect(skipFindings.some((f) => f.kind === 'skipped-test' && f.severity === 'warning')).toBe(true);
  });

  it('flags a diff spanning three or more unrelated top-level areas as a warning', () => {
    const diffText = [diffBlock('alpha/x.ts', ['new']), diffBlock('beta/y.ts', ['new']), diffBlock('gamma/z.ts', ['new'])].join('\n');
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'unrelated-areas' && f.severity === 'warning')).toBe(true);
  });

  it('does not flag two related areas', () => {
    const diffText = [diffBlock('alpha/x.ts', ['new']), diffBlock('alpha/y.ts', ['new'])].join('\n');
    const findings = lintDiffAtomicity({ diffText, config: DEFAULT_CONFIG });
    expect(findings.some((f) => f.kind === 'unrelated-areas')).toBe(false);
  });

  it('groups by packages/<name> when monorepoDirs is configured', () => {
    const config = { ...DEFAULT_CONFIG, diffAtomicity: { ...DEFAULT_CONFIG.diffAtomicity, monorepoDirs: ['packages'] } };
    const diffText = [diffBlock('packages/a/x.ts', ['new']), diffBlock('packages/a/y.ts', ['new']), diffBlock('packages/b/z.ts', ['new'])].join('\n');
    // Only 2 distinct areas (packages/a, packages/b) — should NOT trip unrelated-areas.
    const findings = lintDiffAtomicity({ diffText, config });
    expect(findings.some((f) => f.kind === 'unrelated-areas')).toBe(false);
  });
});
