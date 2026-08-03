import {
  formatReviewUnits,
  getLabelSection,
  getMarkdownSection,
  normalizeReviewUnit,
  reviewUnitsForChangedFiles,
  validateKnownReviewBoundaries,
  validateReviewLaneUnitCompatibility,
  validateReviewUnitChangedFiles,
  validateReviewUnitFocus,
  validateReviewUnitValue,
} from '../review-unit/classify-review-unit.js';
import { lintDiffAtomicity, formatDiffAtomicityFindings } from '../diff-atomicity/lint-diff-atomicity.js';
import type { DrafterConfig, Finding, ReviewLaneId, ValidationResult } from '../types.js';

const REQUIRED_SECTIONS = ['## Summary', '## Non-goals', '## Test Plan', '## Revert Plan'];
const REQUIRED_METADATA_SECTIONS = ['## Review Claim', '## Review Lane', '## Review Unit', '## Safety Invariant', '## Slice Rationale'];
const REQUIRED_METADATA_LABELS = ['Review Claim', 'Review Lane', 'Review Unit', 'Safety Invariant', 'Slice Rationale'];
const COLLAPSED_PLAN_SECTIONS = [
  { heading: '## Test Plan', label: 'Test Plan' },
  { heading: '## Revert Plan', label: 'Revert Plan' },
];
const DISCOURAGED_HEADINGS = ['## Testing', '## Notes'];

const MERMAID_BLOCK_PATTERN = /```mermaid[^\n]*\n([\s\S]*?)```/gi;
const MERMAID_LABEL_QUOTE_GUIDANCE = 'Quote Mermaid labels that contain prose or code-ish text, for example A["reviewGate.artifacts[] is pending"].';

let mermaidApiPromise: Promise<typeof import('mermaid').default> | undefined;
let mermaidRenderCounter = 0;

function extractMermaidBlocks(body: string): { index: number; source: string }[] {
  const blocks: { index: number; source: string }[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = MERMAID_BLOCK_PATTERN.exec(body)) !== null) {
    index += 1;
    blocks.push({ index, source: match[1].trim() });
  }
  return blocks;
}

function summarizeMermaidError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? (error as { message: unknown }).message : error;
  return String(message ?? error).replace(/\s+/g, ' ').trim();
}

async function getMermaidApi() {
  if (!mermaidApiPromise) {
    mermaidApiPromise = (async () => {
      const { JSDOM } = await import('jsdom');
      const { window } = new JSDOM('<body></body>', { pretendToBeVisual: true });
      const g = globalThis as unknown as Record<string, unknown>;
      g.window = window;
      g.document = window.document;
      g.Element = window.Element;
      g.HTMLElement = window.HTMLElement;
      g.SVGElement = window.SVGElement;
      g.Node = window.Node;
      g.DOMParser = window.DOMParser;
      g.XMLSerializer = window.XMLSerializer;
      g.getComputedStyle = window.getComputedStyle;
      g.CSSStyleSheet = window.CSSStyleSheet;

      const svgProto = window.SVGElement.prototype as unknown as {
        getBBox?: () => { x: number; y: number; width: number; height: number };
        getComputedTextLength?: () => number;
        textContent: string | null;
      };
      if (!svgProto.getBBox) {
        svgProto.getBBox = function (this: { textContent: string | null }) {
          const text = this.textContent || '';
          return { x: 0, y: 0, width: Math.max(10, text.length * 8), height: 16 };
        };
      }
      if (!svgProto.getComputedTextLength) {
        svgProto.getComputedTextLength = function (this: { textContent: string | null }) {
          const text = this.textContent || '';
          return Math.max(10, text.length * 8);
        };
      }

      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      return mermaid;
    })();
  }
  return mermaidApiPromise;
}

export async function validateMermaidBlocks(body: string, options: { context?: string } = {}): Promise<string[]> {
  const context = options.context ?? 'PR body';
  const mermaidBlocks = extractMermaidBlocks(body);
  if (mermaidBlocks.length === 0) return [];

  const mermaid = await getMermaidApi();
  const errors: string[] = [];
  for (const block of mermaidBlocks) {
    try {
      await mermaid.parse(block.source);
      mermaidRenderCounter += 1;
      await mermaid.render(`pr-body-mermaid-${mermaidRenderCounter}`, block.source);
    } catch (error) {
      errors.push(`${context} Mermaid block ${block.index} is invalid: ${summarizeMermaidError(error)} ${MERMAID_LABEL_QUOTE_GUIDANCE}`);
    }
  }
  return errors;
}

function getSectionBody(body: string, heading: string): string {
  return getMarkdownSection(body, heading);
}

