import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

/**
 * Bare invocation, no subcommand — Invoker's existing (never-built)
 * drafter-mcp dependency spec hardcodes `commandName: 'drafter-mcp'` with no
 * args (`uvx --from drafter-mcp==0.1.0 drafter-mcp`). Starting the stdio
 * server directly on `npx @neko-catpital-labs/drafter-mcp` (no args) lets
 * this package satisfy that hook as-is.
 */
async function main(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('drafter-mcp failed to start:', error);
  process.exit(1);
});
