# DrafterSkill

Draft and split tasks: a portable PR-drafting and scope/ambiguity-clarification
toolkit for any repo, with any AI coding agent.

Generalized from a PR-drafting skill originally built for a single monorepo,
DrafterSkill separates the parts that are genuinely universal (a disciplined
PR-body schema, a diff-atomicity linter, a "split work into one reviewable
claim per diff" methodology, an ask-only-on-real-ambiguity conversational
protocol) from the parts that are project-specific (your own review-lane/unit
taxonomy, your own path layout) — and makes the specific parts configurable
instead of hardcoded.

It ships three ways:

- **`@neko-catpital-labs/drafter-core`** — the validators/classifiers as a
  plain library. Call it from CI with no agent involved.
- **`@neko-catpital-labs/drafter-skill`** — a portable markdown skill
  (`draft-pr` + `split-scope`), installable into Claude Code, Cursor, Codex, or
  omp.
- **`@neko-catpital-labs/drafter-mcp`** — an MCP server exposing the same
  logic as tools, for any MCP-capable client.

## Quick start

```bash
# Install the skill into your AI agent of choice
npx @neko-catpital-labs/drafter-skill install --tool claude

# Or run the MCP server directly
npx @neko-catpital-labs/drafter-mcp
```

Both read an optional `drafter.config.json` at your repo root to customize the
review-unit taxonomy and path rules. With no config, DrafterSkill still
enforces the one universal rule: don't mix a product change with docs,
cleanup, policy, or proof work in the same PR. See
[`drafter.config.schema.json`](./drafter.config.schema.json) and
[`docs/config-schema.md`](./docs/config-schema.md) for the full schema.

## Packages

| Package | Description |
| --- | --- |
| [`packages/core`](./packages/core) | Shared validators/classifiers/config loader |
| [`packages/skill`](./packages/skill) | `draft-pr` + `split-scope` markdown skills + installer CLI |
| [`packages/mcp-server`](./packages/mcp-server) | Stdio MCP server |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