function getCollapsedPlanBlock(body: string, heading: string, label: string): { body: string; openAttributes: string } | null {
  const section = getSectionBody(body, heading);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`<details\\b([^>]*)>\\s*<summary>\\s*${escaped}\\s*</summary>([\\s\\S]*?)</details>`, 'i'));
  if (!match) return null;
  return { body: match[2].trim(), openAttributes: match[1] };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getVisualProofBody(body: string): string {
  return getSectionBody(body, '## Visual Proof');
}

function hasVisualProofMedia(body: string): boolean {
  const visualProof = getVisualProofBody(body);
  if (!visualProof) return false;
  return (
    /!\[[^\]]*\]\([^)]+\)/.test(visualProof)
    || /\[[^\]]*(?:video|walkthrough|recording|animation|gif)[^\]]*\]\([^)]+\)/i.test(visualProof)
    || /\bhttps?:\/\/\S+\.(?:png|jpe?g|gif|webp|webm|mp4)\b/i.test(visualProof)
  );
}

function hasAnimatedVisualProofMedia(body: string): boolean {
  const visualProof = getVisualProofBody(body);
  if (!visualProof) return false;
  return (
    /!\[[^\]]*\]\([^)]+\.(?:gif|webm|mp4)(?:\?[^)]*)?\)/i.test(visualProof)
    || /\[[^\]]*(?:video|walkthrough|recording|animation|gif)[^\]]*\]\([^)]+\)/i.test(visualProof)
    || /\bhttps?:\/\/\S+\.(?:gif|webm|mp4)\b/i.test(visualProof)
  );
}

function visualProofNeedsAnimation(body: string): boolean {
  const visualProof = getVisualProofBody(body);
  if (!visualProof) return false;
  return (
    /\brestart|relaunch|reload\b/i.test(visualProof)
    || /\btransition|state change\b/i.test(visualProof)
    || (/\bbefore\b/i.test(visualProof) && /\bafter\b/i.test(visualProof))
  );
}

function getLegacyReviewMetadataBlock(body: string): { body: string; openAttributes: string } {
  const summary = getSectionBody(body, '## Summary');
  const match = summary.match(/<details\b([^>]*)>\s*<summary>\s*Review metadata\s*<\/summary>([\s\S]*?)<\/details>/i);
  if (!match) return { body: '', openAttributes: '' };
  return { body: match[2].trim(), openAttributes: match[1] };
}

function hasVisibleReviewMetadata(body: string): boolean {
  return REQUIRED_METADATA_SECTIONS.some((heading) => getSectionBody(body, heading));
}

export interface ReviewMetadata {
  reviewClaim: string;
  reviewLane: string;
  reviewUnit: string;
  safetyInvariant: string;
  sliceRationale: string;
}

export function getReviewMetadata(body: string): ReviewMetadata {
  if (hasVisibleReviewMetadata(body)) {
    return {
      reviewClaim: getSectionBody(body, '## Review Claim'),
      reviewLane: normalizeReviewUnit(getSectionBody(body, '## Review Lane')),
      reviewUnit: normalizeReviewUnit(getSectionBody(body, '## Review Unit')),
      safetyInvariant: getSectionBody(body, '## Safety Invariant'),
      sliceRationale: getSectionBody(body, '## Slice Rationale'),
    };
  }

  const legacy = getLegacyReviewMetadataBlock(body);
  return {
    reviewClaim: getLabelSection(legacy.body, 'Review Claim'),
    reviewLane: normalizeReviewUnit(getLabelSection(legacy.body, 'Review Lane')),
    reviewUnit: normalizeReviewUnit(getLabelSection(legacy.body, 'Review Unit')),
    safetyInvariant: getLabelSection(legacy.body, 'Safety Invariant'),
    sliceRationale: getLabelSection(legacy.body, 'Slice Rationale'),
  };
}

function stripDetailsBlocks(text: string): string {
  return String(text).replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, '').trim();
}

/**
 * Generalized replacement for Invoker's classifyScopeKind()/validatePrScope():
 * rather than a second, parallel path->kind classifier, this reuses the same
 * config-driven review-unit classification and the lane<->unit compatibility
 * matrix already defined for the declared Review Unit check. A file's
 * classified unit (or units) must be compatible with the PR's declared lane,
 * independent of what Review Unit was declared — this is the safety net that
 * catches lane/file mismatches even when Review Unit itself is missing/wrong.
 */
