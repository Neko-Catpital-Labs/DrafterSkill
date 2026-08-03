import type { DrafterConfig } from '../types.js';

export interface RevertPlanFields {
  safeToRevert: string;
  revertCommand: string;
  postRevertSteps: string;
  dataMigration: string;
}

export interface ArchitectureFields {
  before: string;
  after: string;
}

export interface PrBodyFields {
  summary: string;
  reviewClaim: string;
  reviewLane: string;
  reviewUnit: string;
  safetyInvariant: string;
  sliceRationale: string;
  nonGoals: string;
  testPlanItems: string[];
  revertPlan: RevertPlanFields;
  /** Markdown body for the Visual Proof section; omit when the diff isn't UI-impacting. */
  visualProof?: string;
  architecture?: ArchitectureFields;
}

/**
 * Programmatic PR-body renderer — new in DrafterSkill. Invoker only ever had a
 * blank template for a human to fill in by hand; this lets a caller (the
 * draft_pr_body MCP tool, or a CI script) produce a fully-populated body that
 * already conforms to validatePrBody()'s schema.
 */
export function renderPrBody(fields: PrBodyFields, _config: DrafterConfig): string {
  const sections: string[] = [];

  sections.push(`## Summary\n\n${fields.summary.trim()}`);
  sections.push(`## Review Claim\n\n${fields.reviewClaim.trim()}`);
  sections.push(`## Review Lane\n\n${fields.reviewLane.trim()}`);
  sections.push(`## Review Unit\n\n${fields.reviewUnit.trim()}`);
  sections.push(`## Safety Invariant\n\n${fields.safetyInvariant.trim()}`);
  sections.push(`## Slice Rationale\n\n${fields.sliceRationale.trim()}`);
  sections.push(`## Non-goals\n\n${fields.nonGoals.trim()}`);

  if (fields.architecture) {
    sections.push(
      [
        '## Architecture',
        '',
        '### Before',
        '',
        '```mermaid',
        fields.architecture.before.trim(),
        '```',
        '',
        '### After',
        '',
        '```mermaid',
        fields.architecture.after.trim(),
        '```',
      ].join('\n'),
    );
  }

  const testPlanItems = fields.testPlanItems.length > 0 ? fields.testPlanItems : ['exact command'];
  sections.push(
    [
      '## Test Plan',
      '',
      '<details>',
      '<summary>Test Plan</summary>',
      '',
      ...testPlanItems.map((item) => `- [ ] \`${item}\``),
      '',
      '</details>',
    ].join('\n'),
  );

  if (fields.visualProof) {
    sections.push(`## Visual Proof\n\n${fields.visualProof.trim()}`);
  }

  const { revertPlan } = fields;
  sections.push(
    [
      '## Revert Plan',
      '',
      '<details>',
      '<summary>Revert Plan</summary>',
      '',
      `- Safe to revert? ${revertPlan.safeToRevert}`,
      `- Revert command: \`${revertPlan.revertCommand}\``,
      `- Post-revert steps: ${revertPlan.postRevertSteps}`,
      `- Data migration? ${revertPlan.dataMigration}`,
      '',
      '</details>',
    ].join('\n'),
  );

  return sections.join('\n\n') + '\n';
}
