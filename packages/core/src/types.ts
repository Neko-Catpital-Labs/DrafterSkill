export type ReviewLaneId = 'behavior' | 'refactor' | 'proof' | 'cleanup' | 'policy' | 'docs';

export const REVIEW_LANES: ReviewLaneId[] = ['behavior', 'refactor', 'proof', 'cleanup', 'policy', 'docs'];

export interface LaneDef {
  id: ReviewLaneId;
  description?: string;
}

export interface UnitDef {
  id: string;
  isProductUnit: boolean;
  description?: string;
  /**
   * When true, files classified under this unit are allowed to ship
   * alongside ANY product unit already present in the same diff, instead of
   * being flagged as an incompatible mix — split-scope's Boundary Rules
   * exception: "directly affected tests ... stay with the change that
   * requires them." Only relaxes the check when a product unit is present;
   * a diff containing only this unit's files still needs a lane whose
   * `compatibility` entry names it directly.
   */
  coLocatesWithProductUnits?: boolean;
}

export interface LaneCompatibility {
  lane: ReviewLaneId;
  units?: string[];
  anyProductUnit?: boolean;
}

export interface PathRule {
  id?: string;
  pathGlob?: string;
  basenamePattern?: string;
  /** Empty array = matched but deliberately neutral (lockfiles, tests, manifests). */
  unit: string[];
}

export interface PairingBan {
  id: string;
  paths: [string, string];
  appliesToLanes?: ReviewLaneId[];
  message: string;
}

export interface TextPatternRule {
  unit: string;
  patterns: string[];
  flags?: string;
}

export interface DrafterConfig {
  taxonomy: {
    lanes: LaneDef[];
    units: UnitDef[];
    compatibility: LaneCompatibility[];
  };
  classification: {
    pathRules: PathRule[];
    pairingBans: PairingBan[];
    textPatterns: TextPatternRule[];
  };
  changeTypes: {
    allowedOperations: string[];
    topLevelDirs?: string[];
  };
  diffAtomicity: {
    monorepoDirs: string[];
    generatedDirs: string[];
    codeExtensions: string[];
  };
  prBody: {
    summaryWordLimit: number;
    changedFilesWarningThreshold: number;
  };
}

export interface Finding {
  kind: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  file?: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  findings: Finding[];
}

export type DiffChangeType = 'add' | 'delete' | 'rename' | 'modify';

export interface ParsedDiffFile {
  source: string;
  header: string;
  oldPath: string;
  newPath: string;
  /** Effective path: newPath, or oldPath when the file was deleted. */
  path: string;
  changeType: DiffChangeType;
  addedLineNumbers: Set<number>;
  removedCount: number;
  /** Reconstructed post-change file content (context + added lines). */
  newContent: string;
  category: string;
}
