# @neko-catpital-labs/drafter-mcp

Stdio MCP server exposing the `draft-pr`/`split-scope` PR-drafting and
scope/ambiguity-clarification tools to any MCP-capable client.

```bash
npx @neko-catpital-labs/drafter-mcp
```

Register it in your MCP client's config, e.g.:

```json
{
  "mcpServers": {
    "drafter": { "type": "stdio", "command": "npx", "args": ["@neko-catpital-labs/drafter-mcp"] }
  }
}
```

Tools: `draft_pr_body`, `validate_pr_body`, `classify_review_scope`,
`propose_safety_invariant`, `lint_diff_atomicity`, `render_pr_body_template`.
Prompt: `drafter-clarify-scope`.

See the repo root [`README.md`](../../README.md) for the full picture.
