# `drafter.config.json` schema

DrafterSkill reads an optional config file at your repo root:
`drafter.config.json`, `.mjs`, `.cjs`, or `.js` (in that discovery order), or
a `"drafter"` key in your `package.json`. With no config at all, a generic
default applies (see below). Full JSON Schema:
[`drafter.config.schema.json`](../drafter.config.schema.json).

## Review lanes (fixed)

`behavior`, `refactor`, `proof`, `cleanup`, `policy`, `docs`. This vocabulary
is the generic review-methodology core, not project-specific — it isn't
configurable.

## Review units (yours to define)

`taxonomy.units` is your own domain vocabulary — e.g. `contract`,
`api-surface`, `read-path`. Each unit has `isProductUnit: true/false`:
product units are what `behavior`/`refactor`-lane PRs are allowed to touch;
non-product units (`docs`, `policy`, `proof`, `cleanup`, ...) each pair with
their own matching lane.

**Zero-config default** is deliberately shallow: one `product` unit plus
`cleanup`/`policy`/`proof`/`docs`. This enforces the one universal rule —
don't mix a product change with docs/cleanup/policy/proof in one PR — without
guessing at your repo's internal architecture.

## Letting tests ride along with their feature (`coLocatesWithProductUnits`)

split-scope's Boundary Rules state an exception: "directly affected tests ...
stay with the change that requires them." By default, the zero-config
taxonomy's path rules classify test files as **neutral** (`unit: []`), so
they never conflict with anything — that's why this works out of the box
with no config.

If you instead give tests their own real unit (e.g. so a repo can also
author a dedicated `proof`-lane PR containing only tests), mark that unit
`"coLocatesWithProductUnits": true`. This tells the validator: when a file of
the *declared* product unit is also present in the diff, this unit's files
are not forbidden — matching the Boundary Rules exception. It does **not**
relax anything when no product-unit file is present; a standalone test-only
diff still needs a lane whose `compatibility` entry names that unit
directly (e.g. the `proof` lane naming the `proof` unit).

```json
{ "id": "proof", "isProductUnit": false, "coLocatesWithProductUnits": true }
```

The built-in default config's own `proof` unit already sets this, for
consistency — even though its default path rule keeps tests neutral rather
than classifying them into `proof` at all.

## Path classification

`classification.pathRules` is an ordered, first-match-wins list. Each rule
matches by `pathGlob` (picomatch syntax) or `basenamePattern` (regex against
the basename), and assigns a unit id — or `[]` for "matched, but deliberately
neutral" (lockfiles, manifests, tests).

## Text-pattern classification (opt-in, off by default)

`classification.textPatterns` lets you detect a review unit from prose (PR
Summary/Review Claim/Slice Rationale) via regex keyword matching. This
defaults to empty: keyword vocabulary tuned for one repo would misclassify
another repo's prose, so path-based classification is what runs by default.

## Pairing bans

`classification.pairingBans` names two paths that must never ship in the same
PR (a deliberate architectural seam). No generic default makes sense here —
it's always repo-specific.

## Example: a monorepo with a deeper taxonomy

```json
{
  "taxonomy": {
    "units": [
      { "id": "contract", "isProductUnit": true },
      { "id": "api-surface", "isProductUnit": true },
      { "id": "tooling-policy", "isProductUnit": false },
      { "id": "docs", "isProductUnit": false }
    ],
    "compatibility": [
      { "lane": "behavior", "anyProductUnit": true },
      { "lane": "refactor", "anyProductUnit": true },
      { "lane": "policy", "units": ["tooling-policy"] },
      { "lane": "docs", "units": ["docs"] }
    ]
  },
  "classification": {
    "pathRules": [
      { "pathGlob": "**/*.md", "unit": ["docs"] },
      { "pathGlob": "scripts/**", "unit": ["tooling-policy"] },
      { "pathGlob": "packages/contracts/**", "unit": ["contract"] },
      { "pathGlob": "packages/api/**", "unit": ["api-surface"] },
      { "basenamePattern": "^(package|tsconfig).*\\.json$", "unit": [] },
      { "pathGlob": "**/*", "unit": [] }
    ]
  },
  "diffAtomicity": { "monorepoDirs": ["packages"] }
}
```
