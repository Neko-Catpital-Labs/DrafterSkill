import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/default-taxonomy.js';
import { validatePrBody } from '../src/pr-body/validate-pr-body.js';

function validBody(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    summary: 'Fixes a bug.',
    reviewClaim: 'Corrects the bug at its source.',
    reviewLane: 'behavior',
    reviewUnit: 'product',
    safetyInvariant: 'Only this file changes; nothing else is affected.',
    sliceRationale: 'Standalone fix, nothing else bundled.',
    nonGoals: 'No refactor, no unrelated cleanup.',
    ...overrides,
  };
  return `## Summary

${fields.summary}

## Review Claim

${fields.reviewClaim}

## Review Lane

${fields.reviewLane}

## Review Unit

${fields.reviewUnit}

## Safety Invariant

${fields.safetyInvariant}

## Slice Rationale

${fields.sliceRationale}

## Non-goals

${fields.nonGoals}

## Test Plan

<details>
<summary>Test Plan</summary>

- [ ] \`npm test\`

</details>

## Revert Plan

<details>
<summary>Revert Plan</summary>

- Safe to revert? Yes
- Revert command: \`git revert <sha>\`
- Post-revert steps: None
- Data migration? No

</details>
`;
}

describe('validatePrBody', () => {
  it('passes a well-formed body with the default config', async () => {
    const result = await validatePrBody(validBody(), { config: DEFAULT_CONFIG });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an empty body', async () => {
    const result = await validatePrBody('', { config: DEFAULT_CONFIG });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('PR body is empty');
  });

  it('flags missing required sections', async () => {
    const body = validBody().replace(/## Non-goals\n\nNo refactor.*\n\n/, '');
    const result = await validatePrBody(body, { config: DEFAULT_CONFIG });
    expect(result.errors.some((e) => e.includes('Missing required section: ## Non-goals'))).toBe(true);
  });

  it('rejects the discouraged lightweight ## Testing / ## Notes format', async () => {
    const body = validBody() + '\n## Testing\n\nran it\n';
    const result = await validatePrBody(body, { config: DEFAULT_CONFIG });
    expect(result.errors.some((e) => e.includes('Unsupported section: ## Testing'))).toBe(true);
  });

  it('requires Test Plan content to be collapsed inside <details>', async () => {
    const body = validBody().replace(
      /## Test Plan\n\n<details>\n<summary>Test Plan<\/summary>\n\n- \[ \] `npm test`\n\n<\/details>/,
      '## Test Plan\n\n- [ ] `npm test`',
    );
    const result = await validatePrBody(body, { config: DEFAULT_CONFIG });
    expect(result.errors.some((e) => e.includes('must wrap its content in a collapsed'))).toBe(true);
  });

  it('rejects an invalid review lane', async () => {
    const result = await validatePrBody(validBody({ reviewLane: 'not-a-lane' }), { config: DEFAULT_CONFIG });
    expect(result.errors.some((e) => e.includes('Invalid review lane'))).toBe(true);
  });

  it('flags a docs-lane PR shipping product files via changedFiles scope check', async () => {
    const body = validBody({ reviewLane: 'docs', reviewUnit: 'docs' });
    const result = await validatePrBody(body, {
      config: DEFAULT_CONFIG,
      changedFiles: ['docs/guide.md', 'src/app.ts'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Review lane docs cannot ship with'))).toBe(true);
  });

  it('requires a refactor-lane PR to declare unchanged behavior in Non-goals', async () => {
    const body = validBody({ reviewLane: 'refactor', reviewUnit: 'product', nonGoals: 'No new features.' });
    const result = await validatePrBody(body, { config: DEFAULT_CONFIG, changedFiles: ['src/app.ts'] });
    expect(result.errors.some((e) => e.includes('must state in ## Non-goals that behavior stays unchanged'))).toBe(true);
  });

  it('accepts a refactor-lane PR that declares unchanged behavior', async () => {
    const body = validBody({ reviewLane: 'refactor', reviewUnit: 'product', nonGoals: 'No behavior change.' });
    const result = await validatePrBody(body, { config: DEFAULT_CONFIG, changedFiles: ['src/app.ts'] });
    expect(result.valid).toBe(true);
  });

  it('allows a directly-affected test file to ship with its feature under a unit marked coLocatesWithProductUnits', async () => {
    // Regression: found via dogfooding — a repo whose config classifies test
    // files as a real "proof" unit (rather than DEFAULT_CONFIG's neutral
    // tests-neutral rule) had classifyReviewScope() silently resolve a
    // feature+its own test file together, while validatePrBody() then
    // rejected that exact same combination. split-scope's own Boundary Rules
    // state directly-affected tests should stay with the change; the fix is
    // config-level (coLocatesWithProductUnits), not a special-case regex.
    const config = {
      ...DEFAULT_CONFIG,
      taxonomy: {
        lanes: DEFAULT_CONFIG.taxonomy.lanes,
        units: [
          { id: 'auth', isProductUnit: true },
          { id: 'proof', isProductUnit: false, coLocatesWithProductUnits: true },
        ],
        compatibility: [
          { lane: 'behavior', anyProductUnit: true },
          { lane: 'refactor', anyProductUnit: true },
          { lane: 'proof', units: ['proof'] },
        ],
      },
      classification: {
        ...DEFAULT_CONFIG.classification,
        pathRules: [
          { id: 'tests', pathGlob: 'src/**/*.test.ts', unit: ['proof'] },
          { id: 'auth', pathGlob: 'src/auth/**', unit: ['auth'] },
        ],
      },
    };
    const changedFiles = ['src/auth/router.ts', 'src/auth/router.test.ts'];
    const body = validBody({ reviewLane: 'behavior', reviewUnit: 'auth' });
    const result = await validatePrBody(body, { config, changedFiles });
    expect(result.valid).toBe(true);
  });

  it('still rejects a proof-unit file that is NOT accompanied by any product unit under a product-only lane', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      taxonomy: {
        lanes: DEFAULT_CONFIG.taxonomy.lanes,
        units: [
          { id: 'auth', isProductUnit: true },
          { id: 'proof', isProductUnit: false, coLocatesWithProductUnits: true },
        ],
        compatibility: [
          { lane: 'behavior', anyProductUnit: true },
          { lane: 'proof', units: ['proof'] },
        ],
      },
      classification: {
        ...DEFAULT_CONFIG.classification,
        pathRules: [{ id: 'tests', pathGlob: 'src/**/*.test.ts', unit: ['proof'] }],
      },
    };
    // Declaring "behavior"/"auth" over a diff that is ONLY a standalone test
    // file (no product unit present) must still fail — the co-location
    // exception only applies when a product unit is actually present.
    const changedFiles = ['src/auth/router.test.ts'];
    const body = validBody({ reviewLane: 'behavior', reviewUnit: 'auth' });
    const result = await validatePrBody(body, { config, changedFiles });
    expect(result.valid).toBe(false);
  });
});
