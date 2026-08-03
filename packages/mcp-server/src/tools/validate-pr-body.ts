import { z } from 'zod';
import { loadDrafterConfig, validatePrBody, getPrBodyWarnings } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerValidatePrBody(server: McpServer): void {
  server.registerTool(
    'validate_pr_body',
    {
      description:
        'Validate a PR body against the configured schema (Summary/Review Claim/Review Lane/Review Unit/Safety Invariant/' +
        'Slice Rationale/Non-goals/Test Plan/Revert Plan) and the diff-atomicity gate. Returns errors (must fix) and warnings ' +
        '(should confirm intentional) separately — do not treat warnings as blocking.',
      inputSchema: {
        body: z.string(),
        requiresVisualProof: z.boolean().optional(),
        changedFiles: z.array(z.string()).optional(),
        diffText: z.string().optional(),
        configPath: z.string().optional(),
      },
    },
    async ({ body, requiresVisualProof, changedFiles, diffText, configPath }) => {
      const config = await loadDrafterConfig({ explicitPath: configPath });
      const result = await validatePrBody(body, { requiresVisualProof, changedFiles, diffText, config });
      const warnings = getPrBodyWarnings(body, { changedFiles, diffText, config });
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...result, warnings }, null, 2) }],
        isError: !result.valid,
      };
    },
  );
}