export function validatePrScope(opts: { changedFiles?: string[]; reviewLane?: string; body?: string; config: DrafterConfig }): string[] {
  const { changedFiles = [], reviewLane = '', body = '', config } = opts;
  const errors: string[] = [];
  if (!reviewLane || changedFiles.length === 0) return errors;

  const compat = config.taxonomy.compatibility.find((c) => c.lane === (reviewLane as ReviewLaneId));
  if (compat) {
    const productUnits = new Set(config.taxonomy.units.filter((u) => u.isProductUnit).map((u) => u.id));
    const presentUnits = reviewUnitsForChangedFiles(changedFiles, config);
    const forbidden = presentUnits.filter((unit) => {
      if (compat.anyProductUnit && productUnits.has(unit)) return false;
      if ((compat.units ?? []).includes(unit)) return false;
      return true;
    });
    if (forbidden.length > 0) {
      errors.push(
        `Review lane ${reviewLane} cannot ship with ${formatReviewUnits(forbidden, config)} files in the same PR. Split ${reviewLane} work from those files into their own slice.`,
      );
    }
  }

  if (reviewLane === 'refactor') {
    const nonGoals = getSectionBody(body, '## Non-goals').toLowerCase();
    if (!/(no behavior change|behavior unchanged|unchanged behavior|pass unchanged)/.test(nonGoals)) {
      errors.push('Review lane refactor must state in ## Non-goals that behavior stays unchanged.');
    }
  }

  return errors;
}

export function getPrAtomicityBlockers(opts: { diffText?: string; reviewLane?: string; config: DrafterConfig }): string[] {
  const { diffText = '', reviewLane, config } = opts;
  if (!diffText) return [];
  return lintDiffAtomicity({ diffText, reviewLane, config })
    .filter((finding) => finding.severity === 'warning')
    .map((finding) => `Diff atomicity blocker: ${formatDiffAtomicityFindings([finding])[0]}`);
}

export function getPrBodyWarnings(
  body: string,
  opts: { changedFiles?: string[]; diffText?: string; config: DrafterConfig },
): string[] {
  const { changedFiles = [], diffText, config } = opts;
  const warnings: string[] = [];
  const summary = getSectionBody(body, '## Summary');
  if (summary) {
    const visibleSummary = stripDetailsBlocks(summary);
    const paragraphs = visibleSummary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    paragraphs.forEach((paragraph, index) => {
      const wordCount = countWords(paragraph);
      if (wordCount > config.prBody.summaryWordLimit) {
        warnings.push(`Summary paragraph ${index + 1} is ${wordCount} words. Keep each Summary paragraph under ${config.prBody.summaryWordLimit} words.`);
      }
    });
  }

  if (changedFiles.length > config.prBody.changedFilesWarningThreshold) {
    warnings.push(`PR changes ${changedFiles.length} files. Split before review unless this is one mechanical/generated slice.`);
  }

  const units = reviewUnitsForChangedFiles(changedFiles, config);
  if (units.length > 2) {
    warnings.push(`PR spans ${units.length} review units: ${formatReviewUnits(units, config)}.`);
  }

  if (diffText) {
    const { reviewLane } = getReviewMetadata(body);
    const diffWarnings = lintDiffAtomicity({ diffText, reviewLane, config }).filter((f) => f.severity === 'warning');
    for (const line of formatDiffAtomicityFindings(diffWarnings)) {
      warnings.push(`Diff atomicity warning: ${line}`);
    }
  }

  return warnings;
}

export interface ValidatePrBodyOptions {
  requiresVisualProof?: boolean;
  changedFiles?: string[];
  diffText?: string;
  config: DrafterConfig;
}

