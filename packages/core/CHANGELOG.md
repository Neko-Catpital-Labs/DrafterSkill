# @neko-catpital-labs/drafter-core

## 0.2.0

### Minor Changes

- 8bca8ff: Add `taxonomy.units[].coLocatesWithProductUnits` to implement split-scope's own written Boundary Rules exception ("directly affected tests stay with the change that requires them"), which was never actually enforced. Previously, `classifyReviewScope` could silently resolve a feature file plus its own directly-covering test file into one PR, while `validatePrBody` then hard-rejected that exact same combination — the two never agreed because each reimplemented the lane/unit compatibility check independently. Both now share one `forbiddenUnitsForLane` helper, and a unit marked `coLocatesWithProductUnits` (the default config's own `proof` unit sets this) is exempted from the mismatch whenever a file of the declared product unit is also present in the diff.

  Found via dogfooding: an agent building a real (non-Invoker) project hit this exact contradiction and produced a standalone repro.

### Patch Changes

- 352d938: Fix `classifyReviewScope` trusting an explicit `reviewLaneHint` unconditionally, even when the diff also touched files whose classified unit is incompatible with that lane (e.g. a "behavior" hint on a diff that also touches policy-only files). It now surfaces a `lane-hint-scope-mismatch` finding in that case, so a hinted-but-invalid combination isn't silently resolved only to fail later in `validatePrBody`.
