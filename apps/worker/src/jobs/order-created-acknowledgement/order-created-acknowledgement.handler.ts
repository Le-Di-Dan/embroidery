/**
 * The `order.created` acknowledgement (`APP12-H03-C1` §10, §11).
 *
 * ### What this fixes
 *
 * `order.created` (SE-006) has been appended by every order creation since DB7
 * and claimed by nobody. The claim filter is exactly the registry's event types,
 * so an unregistered type is never claimed at all: the row is not retried, not
 * dead-lettered and not abandoned — it simply stays `PENDING` forever. Every
 * Ready-Made order therefore left one permanently pending row, the queue backlog
 * never returned to zero, and `APP12-H03`'s own backlog gauge was the first
 * thing that made it visible.
 *
 * ### Why an acknowledgement and not a capability
 *
 * `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-006 records the intent as ORD→NTF,
 * *"`order.created` + payment instructions"*. That obligation is **already
 * discharged**, and not through this event: `ADR-APP4-001` made every customer
 * notification a sealed envelope minted by the API and delivered through
 * `notification.delivery.requested`, because the worker may not read a grant, a
 * contact or an order to compose one. Both order-creation paths request that
 * notification themselves inside the creating transaction — `APP12-B02` step 8
 * issues the `ORDER_ACCESS` grant with `notify: true`, and the custom path does
 * the same for its deposit link. Building a second notification trigger out of
 * `order.created` would send the customer a duplicate.
 *
 * So no Wave-1 capability owes this event anything. It remains what LC-14 makes
 * it: the canonical, audited statement that an order exists, for consumers that
 * do not exist yet. The correct disposition is to say so explicitly — claim it,
 * record a successful attempt, complete the row — rather than to delete the
 * event, invent a consumer, or leave the backlog permanently dirty.
 *
 * ### What it deliberately is not
 *
 * Not a general "acknowledge anything unclaimed" mechanism. It registers for
 * exactly one event type, and the registry's claim filter is what keeps a
 * genuinely unknown type unclaimed and visible instead of silently settled. A
 * future consumer of `order.created` replaces this handler; the registry refuses
 * two handlers for one event type, so it cannot be quietly shadowed by one.
 *
 * The job kind is `OUTBOX_DISPATCH` — the transport kind, and here the honest
 * one. `ORDER_CREATION` belongs to `APP7-W01`, which *creates* orders from
 * `design.approved`; filing an acknowledgement under it would put rows that did
 * nothing into the operator's order-creation dead-letter query. There is no
 * domain work to name, which is precisely why the transport kind fits.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';

import type {
  JobExecutionContext,
  JobHandler,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import {
  deriveAcknowledgementEffectKey,
  ORDER_AGGREGATE_KIND,
  ORDER_CREATED_EVENT_TYPE,
  ORDER_CREATED_PAYLOAD_VERSION,
  parseOrderCreatedPayload,
  type OrderCreatedLookup,
} from './domain/order-created.payload';
import { acknowledgementRefusal } from './domain/order-created.errors';

/** The transport kind. No domain work is performed, so none is claimed. */
const OUTBOX_DISPATCH: BackgroundJobKind = 'OUTBOX_DISPATCH';

@Injectable()
export class OrderCreatedAcknowledgementHandler implements JobHandler<OrderCreatedLookup> {
  readonly eventType = ORDER_CREATED_EVENT_TYPE;
  readonly jobKind = OUTBOX_DISPATCH;
  readonly payloadSchemaVersion = ORDER_CREATED_PAYLOAD_VERSION;

  validatePayload(payload: unknown): PayloadValidationResult<OrderCreatedLookup> {
    return parseOrderCreatedPayload(payload);
  }

  deriveEffectKey(payload: OrderCreatedLookup): string {
    return deriveAcknowledgementEffectKey(payload);
  }

  execute(payload: OrderCreatedLookup, context: JobExecutionContext): Promise<void> {
    if (context.aggregateKind !== ORDER_AGGREGATE_KIND || context.aggregateId !== payload.orderId) {
      // The same producer-defect check the reservation handler makes, and for
      // the same reason: the claim filter is by event type, so a row of the
      // right type with the wrong linkage is possible. Terminal — no number of
      // retries changes what the columns say. An acknowledgement that would
      // settle such a row is worse than no acknowledgement, because it would
      // erase the only evidence the producer is broken.
      //
      // Returned as a rejection rather than thrown: this handler awaits
      // nothing, so it is not `async`, and a synchronous throw from a method
      // declared `Promise<void>` would put the refusal on a different channel
      // from every other handler's. The runtime happens to catch both — it
      // awaits inside a `try` — but a contract that only works because of where
      // the caller's `await` sits is one refactor away from silence.
      return Promise.reject(
        acknowledgementRefusal(
          'EVENT_LINKAGE_MISMATCH',
          'The event linkage and payload name different orders.',
        ),
      );
    }

    // The whole of the work: nothing. No read, no write, no transaction, no
    // network call — and no log line either. The runtime records the
    // `SUCCEEDED` attempt, emits its own structured `worker.job.completed`
    // record carrying the job kind, the job key and the correlation id, and
    // completes the outbox row through exactly the path a real handler's
    // success takes. A line here would add no operator-visible fact that record
    // does not already carry, and the only thing it could add that the record
    // does not is a **business identifier** — which is how an order code
    // reaches a log aggregator. `APP12-H03`'s marker scan asserts that it does
    // not; a first draft of this handler logged the order code and moved that
    // count from zero to one, in a staging Loki, for no benefit at all.
    return Promise.resolve();
  }
}
