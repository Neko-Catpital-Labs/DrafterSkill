import { classifyReviewUnitsForPath, reviewUnitsForChangedFiles } from '../review-unit/classify-review-unit.js';
import { lintDiffAtomicity } from '../diff-atomicity/lint-diff-atomicity.js';
import { proposeSafetyInvariant } from '../safety-invariant/propose-safety-invariant.js';
import type { DrafterConfig, ReviewLaneId } from '../types.js';

export interface ScopeFinding {
  kind: string;
  severity: 'info' | 'warning';
  message: string;
}

export type ScopeQuestionKind = 'review_lane' | 'review_unit_split' | 'slice_boundary' | 'pairing_ban' | 'other';

export interface ScopeQuestion {
  id: string;
  kind: ScopeQuestionKind;
  question: string;
  whyItMatters: string;
  options?: string[];
  defaultIfUnanswered?: string;
}

export interface ScopeAssumption {
  field: string;
  value: string;
  rationale: string;
}

export interface ClassifyReviewScopeInput {
  diff?: string;
  changedFiles?: string[];
  proposedSummary?: string;
  reviewLaneHint?: string;
  reviewUnitHint?: string;
  /** Answers to a prior round's questions, keyed by question id. Omit on the first call. */
  priorAnswers?: Record<string, string>;
  /** Mirrors the split-scope skill's headless/benchmark opt-out: never ask, always resolve+assume. */
  noninteractive?: boolean;
  config: DrafterConfig;
}

export interface ScopeResolved {
  status: 'resolved';
  reviewLane: string;
  reviewUnit: string | null;
  /** Advisory only — never a gate. The skill/agent still always confirms this in chat. */
  suggestedSafetyInvariant: string;
  assumptions: ScopeAssumption[];
  findings: ScopeFinding[];
}

export interface ScopeNeedsClarification {
  status: 'needs_clarification';
  questions: ScopeQuestion[];
  /** Verbatim-relayable text for a calling agent to show the user. */
  clarificationText: string;
  partial: { reviewLaneGuess?: string; candidateUnits?: string[] };
}

export type ClassifyReviewScopeResult = ScopeResolved | ScopeNeedsClarification;

function laneCoverage(config: DrafterConfig, lane: ReviewLaneId, presentUnits: string[]): number {
  if (presentUnits.length === 0) return 1;
  const compat = config.taxonomy.compatibility.find((c) => c.lane === lane);
  if (!compat) return 0;
  const productUnits = new Set(config.taxonomy.units.filter((u) => u.isProductUnit).map((u) => u.id));
  const covered = presentUnits.filter((unit) => (compat.anyProductUnit && productUnits.has(unit)) || (compat.units ?? []).includes(unit));
  return covered.length / presentUnits.length;
}

function buildClarificationText(questions: ScopeQuestion[]): string {
  return questions
    .map((q, i) => `${i + 1}. ${q.question} (${q.whyItMatters})${q.defaultIfUnanswered ? ` [default: ${q.defaultIfUnanswered}]` : ''}`)
    .join('\n');
}

