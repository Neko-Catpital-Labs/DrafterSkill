export * from './types.js';
export { loadDrafterConfig, DEFAULT_CONFIG, drafterConfigSchema, drafterConfigInputSchema } from './config/load-config.js';
export type { LoadDrafterConfigOptions } from './config/load-config.js';

export { parseUnifiedDiff, classifyPath } from './diff/parse-unified-diff.js';

export {
  firstMeaningfulLine,
  getMarkdownSection,
  getLabelSection,
  normalizeReviewUnit,
  detectReviewUnits,
  formatReviewUnits,
  validateSingleReviewUnitFocus,
  validateReviewUnitValue,
  validateReviewLaneUnitCompatibility,
  validateReviewUnitFocus,
  classifyReviewUnitsForPath,
  reviewUnitsForChangedFiles,
  validateReviewUnitChangedFiles,
  validateKnownReviewBoundaries,
  parseChangeTypeItems,
  validateChangeTypeItems,
} from './review-unit/classify-review-unit.js';

export {
  lintDiffAtomicity,
  lintDiffAtomicityForGit,
  formatDiffAtomicityFindings,
} from './diff-atomicity/lint-diff-atomicity.js';
export type { LintDiffAtomicityOptions, LintDiffAtomicityForGitOptions } from './diff-atomicity/lint-diff-atomicity.js';

export {
  validatePrBody,
  validateMermaidBlocks,
  validatePrScope,
  getPrAtomicityBlockers,
  getPrBodyWarnings,
  getReviewMetadata,
} from './pr-body/validate-pr-body.js';
export type { ValidatePrBodyOptions, ReviewMetadata } from './pr-body/validate-pr-body.js';

export { renderPrBodyTemplate } from './pr-body/pr-body-template.js';
export { renderPrBody } from './pr-body/render-pr-body.js';
export type { PrBodyFields, RevertPlanFields, ArchitectureFields } from './pr-body/render-pr-body.js';

export { proposeSafetyInvariant } from './safety-invariant/propose-safety-invariant.js';
export type { ProposeSafetyInvariantInput, ProposeSafetyInvariantResult } from './safety-invariant/propose-safety-invariant.js';

export { classifyReviewScope } from './scope/classify-review-scope.js';
export type {
  ClassifyReviewScopeInput,
  ClassifyReviewScopeResult,
  ScopeResolved,
  ScopeNeedsClarification,
  ScopeQuestion,
  ScopeQuestionKind,
  ScopeAssumption,
  ScopeFinding,
} from './scope/classify-review-scope.js';
