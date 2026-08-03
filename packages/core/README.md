# @neko-catpital-labs/drafter-core

Validators, classifiers, and a config loader for PR-drafting and
scope/ambiguity-clarification — the shared library behind
`@neko-catpital-labs/drafter-skill` and `@neko-catpital-labs/drafter-mcp`.
Also usable standalone (e.g. from a CI script, with no AI agent involved).

```ts
import { loadDrafterConfig, validatePrBody, classifyReviewScope } from '@neko-catpital-labs/drafter-core';

const config = await loadDrafterConfig();
const result = await validatePrBody(prBody, { changedFiles, config });
```

See the repo root [`README.md`](../../README.md) and
[`drafter.config.schema.json`](../../drafter.config.schema.json) for the full
config schema.
