import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDraftPrBody } from './tools/draft-pr-body.js';
import { registerValidatePrBody } from './tools/validate-pr-body.js';
import { registerClassifyReviewScope } from './tools/classify-review-scope.js';
import { registerProposeSafetyInvariant } from './tools/propose-safety-invariant.js';
import { registerLintDiffAtomicity } from './tools/lint-diff-atomicity.js';
import { registerRenderPrBodyTemplate } from './tools/render-pr-body-template.js';
import { registerDrafterClarifyScopePrompt } from './prompts/drafter-clarify-scope.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'drafter-mcp', version: '0.1.0' });

  registerDraftPrBody(server);
  registerValidatePrBody(server);
  registerClassifyReviewScope(server);
  registerProposeSafetyInvariant(server);
  registerLintDiffAtomicity(server);
  registerRenderPrBodyTemplate(server);
  registerDrafterClarifyScopePrompt(server);

  return server;
}
