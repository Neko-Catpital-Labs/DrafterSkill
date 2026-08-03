import picomatch from 'picomatch';
import type { DrafterConfig, ReviewLaneId } from '../types.js';

export function firstMeaningfulLine(value = ''): string {
  return (
    String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}

export function getMarkdownSection(body: string, heading: string): string {
  const lines = String(body).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (start === -1) return '';

  const sectionLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line.trim())) break;
    sectionLines.push(line);
  }
  return sectionLines.join('\n').trim();
}

export function getLabelSection(text: string, label: string): string {
  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|\\n)\\s*${labelPattern}:\\s*`, 'i');
  const match = pattern.exec(String(text));
  if (!match) return '';

  const start = match.index + match[0].length;
  const rest = String(text).slice(start);
  const nextHeading = /\n\s*[A-Za-z][A-Za-z _-]*:\s*/.exec(rest);
  return (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim();
}

export function normalizeReviewUnit(value = ''): string {
  return firstMeaningfulLine(value).replace(/^[-*]\s*/, '').trim().toLowerCase();
}

function productUnitIds(config: DrafterConfig): Set<string> {
  return new Set(config.taxonomy.units.filter((u) => u.isProductUnit).map((u) => u.id));
}

function coLocatingUnitIds(config: DrafterConfig): Set<string> {
  return new Set(config.taxonomy.units.filter((u) => u.coLocatesWithProductUnits).map((u) => u.id));
}

/**
 * The single shared "which present units are forbidden under this lane"
 * computation, used by validatePrScope, validateReviewUnitChangedFiles, and
 * classifyReviewScope's lane coverage/mismatch checks — previously each
 * reimplemented this independently, which let them disagree (found via
 * dogfooding: a directly-affected test file landing with its feature was
 * silently accepted by classifyReviewScope but hard-rejected by
 * validatePrBody). A unit marked `coLocatesWithProductUnits` is exempted
 * whenever at least one product unit is also present — split-scope's
 * Boundary Rules exception ("directly affected tests ... stay with the
 * change that requires them") applies only when there's a product change
 * present to be "directly affected"; a diff of ONLY co-locating-unit files
 * still needs a lane whose `compatibility` entry names that unit directly.
 */
export function forbiddenUnitsForLane(presentUnits: string[], reviewLane: string, config: DrafterConfig): string[] {
  const compat = config.taxonomy.compatibility.find((c) => c.lane === (reviewLane as ReviewLaneId));
  if (!compat) return [];
  const productUnits = productUnitIds(config);
  const coLocating = coLocatingUnitIds(config);
  const hasProductUnitPresent = presentUnits.some((unit) => productUnits.has(unit));
  return presentUnits.filter((unit) => {
    if (compat.anyProductUnit && productUnits.has(unit)) return false;
    if ((compat.units ?? []).includes(unit)) return false;
    if (hasProductUnitPresent && coLocating.has(unit)) return false;
    return true;
  });
}

function validUnitIds(config: DrafterConfig): Set<string> {
  return new Set(config.taxonomy.units.map((u) => u.id));
}

function includedWorkText(text: string): string {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !/\b(separate|non-goals?|do not|does not|without|no\s+)\b/i.test(line))
    .join('\n');
}

/**
 * Text-pattern (regex-over-prose) unit detection. Config-driven, defaults to
 * empty — a repo's own keyword vocabulary is required to make this safe; an
 * empty `textPatterns` means this check is skipped entirely rather than run
 * with someone else's tuned-for-a-different-repo patterns.
 */
export function detectReviewUnits(text: string, config: DrafterConfig): Set<string> {
  const haystack = String(text).toLowerCase();
  const detected = new Set<string>();
  for (const rule of config.classification.textPatterns) {
    const compiled = rule.patterns.map((source) => new RegExp(source, rule.flags ?? ''));
    if (compiled.some((pattern) => pattern.test(haystack))) {
      detected.add(rule.unit);
    }
  }
  return detected;
}

export function formatReviewUnits(units: Iterable<string>, config: DrafterConfig): string {
  const unitSet = new Set(units);
  return config.taxonomy.units
    .map((u) => u.id)
    .filter((id) => unitSet.has(id))
    .join(', ');
}

export function validateSingleReviewUnitFocus(opts: { texts?: string[]; config: DrafterConfig; context: string }): string[] {
  const { texts = [], config, context } = opts;
  if (config.classification.textPatterns.length === 0) return [];

  const errors: string[] = [];
  const productUnits = productUnitIds(config);
  const detected = new Set<string>();
  for (const text of texts) {
    for (const unit of detectReviewUnits(includedWorkText(text), config)) {
      detected.add(unit);
    }
  }

  const detectedProductUnits = Array.from(detected).filter((unit) => productUnits.has(unit));
  if (detectedProductUnits.length > 1) {
    errors.push(
      `${context} mentions multiple review units (${formatReviewUnits(detectedProductUnits, config)}); split into one conceptual unit per diff/task.`,
    );
  }

  if (detected.has('docs') && detectedProductUnits.length > 0) {
    errors.push(`${context} mixes docs language with product-unit language; split docs from implementation policy.`);
  }

  return errors;
}

export function validateReviewUnitValue(reviewUnit: string, config: DrafterConfig): string[] {
  if (!reviewUnit) return [];
  if (validUnitIds(config).has(reviewUnit)) return [];
  return [`Invalid review unit: ${reviewUnit}. Expected one of ${config.taxonomy.units.map((u) => u.id).join(', ')}.`];
}

export function validateReviewLaneUnitCompatibility(opts: {
  reviewLane?: string;
  reviewUnit?: string;
  config: DrafterConfig;
  context: string;
}): string[] {
  const { reviewLane = '', reviewUnit = '', config, context } = opts;
  if (!reviewLane || !validUnitIds(config).has(reviewUnit)) return [];

  const compat = config.taxonomy.compatibility.find((c) => c.lane === (reviewLane as ReviewLaneId));
  if (!compat) return [`${context} Review Lane "${reviewLane}" has no configured compatible units.`];

  const productUnits = productUnitIds(config);
  const compatible = (compat.anyProductUnit && productUnits.has(reviewUnit)) || (compat.units ?? []).includes(reviewUnit);
  if (compatible) return [];

  return [`${context} Review Lane "${reviewLane}" is not compatible with Review Unit "${reviewUnit}".`];
}

export function validateReviewUnitFocus(opts: {
  declaredReviewUnit: string;
  texts?: string[];
  config: DrafterConfig;
  context: string;
}): string[] {
  const { declaredReviewUnit, texts = [], config, context } = opts;
  const errors = validateSingleReviewUnitFocus({ texts, config, context });
  if (!validUnitIds(config).has(declaredReviewUnit) || config.classification.textPatterns.length === 0) return errors;

  const productUnits = productUnitIds(config);
  const detected = new Set<string>();
  for (const text of texts) {
    for (const unit of detectReviewUnits(includedWorkText(text), config)) {
      detected.add(unit);
    }
  }

  const detectedProductUnits = Array.from(detected).filter((unit) => productUnits.has(unit));
  if (detectedProductUnits.length === 1 && productUnits.has(declaredReviewUnit) && detectedProductUnits[0] !== declaredReviewUnit) {
    errors.push(`${context} Review Unit "${declaredReviewUnit}" does not match the described ${detectedProductUnits[0]} work.`);
  }

  return errors;
}

/** Ordered, first-match-wins path classification driven by config.classification.pathRules. */
export function classifyReviewUnitsForPath(filePath: string, config: DrafterConfig): string[] {
  const path = String(filePath).replace(/\\/g, '/');
  const basename = path.split('/').pop() ?? '';

  for (const rule of config.classification.pathRules) {
    let matched = false;
    if (rule.pathGlob) {
      matched = picomatch(rule.pathGlob)(path);
    } else if (rule.basenamePattern) {
      matched = new RegExp(rule.basenamePattern).test(basename);
    }
    if (matched) return rule.unit;
  }
  return [];
}

export function reviewUnitsForChangedFiles(changedFiles: string[] = [], config: DrafterConfig): string[] {
  const units = new Set<string>();
  for (const changedFile of changedFiles) {
    for (const unit of classifyReviewUnitsForPath(changedFile, config)) {
      units.add(unit);
    }
  }
  return config.taxonomy.units.map((u) => u.id).filter((id) => units.has(id));
}

export function validateReviewUnitChangedFiles(opts: {
  declaredReviewUnit: string;
  changedFiles?: string[];
  config: DrafterConfig;
  context: string;
}): string[] {
  const { declaredReviewUnit, changedFiles = [], config, context } = opts;
  if (!validUnitIds(config).has(declaredReviewUnit) || changedFiles.length === 0) return [];

  const presentUnitsForCheck = reviewUnitsForChangedFiles(changedFiles, config);
  const declaredIsProduct = productUnitIds(config).has(declaredReviewUnit);
  const hasProductUnitPresent = declaredIsProduct && presentUnitsForCheck.includes(declaredReviewUnit);
  const coLocating = coLocatingUnitIds(config);
  const forbidden = presentUnitsForCheck.filter(
    (unit) => unit !== declaredReviewUnit && !(hasProductUnitPresent && coLocating.has(unit)),
  );
  if (forbidden.length === 0) return [];

  return [
    `${context} Review Unit "${declaredReviewUnit}" cannot ship with ${formatReviewUnits(forbidden, config)} files in the same PR. Split this into one Review Unit per PR.`,
  ];
}

export function validateKnownReviewBoundaries(opts: {
  reviewLane?: string;
  changedFiles?: string[];
  config: DrafterConfig;
  context: string;
}): string[] {
  const { reviewLane = '', changedFiles = [], config, context } = opts;
  if (changedFiles.length === 0) return [];

  const changedFileSet = new Set(changedFiles);
  const errors: string[] = [];
  for (const ban of config.classification.pairingBans) {
    if (ban.appliesToLanes && !ban.appliesToLanes.includes(reviewLane as ReviewLaneId)) continue;
    const [a, b] = ban.paths;
    if (changedFileSet.has(a) && changedFileSet.has(b)) {
      errors.push(`${context} ${ban.message}`);
    }
  }
  return errors;
}

export function parseChangeTypeItems(section: string): string[] {
  return String(section)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function isPathLike(pathPart: string, topLevelDirs?: string[]): boolean {
  if (!pathPart.includes('/') || /\s/.test(pathPart)) return false;
  if (!topLevelDirs || topLevelDirs.length === 0) return true;
  const firstSegment = pathPart.split('/')[0];
  return topLevelDirs.includes(firstSegment);
}

export function validateChangeTypeItems(section: string, config: DrafterConfig, context: string): string[] {
  const errors: string[] = [];
  const allowedOps = new Set(config.changeTypes.allowedOperations);
  const productUnits = productUnitIds(config);

  for (const item of parseChangeTypeItems(section)) {
    const lower = item.toLowerCase();
    const directOperation = allowedOps.has(lower);
    const [pathPart, opPart = ''] = item.split(':', 2).map((part) => part.trim());
    const operation = opPart.toLowerCase().split(/\s+/)[0] ?? '';
    const pathWithOperation = isPathLike(pathPart, config.changeTypes.topLevelDirs) && allowedOps.has(operation);
    if (directOperation || pathWithOperation) continue;

    const detectedUnits = Array.from(detectReviewUnits(item, config)).filter((unit) => productUnits.has(unit));
    if (detectedUnits.length > 0 || /\b(add|implement|wire|route|validate|submit|scan)\b/i.test(item)) {
      errors.push(
        `${context} Change types entry "${item}" is conceptual work, not a per-file operation. Use entries like "path/to/file.ts: modify" and keep conceptual work in Review Claim or Slice Rationale.`,
      );
    }
  }
  return errors;
}
