/**
 * The `readyMadeOrder.create` fingerprint (`BR-023`, GRD-030).
 *
 * The fingerprint decides whether a second call on the same scope key is a
 * **replay** of the same order or an `IDEMPOTENCY_CONFLICT`. Its inputs are the
 * customer's actual choices, and only those:
 *
 *   1. `skuId`;
 *   2. `quantity`;
 *   3. the delivery facts, in a fixed order.
 *
 * ### What is deliberately excluded
 *
 * Everything the **server** derives: the resolved unit price, the line total,
 * the currency, the order code, the reservation expiry and the customer id. A
 * price is not part of the customer's intent — it is the server's answer to it
 * (`BR-021`) — so including it would make an honest retry of the same order,
 * arriving moments after an operator edited the Catalog, a *conflict* rather
 * than the replay the idempotency contract promises. That is the same recorded
 * reasoning `submission-fingerprint.ts` applies to the design-document hash.
 *
 * The delivery facts **are** included, because they are the customer's own
 * input and a retry that quietly changed the address is not the same order.
 *
 * ### Why the encoding is spelled out rather than borrowed
 *
 * Two runs over the same facts must produce the same bytes, and
 * `JSON.stringify` does not promise that across shapes. `submission-fingerprint.ts`
 * solves the same problem for `request.submit` and records why it does not reach
 * for a shared canonical-JSON helper: the tuple is small and fixed, and lifting
 * a runtime helper across a bounded context is a wider change than a checkpoint
 * like this owns. The same applies here, and the two encodings stay independent
 * so a change to one cannot silently invalidate the other's stored records.
 *
 * Every field is length-prefixed and joined in a fixed order: `"ab" + "c"` and
 * `"a" + "bc"` cannot collide, and an absent optional field is distinguishable
 * from an empty one.
 */
import { createHash } from 'node:crypto';

/** The delivery facts a Ready-Made order freezes, exactly as the caller sent them. */
export interface ReadyMadeDeliveryFingerprintInput {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward: string | undefined;
  readonly district: string | undefined;
  readonly province: string;
}

export interface ReadyMadeOrderFingerprintInput {
  readonly skuId: string;
  readonly quantity: number;
  readonly delivery: ReadyMadeDeliveryFingerprintInput;
}

/** `sha256:` + 64 lowercase hex, matching every other digest in the repository. */
export const READY_MADE_ORDER_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Length-prefixes one field.
 *
 * `undefined` encodes as `-` rather than as a zero-length string, so an omitted
 * ward and an empty one are different orders.
 */
function field(value: string | undefined): string {
  return value === undefined ? '-:' : `${String(value.length)}:${value}`;
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalReadyMadeOrderPreimage(input: ReadyMadeOrderFingerprintInput): string {
  const { delivery } = input;
  return [
    field(input.skuId),
    field(String(input.quantity)),
    field(delivery.recipientName),
    field(delivery.recipientPhone),
    field(delivery.addressLine),
    field(delivery.ward),
    field(delivery.district),
    field(delivery.province),
  ].join('|');
}

export function readyMadeOrderFingerprint(input: ReadyMadeOrderFingerprintInput): string {
  return `sha256:${createHash('sha256')
    .update(canonicalReadyMadeOrderPreimage(input), 'utf8')
    .digest('hex')}`;
}
