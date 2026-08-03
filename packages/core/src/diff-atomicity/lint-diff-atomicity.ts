import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { parseUnifiedDiff } from '../diff/parse-unified-diff.js';
import type { DrafterConfig, Finding, ParsedDiffFile } from '../types.js';

/** Extensions consulted by the refactor-dead-symbol check only; codeExtensions stays TS-AST-only. */
const DEFINITION_EXTENSIONS_EXTRA = new Set(['.py']);
const TEST_FUNCTIONS = new Set(['describe', 'it', 'test', 'context', 'suite']);

const POLICY: Record<string, { severity: Finding['severity']; message: string }> = {
  'mixed-generated-and-source': {
    severity: 'fatal',
    message: 'Generated or build-output files are mixed with hand-written source in one diff; split them into separate PRs.',
  },
  'orphaned-lockfile': {
    severity: 'fatal',
    message: 'A dependency lockfile changed without a matching package manifest change; isolate lockfile churn in its own PR.',
  },
  'debugger-statement': {
    severity: 'fatal',
    message: 'A debugger statement was added to source; remove debug scaffolding before review.',
  },
  'focused-test': {
    severity: 'fatal',
    message: 'A focused test (.only) was added; it silently skips the rest of the suite.',
  },
  'skipped-test': {
    severity: 'warning',
    message: 'A skipped test (.skip) was added; confirm the skip is intentional.',
  },
  'unrelated-areas': {
    severity: 'warning',
    message: 'The diff spans multiple unrelated top-level areas; confirm this is one atomic change.',
  },
  'refactor-dead-symbol': {
    severity: 'warning',
    message: 'A refactor-lane PR adds a symbol with no reference anywhere else in the diff; confirm the extraction also re-pointed its call sites in this PR.',
  },
  'refactor-multiple-symbols': {
    severity: 'warning',
    message: 'A refactor-lane PR touches more than one top-level symbol in this diff; confirm this is one cohesive move (see the split-scope skill\'s Decomposition & Extraction Refactors section) or split into separate PRs.',
  },
};

function makeFinding(kind: string, filePath: string | null, line: number | null, source: string): Finding {
  const policy = POLICY[kind];
  return {
    kind,
    severity: policy.severity,
    message: policy.message,
    file: filePath ?? undefined,
    line: line ?? undefined,
  };
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.ts') return ts.ScriptKind.TS;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function rootIdentifier(node: ts.Expression): string {
  let expression: ts.Expression = node;
  while (ts.isPropertyAccessExpression(expression)) {
    expression = expression.expression;
  }
  return ts.isIdentifier(expression) ? expression.text : '';
}

function collectAstFindings(file: ParsedDiffFile, config: DrafterConfig): Finding[] {
  if (!config.diffAtomicity.codeExtensions.includes(path.extname(file.path)) || file.category === 'generated') {
    return [];
  }
  const findings: Finding[] = [];
  const sourceFile = ts.createSourceFile(file.path, file.newContent, ts.ScriptTarget.Latest, true, scriptKindFor(file.path));

  const record = (kind: string, node: ts.Node) => {
    const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    if (file.addedLineNumbers.has(lineNumber)) {
      findings.push(makeFinding(kind, file.path, lineNumber, file.source));
    }
  };

  const walk = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.DebuggerStatement) {
      record('debugger-statement', node);
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
      const member = node.name.text;
      if ((member === 'only' || member === 'skip') && TEST_FUNCTIONS.has(rootIdentifier(node.expression))) {
        record(member === 'only' ? 'focused-test' : 'skipped-test', node);
      }
    }
    ts.forEachChild(node, walk);
  };

  walk(sourceFile);
  return findings;
}

