import { z } from 'zod';
import { loadDrafterConfig, renderPrBody, validatePrBody } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDraftPrBody(server: McpServer): void {
  server.registerTool(
    'draft_pr_body',
    {
      description:
        'Render a fully-populated PR body from structured fields, matching the configured schema. The Safety Invariant you ' +
        'pass here is treated as a DRAFT only — relay it to the user and get their confirmation before this body is ' +
        'actually published; this tool does not (and cannot) enforce that.',
      inputSchema: {
        summary: z.string(),
        reviewClaim: z.string(),
        reviewLane: z.string(),
        reviewUnit: z.string(),
        safetyInvariant: z.string(),
        sliceRationale: z.string(),
        nonGoals: z.string(),
        testPlanItems: z.array(z.string()).default([]),
        revertPlan: z.object({
          safeToRevert: z.string(),
          revertCommand: z.string(),
          postRevertSteps: z.string(),
          dataMigration: z.string(),
        }),
        visualProof: z.string().optional(),
        architecture: z.object({ before: z.string(), after: z.string() }).optional(),
        changedFiles: z.array(z.string()).optional(),
        configPath: z.string().optional(),
      },
    },
    async (input) => {
      const config = await loadDrafterConfig({ explicitPath: input.configPath });
      const body = renderPrBody(input, config);
      const result = await validatePrBody(body, { changedFiles: input.changedFiles, config });
      return {
        content: [{ type: 'text', text: JSON.stringify({ body, validation: result }, null, 2) }],
        isError: !result.valid,
      };
    },
  );
}
