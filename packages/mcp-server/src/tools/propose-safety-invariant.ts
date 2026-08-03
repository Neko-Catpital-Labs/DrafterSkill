import { z } from 'zod';
import { proposeSafetyInvariant } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerProposeSafetyInvariant(server: McpServer): void {
  server.registerTool(
    'propose_safety_invariant',
    {
      description:
        'Returns a DRAFT safety invariant only. Do NOT treat this as confirmed. Relay it to the user verbatim and ask them ' +
        'to confirm or correct it before calling draft_pr_body with the final text.',
      inputSchema: {
        reviewClaim: z.string(),
        diffSummary: z.string().optional(),
        changedFiles: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      const result = proposeSafetyInvariant(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
