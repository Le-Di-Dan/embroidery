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
 * obligationKind        'DEPOSIT' | 'REMAINING' — the real kind, since APP9-B03
 * orderId               the order the obligation belongs to
 * ```
 *
 * ### The payload is a lookup key, not authority
 *
 * The same rule `design-approved.payload.ts` states. Nothing about *what* to
 * reserve is read from here: the reservable subjects and their quantities come
 * from the frozen `order_items` rows, and whether the order may reserve at all
 * comes from `DepositEligibilityPort` through the canonical repository. This
 * payload answers two questions — **which order**, and **whether inventory owes
 * this event anything at all** — and the payment facts it carries are used only
 * to prove the row is the event this handler consumes.
 *
 * ### Why `obligationKind` is a closed set, not a free string
 *
 * Until `APP9-B03` the producer wrote `'DEPOSIT'` as a constant, so this parser
 * read it as a literal and every other value was a malformed payload.
 * `APP9-B03` generalised the one verification command and now emits the
 * obligation's real kind, which made a verified remaining payment arrive here as
 * `JOB_PAYLOAD_INVALID` and dead-letter (`FU-APP8-W01-01`).
 *
 * So the kind is a variable now — but a **closed** one. Exactly `DEPOSIT` and
 * `REMAINING` are accepted, because those are the two kinds the verification
 * command can satisfy. Anything else stays a terminal malformed payload: a
 * producer ahead of this build must reach an operator, never be coerced onto
 * whichever branch happens to look safer. *Which* of the two triggers a
 * reservation is not decided here — see `reservation-trigger.policy.ts`.
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

/** The obligation kind that triggers an official reservation (`TR-LC17-04`). */
export const DEPOSIT_OBLIGATION_KIND = 'DEPOSIT';

/** The obligation kind `APP9-B03` added to this event, which reserves nothing. */
export const REMAINING_OBLIGATION_KIND = 'REMAINING';

/** The closed set this consumer accepts. Not a prefix and not a pattern. */
export const VERIFIED_OBLIGATION_KINDS = [
  DEPOSIT_OBLIGATION_KIND,
  REMAINING_OBLIGATION_KIND,
] as const;

export type VerifiedObligationKind = (typeof VERIFIED_OBLIGATION_KINDS)[number];

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'inventory-reservation:v1:';

/** The lookup key, plus the one field that decides whether there is work. */
export interface PaymentVerifiedLookup {
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly paymentObligationId: string;
  readonly obligationKind: VerifiedObligationKind;
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
  const obligationKind = record['obligationKind'];

  if (!isVerifiedObligationKind(obligationKind)) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  if (
    !isIdentifier(orderId) ||
    !isIdentifier(paymentAttemptId) ||
    !isIdentifier(paymentObligationId)
  ) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  return {
    valid: true,
    payload: { orderId, paymentAttemptId, paymentObligationId, obligationKind },
  };
}

function isVerifiedObligationKind(value: unknown): value is VerifiedObligationKind {
  return VERIFIED_OBLIGATION_KINDS.some((kind) => kind === value);
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
export function deriveReservationEffectKey(
  payload: Pick<PaymentVerifiedLookup, 'orderId'>,
): string {
  return `${EFFECT_KEY_PREFIX}${payload.orderId}`;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
