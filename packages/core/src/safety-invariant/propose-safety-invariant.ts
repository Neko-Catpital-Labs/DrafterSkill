export interface ProposeSafetyInvariantInput {
  reviewClaim: string;
  diffSummary?: string;
  changedFiles?: string[];
}

export interface ProposeSafetyInvariantResult {
  draftText: string;
  /**
   * Always true. This is a DRAFT only — per DrafterSkill's confirmed v1 scope,
   * confirmation stays a pure prompt-level convention: relay draftText to the
   * user verbatim and ask them to confirm or correct it before treating it as
   * final. Nothing in this library enforces that a human actually did so.
   */
  confirmationRequired: true;
}

/**
 * Pure text generator — produces a draft Safety Invariant, never a confirmed
 * one. New in DrafterSkill; Invoker never had a programmatic proposer, only
 * "the AI writes something in chat."
 */
export function proposeSafetyInvariant(input: ProposeSafetyInvariantInput): ProposeSafetyInvariantResult {
  const changedFiles = input.changedFiles ?? [];
  const claim = input.reviewClaim.trim().replace(/\.$/, '');

  const scope =
    changedFiles.length === 0
      ? 'the described change'
      : changedFiles.length <= 3
        ? changedFiles.join(', ')
        : `${changedFiles.length} files`;

  const draftText = claim
    ? `Only ${scope} change${changedFiles.length === 1 ? 's' : ''}; the rest of the codebase's behavior is unaffected by "${claim}". [DRAFT — confirm or correct before finalizing]`
    : `Only ${scope} change; unrelated behavior is unaffected. [DRAFT — confirm or correct before finalizing]`;

  return { draftText, confirmationRequired: true };
}
