/**
 * TBL-010 `customer_merge_events` — the append-only record of what a merge
 * actually did (`APP10-B03` §16).
 *
 * **Append, and nothing else.** There is no update, no delete, no upsert and no
 * `findById` that could feed one: the contract has a single method, so no caller
 * — now or later — has a path to correct an event in place. That is not a
 * stylistic choice. CST-098's database-level append-only trigger is documented
 * by the DB phases as not yet built (the same honest gap
 * `inventory_ledger_entries` and `custom_request_transitions` carry), so until it
 * exists the application's own shape is the guarantee. A correction to merge
 * history is a new row, never an edit.
 *
 * ### One row per step, and the counts are the transaction's own
 *
 * Every entry names its `stepKind` from the closed `MERGE_EVENT_STEP_KINDS` set
 * and carries the count of rows that step actually changed — read from the
 * `UPDATE` that changed them, never from the `APP10-B02` preview. A preview is
 * advisory and is recomputed on every read; freezing one of its numbers into
 * append-only evidence would preserve a figure that was never authoritative.
 *
 * ### What a merge event may carry, and what it never does
 *
 * `subject_table` / `subject_id` is the justified cross-cutting correlation the
 * schema documents, not a polymorphic foreign key. The subject of a bulk
 * repoint is the **customer reference that moved**, so `subjectId` is the
 * loser's id: naming one arbitrary row out of forty would describe the step
 * worse than naming what every one of them had in common.
 *
 * `detail` is a bounded, server-derived summary — the two customer ids and a
 * count. Never a contact value in any form, never a masked one, never a display
 * name, never a note and never a row snapshot. An append-only table has no
 * scrub path of its own, so PII written here would outlive every anonymization
 * the retention policy can perform.
 */
import type { MergeEventStepKind } from '@embroidery/database';

import type { CustomerMergeCaseId } from './customer-merge-case.repository';
import type { CustomerId } from './customer.repository';

export const CUSTOMER_MERGE_EVENT_REPOSITORY = Symbol('CUSTOMER_MERGE_EVENT_REPOSITORY');

export interface AppendMergeEventInput {
  readonly mergeCaseId: CustomerMergeCaseId;
  readonly stepKind: MergeEventStepKind;
  /** The physical table the step changed, e.g. `orders`. */
  readonly subjectTable: string;
  /** The customer reference that moved — the loser's id. See the file header. */
  readonly subjectId: CustomerId;
  /**
   * Where the reference now points — the survivor's id.
   *
   * Recorded in `detail` beside the count, so a step row states the direction of
   * its own transfer instead of requiring a reader to join the case. On
   * `GRANT_REVOKE` it is the survivor of the merge the revocation belongs to,
   * not a new owner: a grant is revoked, never repointed.
   */
  readonly targetCustomerId: CustomerId;
  /** How many rows this step changed, as reported by the statement itself. */
  readonly affectedCount: number;
  /**
   * Whether the loser's primary contact had to be demoted before the move.
   *
   * Only meaningful on `CONTACT_MOVE`, and present only when it happened: the
   * demotion is the one deterministic identity change a merge performs beyond
   * repointing, so the evidence has to say that it did.
   */
  readonly primaryDemoted?: boolean;
}

export interface CustomerMergeEventRepository {
  /**
   * Appends the ordered execution steps of one merge.
   *
   * All of them together, in the order given: the sequence *is* the evidence,
   * and appending them one call at a time would let a later reader interleave
   * two merges' steps in the table's own ordering.
   *
   * @requiresTransaction — the evidence commits with the merge it describes, or
   * neither does. An event row surviving a rolled-back merge would be a record
   * of something that never happened.
   */
  append(entries: readonly AppendMergeEventInput[]): Promise<void>;
}
