/**
 * The durable business events an APP5 moderation decision leaves
 * (`APP5-G01` §8 rows 3–5, `G01-D05b`).
 *
 * Three of the five moderation targets tell the customer something, and each one
 * gets exactly the outbox intent `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` names for
 * it. `UNDER_REVIEW` gets none in either direction: taking a request into review
 * — or back into it after a clarification — is an internal move the customer is
 * not notified about, and appending an event nothing consumes would invent a
 * consequence the catalogue does not record.
 *
 * ### Outbox rows only, no notification intent
 *
 * Identical to `RequestSubmissionRecorder`'s reasoning and for the same reason:
 * APP4's `NotificationRequest` is secret-bearing by construction — it requires a
 * `secret`, a `secretKind` and a `reference` from a closed two-member union —
 * and none of these three messages carries a credential. Creating an intent
 * would mean inventing a third reference kind and a secretless delivery path,
 * which is a change to APP4's notification architecture that no APP5 checkpoint
 * owns. The durable business fact is this row plus the TBL-042 transition; the
 * consumer is a later handoff, and the row is written now precisely so it can be
 * added without reopening the transaction that produced it.
 *
 * ### What the payload may carry, and what it may not
 *
 * The **customer-visible** reason travels, because the catalogue's SE-012 row
 * annotates the event with it and a delivery built later must not have to
 * re-derive which of two texts was the customer's. The **internal** reason is
 * not a parameter of any method here, so no call site can pass one by mistake —
 * that is the whole point of the split `APP5-B04` preserved and `APP5-B05`
 * writes. No customer id, no contact value, no grant, no token, no note text and
 * no operator identity: a consumer reads the request row for anything else.
 */
import { Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import type { App5TransitionTarget } from '../../domain/moderation/request-moderation.policy';

/** The outbox `aggregate_kind` for AGG-13 (`OUTBOX_AGGREGATE_KINDS`). */
const CUSTOM_REQUEST_KIND = 'CUSTOM_REQUEST' as const;

/** Carried in the row and in the payload itself, as every other event does. */
export const REQUEST_MODERATION_PAYLOAD_VERSION = 1;

/**
 * The event each notifying target maps to, named as the catalogue names it.
 *
 * `undefined` is a decision, not a gap: it records that `UNDER_REVIEW` has no
 * side effect, and it is what makes the exhaustive `Record` below able to state
 * that for every target rather than leaving one unmentioned.
 */
export const MODERATION_EVENT_OF: Readonly<Record<App5TransitionTarget, string | undefined>> = {
  UNDER_REVIEW: undefined,
  /** SE-004. */
  NEEDS_CLARIFICATION: 'request.clarification-requested',
  /** SE-012. */
  REJECTED: 'request.rejected',
  /** SE-012. */
  CANCELLED: 'request.cancelled',
};

export interface RecordModerationInput {
  readonly customRequestId: string;
  readonly to: App5TransitionTarget;
  /** The customer's half of the decision. Never the internal one — see above. */
  readonly customerVisibleReason: string | undefined;
}

@Injectable()
export class RequestModerationRecorder {
  constructor(private readonly outbox: OutboxEventStore) {}

  /**
   * Appends the event for this move, when the move has one.
   *
   * @requiresTransaction — an event that committed without the transition would
   * announce a decision that was never taken, and a transition that committed
   * without its event would be a decision the customer is never told about.
   * INV-23 also forbids calling anything external in here, and nothing does:
   * this writes at most one row and returns.
   */
  async record(input: RecordModerationInput): Promise<void> {
    const eventType = MODERATION_EVENT_OF[input.to];
    if (eventType === undefined) {
      return;
    }

    await this.outbox.append({
      eventType,
      aggregateKind: CUSTOM_REQUEST_KIND,
      aggregateId: input.customRequestId,
      payload: {
        schemaVersion: REQUEST_MODERATION_PAYLOAD_VERSION,
        customRequestId: input.customRequestId,
        toStatus: input.to,
        ...(input.customerVisibleReason === undefined
          ? {}
          : { customerVisibleReason: input.customerVisibleReason }),
      },
      payloadSchemaVersion: REQUEST_MODERATION_PAYLOAD_VERSION,
    });
  }
}
