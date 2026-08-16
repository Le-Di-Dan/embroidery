/**
 * The durable business event a submission leaves (`APP5-G01` §8, SE-003).
 *
 * SE-003 has two halves. The **customer** half is already delivered: issuing the
 * `REQUEST_ACCESS` grant inside the submission transaction produces exactly the
 * secure-link notification the customer's confirmation is, and `APP5` adds
 * nothing there. This recorder writes the **admin-alert** half, and writes it as
 * an outbox row only (`G01-D05b`).
 *
 * ### Why no notification intent
 *
 * APP4's `NotificationRequest` is secret-bearing by construction — it requires a
 * `secret`, a `secretKind` and a `reference` from a closed two-member union —
 * and it addresses a customer contact point, not staff. Creating an intent here
 * would mean inventing a third reference kind and a secretless delivery path,
 * which is a change to APP4's notification architecture that no APP5 checkpoint
 * owns and that `APP5-G01` is explicitly scoped out of. The durable business
 * fact is this row; the consumer is an `APP12`/`X01` handoff, and the row is
 * written now precisely so that consumer can be added later without reopening
 * the transaction that produced it.
 *
 * ### The payload is minimal and versioned
 *
 * The same rule the product-publication and asset-inspection events follow: a
 * consumer reads the request row for anything else, so nothing here can go
 * stale or leak. No customer id, no contact value, no grant, no token, no
 * session secret, no storage key, no quantity and no note.
 */
import { Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

/** The outbox `aggregate_kind` for AGG-13 (`OUTBOX_AGGREGATE_KINDS`). */
const CUSTOM_REQUEST_KIND = 'CUSTOM_REQUEST' as const;

/** SE-003's admin-alert intent, named as the catalogue names it. */
export const REQUEST_SUBMITTED_EVENT = 'request.submitted';

/** Carried in the row and in the payload itself, as every other event does. */
export const REQUEST_SUBMITTED_PAYLOAD_VERSION = 1;

export interface RecordSubmissionInput {
  readonly customRequestId: string;
  /** `CATALOG` | `COP` — the one fact triage routing needs before a read. */
  readonly subjectBranch: 'CATALOG' | 'COP';
}

@Injectable()
export class RequestSubmissionRecorder {
  constructor(private readonly outbox: OutboxEventStore) {}

  /**
   * Appends the submission event.
   *
   * @requiresTransaction — an event that committed without the request would
   * announce a submission that never happened, and a request that committed
   * without the event would be a submission nobody is alerted to. INV-23 also
   * forbids calling anything external in here, and nothing does: this writes one
   * row and returns.
   */
  async record(input: RecordSubmissionInput): Promise<void> {
    await this.outbox.append({
      eventType: REQUEST_SUBMITTED_EVENT,
      aggregateKind: CUSTOM_REQUEST_KIND,
      aggregateId: input.customRequestId,
      payload: {
        schemaVersion: REQUEST_SUBMITTED_PAYLOAD_VERSION,
        customRequestId: input.customRequestId,
        subjectBranch: input.subjectBranch,
      },
      payloadSchemaVersion: REQUEST_SUBMITTED_PAYLOAD_VERSION,
    });
  }
}
