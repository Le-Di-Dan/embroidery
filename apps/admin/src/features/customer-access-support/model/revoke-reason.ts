/**
 * The revoke reason, validated before it is ever sent.
 *
 * `APP4-B07` makes the reason mandatory and non-blank at three levels — a check
 * constraint, the issuer and the request schema — because it is copied verbatim
 * into an audit trail that outlives the grant, and a revoked grant without a
 * reason is not evidence. This is the outermost of those checks and the only one
 * that can put the problem next to the field the operator is typing in.
 *
 * Trimmed, because a reason of spaces satisfies "required" and none of its
 * purpose. The trimmed value is what gets sent, so the audit row never records
 * leading whitespace an operator did not mean.
 */
import { REVOKE_REASON_MAX_LENGTH } from './customer-access-copy';

export type ReasonProblem = 'blank' | 'too-long';

export type ReasonValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly problem: ReasonProblem };

export function validateRevokeReason(raw: string): ReasonValidation {
  const value = raw.trim();
  if (value === '') return { ok: false, problem: 'blank' };
  if (value.length > REVOKE_REASON_MAX_LENGTH) return { ok: false, problem: 'too-long' };
  return { ok: true, value };
}