export async function validatePrBody(body: string, options: ValidatePrBodyOptions): Promise<ValidationResult> {
  const { config } = options;
  const errors: string[] = [];
  const findings: Finding[] = [];
  const trimmed = body.trim();

  if (!trimmed) {
    return {
      valid: false,
      errors: [
        'PR body is empty. Use the canonical schema: ## Summary, ## Review Claim, ## Review Lane, ## Review Unit, ## Safety Invariant, ## Slice Rationale, ## Non-goals, and ## Test Plan and ## Revert Plan with collapsed details blocks.',
      ],
      warnings: [],
      findings: [],
    };
  }

  for (const heading of REQUIRED_SECTIONS) {
    if (!trimmed.includes(heading)) errors.push(`Missing required section: ${heading}`);
  }

  for (const heading of DISCOURAGED_HEADINGS) {
    if (trimmed.includes(heading)) {
      errors.push(`Unsupported section: ${heading}. Do not use the lightweight PR format; use the canonical review-compression schema instead.`);
    }
  }

  if (trimmed.includes('## Architecture')) {
    for (const subsection of ['### Before', '### After']) {
      if (!trimmed.includes(subsection)) errors.push(`Architecture section is missing required subsection: ${subsection}`);
    }
  }

  const legacyReviewMetadata = getLegacyReviewMetadataBlock(trimmed);
  const reviewMetadataFromVisibleSections = hasVisibleReviewMetadata(trimmed);
  if (legacyReviewMetadata.body && !reviewMetadataFromVisibleSections) {
    errors.push('Do not hide review metadata in <details>. Use visible ## Review Claim / ## Review Lane / ## Review Unit / ## Safety Invariant / ## Slice Rationale sections.');
  }

  const { reviewClaim, reviewLane, reviewUnit, safetyInvariant, sliceRationale } = getReviewMetadata(trimmed);

  if (reviewMetadataFromVisibleSections) {
    for (const heading of REQUIRED_METADATA_SECTIONS) {
      if (!getSectionBody(trimmed, heading)) errors.push(`Missing required section: ${heading}`);
    }
  } else if (!legacyReviewMetadata.body) {
    errors.push('Missing review metadata. Add visible ## Review Claim / ## Review Lane / ## Review Unit / ## Safety Invariant / ## Slice Rationale sections.');
  } else {
    for (const label of REQUIRED_METADATA_LABELS) {
      if (!getLabelSection(legacyReviewMetadata.body, label)) errors.push(`Review metadata is missing required field: ${label}:`);
    }
  }

  for (const { heading, label } of COLLAPSED_PLAN_SECTIONS) {
    if (!trimmed.includes(heading)) continue;
    const block = getCollapsedPlanBlock(trimmed, heading, label);
    if (!block) {
      errors.push(`${heading} must wrap its content in a collapsed <details> block with <summary>${label}</summary>.`);
      continue;
    }
    if (/\bopen\b/i.test(block.openAttributes)) errors.push(`${label} details must be collapsed by default; remove the open attribute.`);
    if (!block.body) errors.push(`${label} details block must not be empty.`);
  }

  const validLanes = new Set(config.taxonomy.lanes.map((l) => l.id));
  if (reviewLane && !validLanes.has(reviewLane as ReviewLaneId)) {
    errors.push(`Invalid review lane: ${reviewLane}. Expected one of ${Array.from(validLanes).join(', ')}.`);
  }

  errors.push(...validateReviewUnitValue(reviewUnit, config));
  errors.push(...validateReviewLaneUnitCompatibility({ reviewLane, reviewUnit, config, context: 'PR body' }));

  if (reviewClaim !== undefined && reviewClaim !== null && getSectionBody(trimmed, '## Review Claim') && !reviewClaim.trim()) {
    errors.push('## Review Claim must not be empty.');
  }
  if (getSectionBody(trimmed, '## Safety Invariant') && !safetyInvariant.trim()) {
    errors.push('## Safety Invariant must not be empty.');
  }
  if (getSectionBody(trimmed, '## Slice Rationale') && !sliceRationale.trim()) {
    errors.push('## Slice Rationale must not be empty.');
  }

  errors.push(
    ...validateReviewUnitFocus({
      declaredReviewUnit: reviewUnit,
      config,
      context: 'PR body',
      texts: [getSectionBody(trimmed, '## Summary'), reviewClaim, sliceRationale],
    }),
  );

  errors.push(...(await validateMermaidBlocks(trimmed, { context: 'PR body' })));

  if (options.requiresVisualProof && !hasVisualProofMedia(trimmed)) {
    errors.push('UI-impacting changes require a ## Visual Proof section with at least one screenshot image or video/walkthrough link.');
  } else if (options.requiresVisualProof && visualProofNeedsAnimation(trimmed) && !hasAnimatedVisualProofMedia(trimmed)) {
    errors.push('Restart or multi-state visual proof must include animated media such as a gif, webm, mp4, or walkthrough/video link.');
  }

  if (reviewLane && options.changedFiles?.length) {
    errors.push(...validatePrScope({ changedFiles: options.changedFiles, reviewLane, body: trimmed, config }));
    errors.push(...validateReviewUnitChangedFiles({ declaredReviewUnit: reviewUnit, changedFiles: options.changedFiles, config, context: 'PR body' }));
    errors.push(...validateKnownReviewBoundaries({ reviewLane, changedFiles: options.changedFiles, config, context: 'PR body' }));
  }

  if (options.diffText) {
    const fatalFindings = lintDiffAtomicity({ diffText: options.diffText, config }).filter((f) => f.severity === 'fatal');
    for (const line of formatDiffAtomicityFindings(fatalFindings)) {
      errors.push(`Diff atomicity violation: ${line}`);
    }
    findings.push(...lintDiffAtomicity({ diffText: options.diffText, reviewLane, config }));
  }

  const warnings = getPrBodyWarnings(trimmed, { changedFiles: options.changedFiles, diffText: options.diffText, config });

  return { valid: errors.length === 0, errors, warnings, findings };
}
