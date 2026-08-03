---
"@neko-catpital-labs/drafter-core": patch
---

Fix `classifyReviewScope` trusting an explicit `reviewLaneHint` unconditionally, even when the diff also touched files whose classified unit is incompatible with that lane (e.g. a "behavior" hint on a diff that also touches policy-only files). It now surfaces a `lane-hint-scope-mismatch` finding in that case, so a hinted-but-invalid combination isn't silently resolved only to fail later in `validatePrBody`.
