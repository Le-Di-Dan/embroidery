/**
 * The `payment.verified` (SE-007) payload contract, as the consumer reads it
 * (`APP8-W01` §3).
 *
 * `APP7-B04` has been appending this row since it shipped, inside the same
 * transaction that satisfies the DEPOSIT obligation, and nothing has ever
 * claimed it. This is the consumer. The event is **used as delivered**: no
 * `payment.deposit.verified.v2`, no second reservation trigger, no field added
 * to make W01 easier.
 *
 * `payment-decision.recorder.ts` writes exactly four keys:
 *
 * ```text
 * paymentAttemptId      the attempt the operator verified — also aggregate_id
 * paymentObligationId   the obligation that moved to SATISFIED
 * obligationKind        the literal 'DEPOSIT'
 * orderId               the order the obligation belongs to
 * ```
 *
 * ### The payload is a lookup key, not authority
 *
 * The same rule `design-approved.payload.ts` states. Nothing about *what* to
 * reserve is read from here: the reservable subjects and their quantities come
 * from the frozen `order_items` rows, and whether the order may reserve at all
 * comes from `DepositEligibilityPort` through the canonical repository. This
 * payload answers one question — **which order** — and the deposit facts it
 * carries are used only to prove the row is the event this handler consumes.
 *
 * ### Why `obligationKind` is validated as a literal
 *
 * The producer does not compute it; it writes `'DEPOSIT'` as a constant, because
 * `verify-payment-attempt.use-case.ts` refuses any non-deposit obligation
 * (`DEPOSIT_NOT_PAYABLE`). `TR-LC17-04` is likewise gated on *the deposit
 * verified event*. So `DEPOSIT` is part of the contract's shape rather than one
 * of its variables, and reading it as such is what makes a future
 * remaining-payment verification visible to an operator instead of silently
 * reserving stock a second time. Extending this consumer is APP9's to do
 * deliberately, not this handler's to guess at.
 *
 * The version is checked by the runtime before this file is reached
 * (`payloadSchemaVersion`), so a producer ahead of this build is
 * `JOB_SCHEMA_UNSUPPORTED` and terminal rather than a malformed-payload guess.
 */
import type { PayloadValidationResult } from '../../../runtime/registry/job-handler';

/** `SE-007`, exactly as `payment-decision.recorder.ts` writes it. */
export const PAYMENT_VERIFIED_EVENT_TYPE = 'payment.verified';

/** `PAYMENT_VERIFIED_SCHEMA_VERSION` — the producer's own constant. */
export const PAYMENT_VERIFIED_PAYLOAD_VERSION = 1;

/** The aggregate the producer links the row to: the verified attempt. */
export const PAYMENT_ATTEMPT_AGGREGATE_KIND = 'PAYMENT_ATTEMPT';

/** The one obligation kind that triggers an official reservation (`TR-LC17-04`). */
export const DEPOSIT_OBLIGATION_KIND = 'DEPOSIT';

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'inventory-reservation:v1:';

/** The lookup key, and nothing else. */
export interface PaymentVerifiedLookup {
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly paymentObligationId: string;
}

export function parsePaymentVerifiedPayload(
  payload: unknown,
): PayloadValidationResult<PaymentVerifiedLookup> {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  const record = payload as Record<string, unknown>;
  const orderId = record['orderId'];
  const paymentAttemptId = record['paymentAttemptId'];
  const paymentObligationId = record['paymentObligationId'];

  if (record['obligationKind'] !== DEPOSIT_OBLIGATION_KIND) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  if (
    !isIdentifier(orderId) ||
    !isIdentifier(paymentAttemptId) ||
    !isIdentifier(paymentObligationId)
  ) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  return { valid: true, payload: { orderId, paymentAttemptId, paymentObligationId } };
}

/**
 * The durable effect's identity: the **order**.
 *
 * Not the outbox event id, and not the payment attempt. `TR-LC17-04` names the
 * idempotency scope `inventory.reserve` *per order*, and the effect this handler
 * produces is the order's whole reservation set. Two deliveries of one
 * verification are two deliveries of one effect; keying on the row id would make
 * the second look like new work, and keying on the attempt would coincide with
 * the order only for as long as one order can have exactly one verified deposit
 * attempt — true today, and not a property this file should depend on.
 */
export function deriveReservationEffectKey(payload: PaymentVerifiedLookup): string {
  return `${EFFECT_KEY_PREFIX}${payload.orderId}`;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
