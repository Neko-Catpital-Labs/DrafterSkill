import type { DrafterConfig } from '../types.js';

/**
 * Deliberately shallow, not fake-generic: a repo with zero config still gets a
 * fully working default that enforces the one truly universal invariant —
 * don't mix a product change with docs/cleanup/policy/proof in one PR —
 * without pretending to know a repo's internal architecture. Repos that want
 * deeper unit taxonomy (read-path/write-path/routing/etc.) author their own
 * `drafter.config.json`.
 */
export const DEFAULT_CONFIG: DrafterConfig = {
  taxonomy: {
    lanes: [
      { id: 'behavior' },
      { id: 'refactor' },
      { id: 'proof' },
      { id: 'cleanup' },
      { id: 'policy' },
      { id: 'docs' },
    ],
    units: [
      { id: 'product', isProductUnit: true },
      { id: 'cleanup', isProductUnit: false },
      { id: 'policy', isProductUnit: false },
      { id: 'proof', isProductUnit: false, coLocatesWithProductUnits: true },
      { id: 'docs', isProductUnit: false },
    ],
    compatibility: [
      { lane: 'behavior', anyProductUnit: true },
      { lane: 'refactor', anyProductUnit: true },
      { lane: 'cleanup', units: ['cleanup'] },
      { lane: 'policy', units: ['policy'] },
      { lane: 'proof', units: ['proof'] },
      { lane: 'docs', units: ['docs'] },
    ],
  },
  classification: {
    pathRules: [
      { id: 'docs-by-extension', pathGlob: '**/*.{md,mdx}', unit: ['docs'] },
      { id: 'docs-dir', pathGlob: 'docs/**', unit: ['docs'] },
      { id: 'lockfiles-neutral', pathGlob: '**/{package,package-lock,pnpm-lock,yarn}*.{json,yaml,lock}', unit: [] },
      { id: 'manifests-neutral', pathGlob: '**/tsconfig*.json', unit: [] },
      { id: 'tests-neutral', basenamePattern: '\\.(spec|test)\\.[^./]+$', unit: [] },
      { id: 'proof-dirs', pathGlob: '**/{test,tests,__tests__,e2e}/**', unit: ['proof'] },
      { id: 'ci-policy', pathGlob: '.github/**', unit: ['policy'] },
      { id: 'catch-all-product', pathGlob: '**/*', unit: ['product'] },
    ],
    pairingBans: [],
    textPatterns: [],
  },
  changeTypes: {
    allowedOperations: ['create', 'modify', 'delete', 'rename', 'move', 'config-only', 'test-only', 'docs-only', 'generated', 'none'],
    topLevelDirs: undefined,
  },
  diffAtomicity: {
    monorepoDirs: [],
    // Generic across nearly any JS/TS/web project — not project-specific, unlike monorepoDirs.
    generatedDirs: ['dist', 'out', 'build', 'coverage', '.next', '__generated__'],
    codeExtensions: ['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'],
  },
  prBody: {
    summaryWordLimit: 30,
    changedFilesWarningThreshold: 10,
  },
};
