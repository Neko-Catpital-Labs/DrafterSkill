---
"@neko-catpital-labs/drafter-core": minor
---

Add `taxonomy.units[].coLocatesWithProductUnits` to implement split-scope's own written Boundary Rules exception ("directly affected tests stay with the change that requires them"), which was never actually enforced. Previously, `classifyReviewScope` could silently resolve a feature file plus its own directly-covering test file into one PR, while `validatePrBody` then hard-rejected that exact same combination — the two never agreed because each reimplemented the lane/unit compatibility check independently. Both now share one `forbiddenUnitsForLane` helper, and a unit marked `coLocatesWithProductUnits` (the default config's own `proof` unit sets this) is exempted from the mismatch whenever a file of the declared product unit is also present in the diff.

Found via dogfooding: an agent building a real (non-Invoker) project hit this exact contradiction and produced a standalone repro.
