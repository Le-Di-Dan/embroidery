/**
 * The replayable shape of a committed approval (`APP6-B11` §16).
 *
 * Split from the use case because it is a different responsibility with a
 * different lifetime: this is what a `design.approve` idempotency record stores
 * and what a duplicate submission is answered with **hours later**, possibly by
 * a different process running a newer build. Everything about it is therefore a
 * compatibility surface, and keeping it beside the transaction that happens to
 * write it invites a field to be added to one without a thought for the other.
 *
 * ### Refs and committed facts only
 *
 * Nothing secret-bearing is stored: no token, no grant id, no step-up challenge
 * and no contact. `idempotency_records.result` is a `jsonb` column read back and
 * returned verbatim to whoever presents the same scope and fingerprint, so a
 * credential placed here would be handed out on every retry.
 *
 * Nothing derived is stored either — no `replayed` flag. Whether a call is a
 * replay is a property of *that call*, not of the stored result, and freezing it
 * would make every replay report `false` forever after the first.
 *
 * ### The timestamp is a string, and is not re-formatted
 *
 * `approvedAt` crosses as the ISO-8601 text the approval committed, so a replay
 * reports the instant the approval happened rather than the instant it was asked
 * about again. It is parsed back to a `Date` at the view boundary and nowhere
 * else: two round-trips through `new Date(...)` would be two chances to shift a
 * customer's approval time by a timezone.
 */
import type { DesignApprovedView } from './design-decision.view';

export interface ApprovalResult {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly approvalSnapshotId: string;
  readonly documentHash: string;
  readonly requestStatus: string;
  /** ISO-8601, exactly as the committing transaction wrote it. */
  readonly approvedAt: string;
}

/** The stored result as the customer sees it. `replayed` is the caller's to set. */
export function toApprovedView(result: ApprovalResult): Omit<DesignApprovedView, 'replayed'> {
  return {
    versionId: result.versionId,
    version: result.version,
    versionStatus: result.versionStatus,
    approvalSnapshotId: result.approvalSnapshotId,
    documentHash: result.documentHash,
    requestStatus: result.requestStatus,
    approvedAt: new Date(result.approvedAt),
  };
}

/**
 * A stored idempotency result, read back.
 *
 * Reported rather than coerced when it is unusable: fabricating a confirmation
 * for an approval whose evidence cannot be described would be worse than a 500,
 * because the customer would be told their design was approved on terms nobody
 * can now name. Only reachable if a `COMPLETED` record carries no object, which
 * this use case never writes.
 */
export function replayApprovedView(stored: unknown): DesignApprovedView {
  if (stored === null || typeof stored !== 'object') {
    throw new Error('A completed design.approve record carried no replayable result.');
  }
  return { ...toApprovedView(stored as ApprovalResult), replayed: true };
}
