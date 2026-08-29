/**
 * TanStack query identity for the merge workflow.
 *
 * One server fact lives in this cache — the merge case — and it is keyed by the
 * case id, which is the only thing the detail read takes. Every settled mutation
 * invalidates exactly `mergeCase(caseId)`: an execute or a reject changes that
 * case and nothing else this screen displays.
 *
 * The participant *lookups* have no key here, and neither do the participant
 * cards. Resolving a contact is a mutation in `customer-access-support` for a
 * reason — caching it would hold a mapping from a real person's address to their
 * Customer id in browser memory, and keying it would put that address in a
 * devtools panel — and the masked cards are read through that capability's own
 * `customerAccessKeys.customer(id)`, so the two screens share one cached
 * Customer instead of keeping two that can disagree.
 */
const ROOT = ['admin', 'customer-merge'] as const;

export const customerMergeKeys = {
  root: ROOT,
  mergeCase: (mergeCaseId: string) => [...ROOT, 'case', mergeCaseId] as const,
} as const;
