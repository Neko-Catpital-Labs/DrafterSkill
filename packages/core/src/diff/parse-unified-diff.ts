import path from 'node:path';
import type { DrafterConfig, ParsedDiffFile } from '../types.js';

const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lockb']);
const MANIFESTS = new Set(['package.json']);
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);
const CONFIG_EXTENSIONS = new Set(['.yml', '.yaml', '.json', '.toml', '.ini']);

function stripPrefix(marker: string): string {
  const trimmed = marker.trim();
  if (trimmed === '/dev/null') return '/dev/null';
  if (trimmed.startsWith('a/') || trimmed.startsWith('b/')) return trimmed.slice(2);
  return trimmed;
}

export function classifyPath(filePath: string, config: DrafterConfig): string {
  const normalized = filePath.split(path.sep).join('/');
  const basename = path.basename(normalized);
  const extension = path.extname(basename);
  const parts = normalized.split('/');

  if (LOCKFILES.has(basename)) return 'lockfile';
  if (MANIFESTS.has(basename)) return 'manifest';
  if (
    parts.some((part) => config.diffAtomicity.generatedDirs.includes(part))
    || basename.includes('.generated.')
    || basename.includes('.gen.')
    || basename.endsWith('.min.js')
  ) {
    return 'generated';
  }
  if (
    basename.includes('.test.')
    || basename.includes('.spec.')
    || basename.startsWith('test-')
    || parts.includes('__tests__')
    || parts.includes('tests')
  ) {
    return 'test';
  }
  if (config.diffAtomicity.codeExtensions.includes(extension)) return 'source';
  if (DOC_EXTENSIONS.has(extension) || parts.includes('docs')) return 'docs';
  if (CONFIG_EXTENSIONS.has(extension) || parts.includes('.github')) return 'config';
  return 'other';
}

interface InProgressFile {
  source: string;
  header: string;
  oldPath: string;
  newPath: string;
  path: string;
  changeType: ParsedDiffFile['changeType'];
  addedLineNumbers: Set<number>;
  removedCount: number;
  newLineMap: Map<number, string>;
}

function finalizeFile(file: InProgressFile | null, config: DrafterConfig): ParsedDiffFile | null {
  if (!file) return null;
  const max = file.newLineMap.size > 0 ? Math.max(...file.newLineMap.keys()) : 0;
  const lines = new Array(max).fill('');
  for (const [lineNumber, text] of file.newLineMap) {
    lines[lineNumber - 1] = text;
  }
  return {
    source: file.source,
    header: file.header,
    oldPath: file.oldPath,
    newPath: file.newPath,
    path: file.path,
    changeType: file.changeType,
    addedLineNumbers: file.addedLineNumbers,
    removedCount: file.removedCount,
    newContent: lines.join('\n'),
    category: classifyPath(file.path, config),
  };
}

/** Ported near-verbatim from lint-pr-diff-atomicity.mjs's parseUnifiedDiff(). */
export function parseUnifiedDiff(diffText: string, config: DrafterConfig, source = 'diff'): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const lines = (diffText || '').split('\n');
  let current: InProgressFile | null = null;
  let counter = 0;

  const createFile = (header: string): InProgressFile => ({
    source,
    header,
    oldPath: '',
    newPath: '',
    path: '',
    changeType: 'modify',
    addedLineNumbers: new Set(),
    removedCount: 0,
    newLineMap: new Map(),
  });

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const finalized = finalizeFile(current, config);
      if (finalized) files.push(finalized);
      current = createFile(line);
      counter = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('new file mode')) {
      current.changeType = 'add';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      current.changeType = 'delete';
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.changeType = 'rename';
      current.oldPath = stripPrefix(line.slice('rename from '.length));
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.changeType = 'rename';
      current.newPath = stripPrefix(line.slice('rename to '.length));
      current.path = current.newPath;
      continue;
    }
    if (line.startsWith('--- ')) {
      current.oldPath = stripPrefix(line.slice(4));
      continue;
    }
    if (line.startsWith('+++ ')) {
      current.newPath = stripPrefix(line.slice(4));
      current.path = current.newPath === '/dev/null' ? current.oldPath : current.newPath;
      continue;
    }
    if (line.startsWith('@@')) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      counter = match ? Number.parseInt(match[1], 10) : 0;
      continue;
    }
    if (counter < 1) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.newLineMap.set(counter, line.slice(1));
      current.addedLineNumbers.add(counter);
      counter += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      current.removedCount += 1;
      continue;
    }
    if (line.startsWith(' ')) {
      current.newLineMap.set(counter, line.slice(1));
      counter += 1;
    }
  }

  const finalized = finalizeFile(current, config);
  if (finalized) files.push(finalized);

  return files;
}