const PY_DEF_PATTERN = /^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/;
const JS_DEF_PATTERN = /^(?:export\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/;

function definitionPatternFor(extension: string): RegExp {
  return extension === '.py' ? PY_DEF_PATTERN : JS_DEF_PATTERN;
}

function isFrameworkInvokedName(name: string, extension: string): boolean {
  if (name === 'main') return true;
  if (/^__.+__$/.test(name)) return true;
  if (extension === '.py' && (/^test_/.test(name) || /^Test[A-Z_]/.test(name))) return true;
  return false;
}

interface RefactorCandidate {
  name: string;
  path: string;
  line: number;
  source: string;
}

function collectRefactorDeadSymbolCandidates(file: ParsedDiffFile, config: DrafterConfig): RefactorCandidate[] {
  const extension = path.extname(file.path);
  const definitionExtensions = new Set([...config.diffAtomicity.codeExtensions, ...DEFINITION_EXTENSIONS_EXTRA]);
  if (!definitionExtensions.has(extension) || file.category === 'test' || file.category === 'generated') {
    return [];
  }
  const pattern = definitionPatternFor(extension);
  const candidates: RefactorCandidate[] = [];
  const lines = file.newContent.split('\n');
  for (const lineNumber of file.addedLineNumbers) {
    const text = lines[lineNumber - 1] ?? '';
    const match = pattern.exec(text);
    const name = match ? match[1] || match[2] : '';
    if (!name || isFrameworkInvokedName(name, extension)) continue;
    candidates.push({ name, path: file.path, line: lineNumber, source: file.source });
  }
  return candidates;
}

function collectRefactorFindings(files: ParsedDiffFile[], config: DrafterConfig): Finding[] {
  const candidates = files.flatMap((file) => collectRefactorDeadSymbolCandidates(file, config));
  if (candidates.length === 0) return [];

  const haystack = files.map((file) => file.newContent).join('\n');
  const findings: Finding[] = [];
  for (const candidate of candidates) {
    const escaped = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = haystack.match(new RegExp(`\\b${escaped}\\b`, 'g'));
    if (!occurrences || occurrences.length <= 1) {
      findings.push(makeFinding('refactor-dead-symbol', candidate.path, candidate.line, candidate.source));
    }
  }
  if (candidates.length > 1) {
    for (const candidate of candidates) {
      findings.push(makeFinding('refactor-multiple-symbols', candidate.path, candidate.line, candidate.source));
    }
  }
  return findings;
}

function topArea(filePath: string, config: DrafterConfig): string {
  const parts = filePath.split('/');
  if (config.diffAtomicity.monorepoDirs.includes(parts[0]) && parts.length > 1) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || filePath;
}

export interface LintDiffAtomicityOptions {
  diffText?: string;
  files?: ParsedDiffFile[];
  source?: string;
  reviewLane?: string;
  config: DrafterConfig;
}

/** Ported near-verbatim from lint-pr-diff-atomicity.mjs's collectDiffAtomicityFindings(). */
export function lintDiffAtomicity(options: LintDiffAtomicityOptions): Finding[] {
  const { diffText, source = 'diff', reviewLane, config } = options;
  const files = options.files ?? parseUnifiedDiff(diffText ?? '', config, source);
  const findings: Finding[] = [];

  if (reviewLane === 'refactor') {
    findings.push(...collectRefactorFindings(files, config));
  }

  const hasGenerated = files.some((file) => file.category === 'generated');
  const hasHandwritten = files.some((file) => file.category === 'source' || file.category === 'test');
  if (hasGenerated && hasHandwritten) {
    for (const file of files) {
      if (file.category === 'generated') {
        findings.push(makeFinding('mixed-generated-and-source', file.path, null, file.source));
      }
    }
  }

  const lockfiles = files.filter((file) => file.category === 'lockfile');
  const hasManifest = files.some((file) => file.category === 'manifest');
  if (lockfiles.length > 0 && !hasManifest) {
    for (const file of lockfiles) {
      findings.push(makeFinding('orphaned-lockfile', file.path, null, file.source));
    }
  }

  for (const file of files) {
    findings.push(...collectAstFindings(file, config));
  }

  const areas = new Set<string>();
  for (const file of files) {
    if (['source', 'test', 'docs', 'config', 'other'].includes(file.category) && file.path && file.path !== '/dev/null') {
      areas.add(topArea(file.path, config));
    }
  }
  if (areas.size >= 3) {
    const finding = makeFinding('unrelated-areas', null, null, source);
    finding.message = `${finding.message} (${[...areas].sort().join(', ')})`;
    findings.push(finding);
  }

  return findings;
}

export function formatDiffAtomicityFindings(findings: Finding[]): string[] {
  return findings.map((finding) => {
    const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '(diff)';
    return `${finding.kind} ${location} — ${finding.message}`;
  });
}

/** Full-context diffs scale with whole-file size, so they outgrow Node's 1MB default. */
const GIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

function runGit(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export interface LintDiffAtomicityForGitOptions {
  root?: string;
  baseRef: string;
  reviewLane?: string;
  config: DrafterConfig;
}

export function lintDiffAtomicityForGit(options: LintDiffAtomicityForGitOptions): Finding[] {
  const root = options.root || process.cwd();
  if (!options.baseRef) throw new Error('lintDiffAtomicityForGit requires a baseRef');
  const diffText = runGit(root, [
    'diff',
    '--find-renames',
    '--unified=200000',
    '--diff-filter=ACMRTD',
    `${options.baseRef}...HEAD`,
    '--',
  ]);
  return lintDiffAtomicity({
    diffText,
    source: `${options.baseRef}...HEAD`,
    reviewLane: options.reviewLane,
    config: options.config,
  });
}
