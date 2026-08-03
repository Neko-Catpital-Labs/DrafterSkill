import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/default-taxonomy.js';
import {
  classifyReviewUnitsForPath,
  reviewUnitsForChangedFiles,
  validateReviewUnitChangedFiles,
  validateReviewLaneUnitCompatibility,
  validateChangeTypeItems,
} from '../src/review-unit/classify-review-unit.js';
import type { DrafterConfig } from '../src/types.js';

describe('classifyReviewUnitsForPath (default config)', () => {
  it('treats lockfiles and manifests as neutral', () => {
    expect(classifyReviewUnitsForPath('pnpm-lock.yaml', DEFAULT_CONFIG)).toEqual([]);
    expect(classifyReviewUnitsForPath('package.json', DEFAULT_CONFIG)).toEqual([]);
    expect(classifyReviewUnitsForPath('tsconfig.json', DEFAULT_CONFIG)).toEqual([]);
  });

  it('classifies markdown as docs', () => {
    expect(classifyReviewUnitsForPath('README.md', DEFAULT_CONFIG)).toEqual(['docs']);
    expect(classifyReviewUnitsForPath('docs/guide.md', DEFAULT_CONFIG)).toEqual(['docs']);
  });

  it('classifies test files as neutral (basenamePattern short-circuits before the proof-dir catch-all)', () => {
    expect(classifyReviewUnitsForPath('src/foo.test.ts', DEFAULT_CONFIG)).toEqual([]);
    expect(classifyReviewUnitsForPath('src/foo.spec.ts', DEFAULT_CONFIG)).toEqual([]);
  });

  it('classifies files under a test directory as proof', () => {
    expect(classifyReviewUnitsForPath('e2e/flow.ts', DEFAULT_CONFIG)).toEqual(['proof']);
  });

  it('classifies CI config as policy', () => {
    expect(classifyReviewUnitsForPath('.github/workflows/ci.yml', DEFAULT_CONFIG)).toEqual(['policy']);
  });

  it('falls back everything else to product', () => {
    expect(classifyReviewUnitsForPath('src/app.ts', DEFAULT_CONFIG)).toEqual(['product']);
  });
});

describe('classifyReviewUnitsForPath (custom, Invoker-shaped config)', () => {
  const invokerLikeConfig: DrafterConfig = {
    ...DEFAULT_CONFIG,
    taxonomy: {
      lanes: DEFAULT_CONFIG.taxonomy.lanes,
      units: [
        { id: 'contract', isProductUnit: true },
        { id: 'activation-surface', isProductUnit: true },
        { id: 'tooling-policy', isProductUnit: false },
        { id: 'docs', isProductUnit: false },
        { id: 'cleanup', isProductUnit: false },
      ],
      compatibility: [
        { lane: 'behavior', anyProductUnit: true },
        { lane: 'refactor', anyProductUnit: true },
        { lane: 'policy', units: ['tooling-policy'] },
        { lane: 'docs', units: ['docs'] },
        { lane: 'cleanup', units: ['cleanup'] },
        { lane: 'proof', units: [] },
      ],
    },
    classification: {
      ...DEFAULT_CONFIG.classification,
      pathRules: [
        { id: 'docs', pathGlob: '**/*.md', unit: ['docs'] },
        { id: 'ci', pathGlob: '.github/**', unit: ['tooling-policy'] },
        { id: 'scripts', pathGlob: 'scripts/**', unit: ['tooling-policy'] },
        { id: 'contracts', pathGlob: 'packages/contracts/**', unit: ['contract'] },
        { id: 'ui', pathGlob: 'packages/ui/**', unit: ['activation-surface'] },
        { id: 'manifests', basenamePattern: '^(package|tsconfig).*\\.json$', unit: [] },
        { id: 'catch-all', pathGlob: '**/*', unit: [] },
      ],
    },
  };

  it('matches this repo-shaped taxonomy the way review-unit-rules.mjs classified the same paths', () => {
    expect(classifyReviewUnitsForPath('packages/contracts/src/plan.ts', invokerLikeConfig)).toEqual(['contract']);
    expect(classifyReviewUnitsForPath('packages/ui/src/App.tsx', invokerLikeConfig)).toEqual(['activation-surface']);
    expect(classifyReviewUnitsForPath('scripts/validate-pr-body.mjs', invokerLikeConfig)).toEqual(['tooling-policy']);
    expect(classifyReviewUnitsForPath('skills/make-pr/SKILL.md', invokerLikeConfig)).toEqual(['docs']);
    expect(classifyReviewUnitsForPath('package.json', invokerLikeConfig)).toEqual([]);
  });

  it('rejects a declared unit that ships files assigned to another unit', () => {
    const errors = validateReviewUnitChangedFiles({
      declaredReviewUnit: 'contract',
      changedFiles: ['packages/contracts/src/plan.ts', 'packages/ui/src/App.tsx'],
      config: invokerLikeConfig,
      context: 'PR body',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('activation-surface');
  });

  it('enforces lane<->unit compatibility', () => {
    expect(
      validateReviewLaneUnitCompatibility({ reviewLane: 'docs', reviewUnit: 'contract', config: invokerLikeConfig, context: 'x' }),
    ).toHaveLength(1);
    expect(
      validateReviewLaneUnitCompatibility({ reviewLane: 'behavior', reviewUnit: 'contract', config: invokerLikeConfig, context: 'x' }),
    ).toHaveLength(0);
  });
});

describe('reviewUnitsForChangedFiles', () => {
  it('returns units in taxonomy order, deduplicated', () => {
    const units = reviewUnitsForChangedFiles(['README.md', 'src/a.ts', 'src/b.ts'], DEFAULT_CONFIG);
    expect(units).toEqual(['product', 'docs']);
  });
});

describe('validateChangeTypeItems', () => {
  it('accepts a per-file operation entry', () => {
    expect(validateChangeTypeItems('- src/app.ts: modify', DEFAULT_CONFIG, 'ctx')).toEqual([]);
  });

  it('rejects a conceptual description masquerading as a change-type entry', () => {
    const errors = validateChangeTypeItems('- implement the new validator', DEFAULT_CONFIG, 'ctx');
    expect(errors).toHaveLength(1);
  });
});
