/**
 * The two mandatory reasons, validated where the field is.
 *
 * `APP10-B02` bounds both at 1…1000 and requires both. They are validated here
 * rather than left for the server to refuse because this is the only place the
 * problem can be shown next to the field being typed in — and because sending a
 * blank reason spends a round trip to be told what the form already knows.
 *
 * The value is **trimmed**, and the trimmed value is what travels. A reason of
 * spaces satisfies "required" and none of its purpose, and the merge case row
 * and the audit trail should never record whitespace the operator did not mean.
 *
 * Two reasons, two different destinations, and the screen never confuses them:
 * the open reason is stored on the case and published back by the detail read;
 * the rejection reason is recorded in `audit_events.reason` and is published by
 * **no** read at all. `merge-reason.ts` is shared because the bound and the
 * trimming rule are identical, not because the two reasons are.
 */
export const MERGE_REASON_MAX_LENGTH = 1_000;

export type ReasonProblem = 'blank' | 'too-long';

export type ReasonValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly problem: ReasonProblem };

export function validateMergeReason(raw: string): ReasonValidation {
  const value = raw.trim();
  if (value === '') return { ok: false, problem: 'blank' };
  if (value.length > MERGE_REASON_MAX_LENGTH) return { ok: false, problem: 'too-long' };
  return { ok: true, value };
}
