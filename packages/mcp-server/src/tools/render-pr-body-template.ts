import { z } from 'zod';
import { loadDrafterConfig, renderPrBodyTemplate } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRenderPrBodyTemplate(server: McpServer): void {
  server.registerTool(
    'render_pr_body_template',
    {
      description: 'Return a blank PR body template matching the configured schema, for a human to fill in by hand.',
      inputSchema: { configPath: z.string().optional() },
    },
    async ({ configPath }) => {
      const config = await loadDrafterConfig({ explicitPath: configPath });
      return { content: [{ type: 'text', text: renderPrBodyTemplate(config) }] };
    },
  );
}
