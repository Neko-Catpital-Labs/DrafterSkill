import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const PROMPT_TEXT = `Before drafting a PR body or splitting a change into review-compressed slices, resolve scope and ambiguity with the user in conversation. Do not draft through unresolved ambiguity.

Ask a concise, concrete question instead of drafting speculatively when:
- The review lane cannot be inferred with confidence from the changed files.
- The changed files plausibly span more than one review unit with no explicit rule covering the grouping.
- The slice boundary is undecided (one PR vs. a multi-PR stack).
- A configured pairing ban is half-triggered.

If none of these hold, proceed and record the resolved choice under an Assumptions note rather than asking.

Independent of the above, always propose the Safety Invariant for every slice and ask the user to confirm or correct it before finalizing — even when scope was completely unambiguous. This is a standing rule with no exception, and nothing enforces it except your own discipline: no tool call here will verify a human actually answered.

Use the classify_review_scope tool to check for structural ambiguity, and propose_safety_invariant to draft (never finalize) a safety invariant.`;

export function registerDrafterClarifyScopePrompt(server: McpServer): void {
  server.registerPrompt(
    'drafter-clarify-scope',
    {
      description: 'Instructions for resolving PR scope and ambiguity in conversation before drafting, including the standing Safety Invariant confirmation rule.',
      argsSchema: { request: z.string().optional() },
    },
    ({ request }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: request ? `${PROMPT_TEXT}\n\nRequest: ${request}` : PROMPT_TEXT },
        },
      ],
    }),
  );
}