export function classifyReviewScope(input: ClassifyReviewScopeInput): ClassifyReviewScopeResult {
  const { config, changedFiles = [], priorAnswers = {}, noninteractive = false } = input;
  const assumptions: ScopeAssumption[] = [];
  const findings: ScopeFinding[] = [];
  const questions: ScopeQuestion[] = [];

  const presentUnits = reviewUnitsForChangedFiles(changedFiles, config);
  const productUnits = new Set(config.taxonomy.units.filter((u) => u.isProductUnit).map((u) => u.id));
  const presentProductUnits = presentUnits.filter((u) => productUnits.has(u));

  // --- Review lane resolution ---
  let reviewLane: string | undefined = input.reviewLaneHint?.trim();
  const laneCoverages = config.taxonomy.lanes.map((l) => ({ lane: l.id, coverage: laneCoverage(config, l.id, presentUnits) }));
  const bestLane = laneCoverages.slice().sort((a, b) => b.coverage - a.coverage)[0];
  const fullCoverageLanes = laneCoverages.filter((l) => l.coverage >= 0.999);

  if (reviewLane) {
    assumptions.push({ field: 'reviewLane', value: reviewLane, rationale: 'Provided explicitly by the caller.' });
  } else if (fullCoverageLanes.length === 1) {
    reviewLane = fullCoverageLanes[0].lane;
    assumptions.push({ field: 'reviewLane', value: reviewLane, rationale: `All changed files' review units are compatible with lane "${reviewLane}".` });
  } else if (priorAnswers['review-lane']) {
    reviewLane = priorAnswers['review-lane'];
  } else if (noninteractive) {
    reviewLane = bestLane?.lane ?? config.taxonomy.lanes[0]?.id;
    if (reviewLane) {
      assumptions.push({ field: 'reviewLane', value: reviewLane, rationale: 'noninteractive: no single lane fully covered the changed files; picked the best-covering lane.' });
    }
  } else if (fullCoverageLanes.length === 0 && presentUnits.length > 0) {
    questions.push({
      id: 'review-lane',
      kind: 'review_lane',
      question: `Which review lane best describes this change: ${fullCoverageLanes.map((l) => l.lane).join(', ') || config.taxonomy.lanes.map((l) => l.id).join(', ')}?`,
      whyItMatters: 'No single lane\'s compatible unit set covers all the changed, non-neutral files — the wrong lane will fail scope validation.',
      options: config.taxonomy.lanes.map((l) => l.id),
      defaultIfUnanswered: bestLane?.lane,
    });
  } else if (fullCoverageLanes.length > 1) {
    questions.push({
      id: 'review-lane',
      kind: 'review_lane',
      question: `More than one lane fits equally well (${fullCoverageLanes.map((l) => l.lane).join(', ')}) — which is this PR's actual review lane?`,
      whyItMatters: 'Multiple lanes are structurally compatible; only you know the intended framing of this change.',
      options: fullCoverageLanes.map((l) => l.lane),
      defaultIfUnanswered: fullCoverageLanes[0].lane,
    });
  }

  // --- Review unit split ambiguity ---
  let reviewUnit: string | undefined = input.reviewUnitHint?.trim();
  if (!reviewUnit) {
    if (presentProductUnits.length === 1) {
      reviewUnit = presentProductUnits[0];
      assumptions.push({ field: 'reviewUnit', value: reviewUnit, rationale: 'Exactly one product unit is present among the changed files.' });
    } else if (presentProductUnits.length > 1) {
      if (priorAnswers['review-unit-split']) {
        reviewUnit = priorAnswers['review-unit-split'];
      } else if (noninteractive) {
        reviewUnit = presentProductUnits[0];
        assumptions.push({ field: 'reviewUnit', value: reviewUnit, rationale: `noninteractive: multiple product units present (${presentProductUnits.join(', ')}); picked the first.` });
      } else {
        questions.push({
          id: 'review-unit-split',
          kind: 'review_unit_split',
          question: `Changed files span multiple review units (${presentProductUnits.join(', ')}) — is this intentionally one PR, or should it split into one PR per unit?`,
          whyItMatters: 'A PR declaring one Review Unit cannot ship files belonging to a different unit; if this is really one claim, say which unit to declare — otherwise it needs to split.',
          options: [...presentProductUnits, 'split into separate PRs'],
        });
      }
    } else if (presentUnits.length === 1) {
      reviewUnit = presentUnits[0];
      assumptions.push({ field: 'reviewUnit', value: reviewUnit, rationale: 'Exactly one (non-product) review unit is present among the changed files.' });
    }
  }

  // --- Slice-boundary ambiguity (diff-atomicity's unrelated-areas signal) ---
  if (input.diff) {
    const diffFindings = lintDiffAtomicity({ diffText: input.diff, reviewLane, config });
    const unrelatedAreas = diffFindings.find((f) => f.kind === 'unrelated-areas');
    if (unrelatedAreas) {
      if (priorAnswers['slice-boundary']) {
        assumptions.push({ field: 'sliceBoundary', value: priorAnswers['slice-boundary'], rationale: 'Answered in a prior round.' });
      } else if (noninteractive) {
        assumptions.push({ field: 'sliceBoundary', value: 'one PR', rationale: 'noninteractive: diff spans multiple areas but no stack intent was stated; proceeding as one PR.' });
        findings.push({ kind: 'unrelated-areas', severity: 'warning', message: unrelatedAreas.message });
      } else {
        questions.push({
          id: 'slice-boundary',
          kind: 'slice_boundary',
          question: `${unrelatedAreas.message} Is this intentionally one PR, or should it split into a stack?`,
          whyItMatters: 'Each framing changes what a reviewer is being asked to approve in one sitting.',
          defaultIfUnanswered: 'one PR',
        });
      }
    }
    for (const f of diffFindings) {
      if (f.kind !== 'unrelated-areas') findings.push({ kind: f.kind, severity: f.severity === 'fatal' ? 'warning' : (f.severity as 'info' | 'warning'), message: f.message });
    }
  }

  // --- Pairing bans (half-triggered) ---
  const changedFileSet = new Set(changedFiles);
  for (const ban of config.classification.pairingBans) {
    const [a, b] = ban.paths;
    const halfTriggered = (changedFileSet.has(a) && !changedFileSet.has(b)) || (!changedFileSet.has(a) && changedFileSet.has(b));
    if (!halfTriggered) continue;
    const answerId = `pairing-ban:${ban.id}`;
    if (priorAnswers[answerId]) {
      assumptions.push({ field: answerId, value: priorAnswers[answerId], rationale: 'Answered in a prior round.' });
      continue;
    }
    if (noninteractive) {
      findings.push({ kind: 'pairing-ban-proximity', severity: 'warning', message: `${ban.message} (only one side of this pairing changed — verify the other half isn't coming in this same PR)` });
      continue;
    }
    questions.push({
      id: answerId,
      kind: 'pairing_ban',
      question: `Only one side of a configured pairing ban changed (${ban.message}) — is the other side intentionally excluded from this PR?`,
      whyItMatters: 'If the other side is coming in this same PR, it would violate a configured architectural boundary.',
      defaultIfUnanswered: 'yes, intentionally excluded',
    });
  }

  if (questions.length > 0) {
    return {
      status: 'needs_clarification',
      questions,
      clarificationText: buildClarificationText(questions),
      partial: { reviewLaneGuess: bestLane?.lane, candidateUnits: presentProductUnits },
    };
  }

  const { draftText } = proposeSafetyInvariant({
    reviewClaim: input.proposedSummary ?? '',
    changedFiles,
  });

  return {
    status: 'resolved',
    reviewLane: reviewLane ?? config.taxonomy.lanes[0]?.id ?? 'behavior',
    reviewUnit: reviewUnit ?? null,
    suggestedSafetyInvariant: draftText,
    assumptions,
    findings,
  };
}
