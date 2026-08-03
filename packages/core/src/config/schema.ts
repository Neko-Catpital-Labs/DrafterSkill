import { z } from 'zod';

// Kept in sync with types.ts's ReviewLaneId union by the type assertion below
// (z.enum needs a literal tuple, not the ReviewLaneId[] array REVIEW_LANES is
// typed as, so the members are restated here rather than derived).
const laneIdSchema = z.enum(['behavior', 'refactor', 'proof', 'cleanup', 'policy', 'docs']);

const laneDefSchema = z.object({
  id: laneIdSchema,
  description: z.string().optional(),
});

const unitDefSchema = z.object({
  id: z.string().min(1),
  isProductUnit: z.boolean(),
  description: z.string().optional(),
});

const laneCompatibilitySchema = z.object({
  lane: laneIdSchema,
  units: z.array(z.string()).optional(),
  anyProductUnit: z.boolean().optional(),
});

const pathRuleSchema = z.object({
  id: z.string().optional(),
  pathGlob: z.string().optional(),
  basenamePattern: z.string().optional(),
  unit: z.array(z.string()),
});

const pairingBanSchema = z.object({
  id: z.string(),
  paths: z.tuple([z.string(), z.string()]),
  appliesToLanes: z.array(laneIdSchema).optional(),
  message: z.string(),
});

const textPatternRuleSchema = z.object({
  unit: z.string(),
  patterns: z.array(z.string()),
  flags: z.string().optional(),
});

const taxonomySchema = z.object({
  lanes: z.array(laneDefSchema),
  units: z.array(unitDefSchema),
  compatibility: z.array(laneCompatibilitySchema),
});

const classificationSchema = z.object({
  pathRules: z.array(pathRuleSchema),
  pairingBans: z.array(pairingBanSchema),
  textPatterns: z.array(textPatternRuleSchema),
});

const changeTypesSchema = z.object({
  allowedOperations: z.array(z.string()),
  topLevelDirs: z.array(z.string()).optional(),
});

const diffAtomicitySchema = z.object({
  monorepoDirs: z.array(z.string()),
  generatedDirs: z.array(z.string()),
  codeExtensions: z.array(z.string()),
});

const prBodySchema = z.object({
  summaryWordLimit: z.number().int().positive(),
  changedFilesWarningThreshold: z.number().int().positive(),
});

/** Strict schema — every field required. Used to validate a fully-resolved config. */
export const drafterConfigSchema = z.object({
  taxonomy: taxonomySchema,
  classification: classificationSchema,
  changeTypes: changeTypesSchema,
  diffAtomicity: diffAtomicitySchema,
  prBody: prBodySchema,
});

/**
 * Permissive schema for what a consuming repo actually authors — every field,
 * at every level, is optional. Missing fields are filled from DEFAULT_CONFIG
 * by mergeConfig() in load-config.ts.
 */
export const drafterConfigInputSchema = z.object({
  taxonomy: taxonomySchema.partial().optional(),
  classification: classificationSchema.partial().optional(),
  changeTypes: changeTypesSchema.partial().optional(),
  diffAtomicity: diffAtomicitySchema.partial().optional(),
  prBody: prBodySchema.partial().optional(),
});

export type DrafterConfigInput = z.input<typeof drafterConfigInputSchema>;
