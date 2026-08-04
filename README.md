<div align="center">

# DrafterSkill

**Draft PRs and split scope — as a skill for your AI agent, or an MCP server for any client**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Neko-Catpital-Labs/DrafterSkill/ci.yml?branch=main&style=flat-square)](https://github.com/Neko-Catpital-Labs/DrafterSkill/actions/workflows/ci.yml)
[![npm drafter-core](https://img.shields.io/npm/v/@neko-catpital-labs/drafter-core?label=drafter-core&style=flat-square)](https://www.npmjs.com/package/@neko-catpital-labs/drafter-core)
[![npm drafter-skill](https://img.shields.io/npm/v/@neko-catpital-labs/drafter-skill?label=drafter-skill&style=flat-square)](https://www.npmjs.com/package/@neko-catpital-labs/drafter-skill)
[![npm drafter-mcp](https://img.shields.io/npm/v/@neko-catpital-labs/drafter-mcp?label=drafter-mcp&style=flat-square)](https://www.npmjs.com/package/@neko-catpital-labs/drafter-mcp)

A disciplined PR-body schema, a diff-atomicity linter, and a "split work into one reviewable claim per diff" methodology — generalized out of a single monorepo into a config-driven toolkit any repo can use, with any AI coding agent.

**[Quick start](#quick-start)** · **[Config schema](docs/config-schema.md)** · **[Packages](#packages)**

</div>

## Features

<table>
<tr>
<td width="50%" valign="top">

### Resolve ambiguity before drafting

Before a PR body gets written, `classifyReviewScope()` checks whether the diff's review lane and unit are actually unambiguous. If they're not, it hands back concrete questions instead of guessing — so an agent relays them to you rather than silently picking wrong.

</td>
<td width="50%">

```jsonc
// classifyReviewScope({ changedFiles: [...] })
{
  "status": "needs_clarification",
  "questions": [{
    "kind": "review_unit_split",
    "question": "Changed files span multiple review units (domain, ui, data) — one PR, or split?",
    "options": ["domain", "ui", "data", "split into separate PRs"]
  }]
}
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Validate the whole PR body

`validatePrBody()` enforces the canonical schema — Summary, Review Claim, Review Lane, Review Unit, Safety Invariant, Slice Rationale, Non-goals, Test Plan, Revert Plan — plus a diff-atomicity gate (mixed generated/handwritten files, orphaned lockfiles, debugger statements, focused tests).

</td>
<td width="50%">

```jsonc
// validatePrBody(body, { changedFiles, config })
{
  "valid": false,
  "errors": [
    "Review lane docs cannot ship with product files in the same PR."
  ],
  "warnings": []
}
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Your taxonomy, not a guess

Zero-config enforces one universal rule: don't mix a product change with docs/cleanup/policy/proof. Define your own deeper review-unit taxonomy — and path rules to classify it — in one `drafter.config.json`.

</td>
<td width="50%">

```jsonc
// drafter.config.json
{
  "taxonomy": { "units": [
    { "id": "auth", "isProductUnit": true },
    { "id": "proof", "isProductUnit": false,
      "coLocatesWithProductUnits": true }
  ]},
  "classification": { "pathRules": [
    { "pathGlob": "src/auth/**", "unit": ["auth"] }
  ]}
}
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Skill, MCP server, or plain library

Install the `draft-pr`/`split-scope` skill straight into Claude Code, Cursor, Codex, or omp. Run the same logic as an MCP server for any MCP-capable client. Or import the validators directly in CI, with no agent involved.

</td>
<td width="50%">

```bash
# Skill, into your agent's skill directory
npx @neko-catpital-labs/drafter-skill install

# MCP server, stdio, zero install
npx @neko-catpital-labs/drafter-mcp
```

</td>
</tr>
</table>

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
| [`@neko-catpital-labs/drafter-core`](./packages/core) | Shared validators/classifiers/config loader — usable standalone from CI |
| [`@neko-catpital-labs/drafter-skill`](./packages/skill) | `draft-pr` + `split-scope` markdown skills + installer CLI |
| [`@neko-catpital-labs/drafter-mcp`](./packages/mcp-server) | Stdio MCP server exposing the same logic as tools |

## Docs

- [Config schema](docs/config-schema.md) — full `drafter.config.json` reference, including the `coLocatesWithProductUnits` co-location exception
- [`drafter-core` README](packages/core/README.md)
- [`drafter-skill` README](packages/skill/README.md)
- [`drafter-mcp` README](packages/mcp-server/README.md)
- [Changelog](packages/core/CHANGELOG.md)

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Versioning and publishing go through [Changesets](https://github.com/changesets/changesets):
`pnpm changeset` to record a change, `pnpm changeset version` to bump, `pnpm changeset publish` to release.

## License

[MIT](LICENSE)
