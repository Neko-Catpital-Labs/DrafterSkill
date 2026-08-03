import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { drafterConfigInputSchema } from './schema.js';
import { DEFAULT_CONFIG } from './default-taxonomy.js';
import type { DrafterConfig } from '../types.js';

export interface LoadDrafterConfigOptions {
  cwd?: string;
  explicitPath?: string;
}

const CONFIG_BASENAMES = [
  'drafter.config.json',
  'drafter.config.mjs',
  'drafter.config.cjs',
  'drafter.config.js',
  'drafter.config.ts',
];

function findNearestGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadFromFile(filePath: string): Promise<unknown> {
  if (filePath.endsWith('.json')) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  }
  // .ts config requires the host process to have a TS loader (tsx, ts-node, or
  // Node's native strip-types) registered already; we do not register one
  // ourselves to avoid forcing a dependency on every consumer.
  const mod = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
  return mod.default ?? mod;
}

function findConfigFile(dir: string, explicitPath?: string): string | null {
  if (explicitPath) {
    const abs = resolve(explicitPath);
    return existsSync(abs) ? abs : null;
  }
  for (const basename of CONFIG_BASENAMES) {
    const candidate = join(dir, basename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadFromPackageJson(dir: string): unknown | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg && typeof pkg === 'object' && 'drafter' in pkg ? (pkg as { drafter: unknown }).drafter : null;
  } catch {
    return null;
  }
}

function mergeConfig(partial: unknown): DrafterConfig {
  const parsed = drafterConfigInputSchema.parse(partial ?? {});
  return {
    taxonomy: {
      lanes: parsed.taxonomy?.lanes ?? DEFAULT_CONFIG.taxonomy.lanes,
      units: parsed.taxonomy?.units ?? DEFAULT_CONFIG.taxonomy.units,
      compatibility: parsed.taxonomy?.compatibility ?? DEFAULT_CONFIG.taxonomy.compatibility,
    },
    classification: {
      pathRules: parsed.classification?.pathRules ?? DEFAULT_CONFIG.classification.pathRules,
      pairingBans: parsed.classification?.pairingBans ?? DEFAULT_CONFIG.classification.pairingBans,
      textPatterns: parsed.classification?.textPatterns ?? DEFAULT_CONFIG.classification.textPatterns,
    },
    changeTypes: {
      allowedOperations: parsed.changeTypes?.allowedOperations ?? DEFAULT_CONFIG.changeTypes.allowedOperations,
      topLevelDirs: parsed.changeTypes?.topLevelDirs ?? DEFAULT_CONFIG.changeTypes.topLevelDirs,
    },
    diffAtomicity: {
      monorepoDirs: parsed.diffAtomicity?.monorepoDirs ?? DEFAULT_CONFIG.diffAtomicity.monorepoDirs,
      generatedDirs: parsed.diffAtomicity?.generatedDirs ?? DEFAULT_CONFIG.diffAtomicity.generatedDirs,
      codeExtensions: parsed.diffAtomicity?.codeExtensions ?? DEFAULT_CONFIG.diffAtomicity.codeExtensions,
    },
    prBody: {
      summaryWordLimit: parsed.prBody?.summaryWordLimit ?? DEFAULT_CONFIG.prBody.summaryWordLimit,
      changedFilesWarningThreshold: parsed.prBody?.changedFilesWarningThreshold ?? DEFAULT_CONFIG.prBody.changedFilesWarningThreshold,
    },
  } satisfies DrafterConfig;
}

/**
 * Resolution order: explicit path -> DRAFTER_CONFIG_PATH env -> nearest
 * drafter.config.* walking up from cwd to the git root -> a "drafter" key in
 * the nearest package.json -> the built-in default. Never throws on a config
 * that's simply absent; a repo with zero config still gets a fully working
 * generic default (see default-taxonomy.ts).
 */
export async function loadDrafterConfig(options: LoadDrafterConfigOptions = {}): Promise<DrafterConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const explicitPath = options.explicitPath ?? process.env.DRAFTER_CONFIG_PATH;

  if (explicitPath) {
    const abs = resolve(explicitPath);
    if (!existsSync(abs)) {
      throw new Error(`Drafter config not found at explicit path: ${abs}`);
    }
    return mergeConfig(await loadFromFile(abs));
  }

  const gitRoot = findNearestGitRoot(cwd) ?? cwd;
  const found = findConfigFile(gitRoot);
  if (found) {
    return mergeConfig(await loadFromFile(found));
  }

  const fromPackageJson = loadFromPackageJson(gitRoot);
  if (fromPackageJson) {
    return mergeConfig(fromPackageJson);
  }

  return DEFAULT_CONFIG;
}

export { DEFAULT_CONFIG } from './default-taxonomy.js';
export { drafterConfigSchema, drafterConfigInputSchema } from './schema.js';
