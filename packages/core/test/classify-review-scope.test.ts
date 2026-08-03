import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/default-taxonomy.js';
import { classifyReviewScope } from '../src/scope/classify-review-scope.js';
import type { DrafterConfig } from '../src/types.js';

const multiProductUnitConfig: DrafterConfig = {
  ...DEFAULT_CONFIG,
  taxonomy: {
    lanes: DEFAULT_CONFIG.taxonomy.lanes,
    units: [
      { id: 'contract', isProductUnit: true },
      { id: 'surface', isProductUnit: true },
      { id: 'docs', isProductUnit: false },
    ],
    compatibility: [
      { lane: 'behavior', anyProductUnit: true },
      { lane: 'refactor', anyProductUnit: true },
      { lane: 'docs', units: ['docs'] },
    ],
  },
  classification: {
    ...DEFAULT_CONFIG.classification,
    pathRules: [
      { id: 'docs', pathGlob: '**/*.md', unit: ['docs'] },
      { id: 'contract', pathGlob: 'contracts/**', unit: ['contract'] },
      { id: 'surface', pathGlob: 'surface/**', unit: ['surface'] },
      { id: 'catch-all', pathGlob: '**/*', unit: [] },
    ],
    pairingBans: [
      { id: 'publish-vs-poll', paths: ['a/publish.ts', 'a/poll.ts'], message: 'publish.ts and poll.ts must never ship together.' },
    ],
  },
};

describe('classifyReviewScope', () => {
  it('resolves silently when exactly one lane fully covers the changed files', () => {
    const result = classifyReviewScope({ changedFiles: ['docs/guide.md'], config: DEFAULT_CONFIG });
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.reviewLane).toBe('docs');
      expect(result.reviewUnit).toBe('docs');
      expect(result.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('trusts an explicit reviewLaneHint without asking', () => {
    const result = classifyReviewScope({
      changedFiles: ['src/app.ts'],
      reviewLaneHint: 'behavior',
      config: DEFAULT_CONFIG,
    });
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') expect(result.reviewLane).toBe('behavior');
  });

  it('asks when multiple product units are genuinely mixed with no grouping rule', () => {
    const result = classifyReviewScope({
      changedFiles: ['contracts/a.ts', 'surface/b.ts'],
      reviewLaneHint: 'behavior',
      config: multiProductUnitConfig,
    });
    expect(result.status).toBe('needs_clarification');
    if (result.status === 'needs_clarification') {
      expect(result.questions.some((q) => q.kind === 'review_unit_split')).toBe(true);
      expect(result.clarificationText).toContain('contract');
    }
  });

  it('resolves the same input when noninteractive is set, recording an assumption instead of asking', () => {
    const result = classifyReviewScope({
      changedFiles: ['contracts/a.ts', 'surface/b.ts'],
      reviewLaneHint: 'behavior',
      noninteractive: true,
      config: multiProductUnitConfig,
    });
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.assumptions.some((a) => a.field === 'reviewUnit')).toBe(true);
    }
  });

  it('resolves on a second call when priorAnswers supplies the earlier question\'s answer', () => {
    const first = classifyReviewScope({
      changedFiles: ['contracts/a.ts', 'surface/b.ts'],
      reviewLaneHint: 'behavior',
      config: multiProductUnitConfig,
    });
    expect(first.status).toBe('needs_clarification');

    const second = classifyReviewScope({
      changedFiles: ['contracts/a.ts', 'surface/b.ts'],
      reviewLaneHint: 'behavior',
      priorAnswers: { 'review-unit-split': 'contract' },
      config: multiProductUnitConfig,
    });
    expect(second.status).toBe('resolved');
    if (second.status === 'resolved') expect(second.reviewUnit).toBe('contract');
  });

  it('asks about a half-triggered pairing ban', () => {
    const result = classifyReviewScope({
      changedFiles: ['a/publish.ts'],
      reviewLaneHint: 'behavior',
      config: multiProductUnitConfig,
    });
    expect(result.status).toBe('needs_clarification');
    if (result.status === 'needs_clarification') {
      expect(result.questions.some((q) => q.kind === 'pairing_ban')).toBe(true);
    }
  });

  it('does not ask about a pairing ban when both sides changed together (not half-triggered)', () => {
    const result = classifyReviewScope({
      changedFiles: ['a/publish.ts', 'a/poll.ts'],
      reviewLaneHint: 'behavior',
      config: multiProductUnitConfig,
    });
    expect(result.status === 'needs_clarification' ? result.questions.some((q) => q.kind === 'pairing_ban') : false).toBe(false);
  });
});
