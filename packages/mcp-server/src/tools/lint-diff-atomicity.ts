import { z } from 'zod';
import { loadDrafterConfig, lintDiffAtomicity, formatDiffAtomicityFindings } from '@neko-catpital-labs/drafter-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerLintDiffAtomicity(server: McpServer): void {
  server.registerTool(
    'lint_diff_atomicity',
    {
      description:
        'Scan a unified diff for atomicity problems: generated files mixed with hand-written source, an orphaned lockfile ' +
        'change, a debugger statement, a focused (.only) test, or a diff spanning unrelated top-level areas. "fatal" ' +
        'findings must be fixed before publishing; "warning" findings are advisories to confirm, not block on.',
      inputSchema: {
        diffText: z.string(),
        reviewLane: z.string().optional(),
        configPath: z.string().optional(),
      },
    },
    async ({ diffText, reviewLane, configPath }) => {
      const config = await loadDrafterConfig({ explicitPath: configPath });
      const findings = lintDiffAtomicity({ diffText, reviewLane, config });
      const fatal = findings.filter((f) => f.severity === 'fatal');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ findings, formatted: formatDiffAtomicityFindings(findings) }, null, 2),
          },
        ],
        isError: fatal.length > 0,
      };
    },
  );
}
