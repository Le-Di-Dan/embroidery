/**
 * The `order.created` (SE-006) payload contract, as its acknowledging consumer
 * reads it (`APP12-H03-C1` §10).
 *
 * Two producers write this event and they write different fields:
 *
 * ```text
 * DrizzleOrderRepository            { orderId, code, customRequestId }
 * DrizzleReadyMadeOrderRepository   { orderId, code, origin }
 * ```
 *
 * Both carry `orderId` and `code`, and those two are the whole of what this
 * consumer needs — it acknowledges the fact, it does not act on it. The
 * divergent third field is deliberately **not** parsed: reading `origin` here
 * would make the acknowledgement branch on a lifecycle it has no business
 * knowing, and requiring `customRequestId` would refuse every Ready-Made order.
 *
 * The version is checked by the runtime before this file is reached
 * (`payloadSchemaVersion`), so a producer ahead of this build is
 * `JOB_SCHEMA_UNSUPPORTED` and terminal rather than a malformed-payload guess.
 */
import type { PayloadValidationResult } from '../../../runtime/registry/job-handler';

/** `SE-006`, exactly as both order repositories write it. */
export const ORDER_CREATED_EVENT_TYPE = 'order.created';

/** Both producers write schema version 1. One shape, so far. */
export const ORDER_CREATED_PAYLOAD_VERSION = 1;

/** The aggregate both producers link the row to. */
export const ORDER_AGGREGATE_KIND = 'ORDER';

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'order-created-ack:v1:';

/** The two fields both producers agree on. Nothing else is read. */
export interface OrderCreatedLookup {
  readonly orderId: string;
  readonly code: string;
}

export function parseOrderCreatedPayload(
  payload: unknown,
): PayloadValidationResult<OrderCreatedLookup> {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  const record = payload as Record<string, unknown>;
  const orderId = record['orderId'];
  const code = record['code'];

  if (!isIdentifier(orderId) || !isIdentifier(code)) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  return { valid: true, payload: { orderId, code } };
}

/**
 * The durable effect's identity: the **order**.
 *
 * The effect is an acknowledgement rather than a mutation, so the key does no
 * guarding work in practice — but it is derived on the same rule every other
 * handler uses, from the subject and not from the row id or the clock, so that a
 * redelivery is recognisably the same job rather than new work.
 */
export function deriveAcknowledgementEffectKey(
  payload: Pick<OrderCreatedLookup, 'orderId'>,
): string {
  return `${EFFECT_KEY_PREFIX}${payload.orderId}`;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
