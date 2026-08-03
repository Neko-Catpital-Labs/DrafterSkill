import { z } from 'zod';
import { loadDrafterConfig, classifyReviewScope } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerClassifyReviewScope(server: McpServer): void {
  server.registerTool(
    'classify_review_scope',
    {
      description:
        'Classify a change\'s review lane/unit and detect real scope ambiguity before drafting a PR body. If the result has ' +
        'status "needs_clarification", relay `clarificationText` to the user VERBATIM and ask the listed questions — do not ' +
        'draft speculatively. Once you have answers, call this tool again with the same diff/changedFiles plus ' +
        '`priorAnswers` (keyed by each question\'s id). If status is "resolved", `suggestedSafetyInvariant` is a DRAFT only — ' +
        'relay it to the user and get their confirmation before treating it as final; this tool never enforces that.',
      inputSchema: {
        diff: z.string().optional(),
        changedFiles: z.array(z.string()).optional(),
        proposedSummary: z.string().optional(),
        reviewLaneHint: z.string().optional(),
        reviewUnitHint: z.string().optional(),
        priorAnswers: z.record(z.string(), z.string()).optional(),
        noninteractive: z.boolean().optional(),
        configPath: z.string().optional(),
      },
    },
    async (input) => {
      const config = await loadDrafterConfig({ explicitPath: input.configPath });
      const result = classifyReviewScope({ ...input, config });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
