/**
 * The `inventory.reserve` idempotency key (`TR-LC17-04`,
 * `DB3_IDEMPOTENCY_SPECIFICATION.md`, GRD-012).
 *
 * The binding is accepted authority and is restated here rather than re-decided.
 * `DB3_IDEMPOTENCY_SPECIFICATION.md` gives the whole row:
 *
 * ```text
 * namespace   = inventory.reserve
 * scope       = (order)
 * fingerprint = sku/qty set
 * replay      = the reservation refs that were created
 * arbiter     = uq_inventory_reservations__order_stock__reserved (CST-016)
 * ```
 *
 * No second idempotency table, token or hash scheme is introduced: this is the
 * delivered `idempotency_records` protocol, claimed inside the reservation's own
 * transaction, exactly as `order.create` uses it one checkpoint over.
 *
 * ### The scope key is the order id
 *
 * The spec's scope is `(order)` — one order reserves once, however many SKUs
 * that turns out to mean and however many times the event is delivered. The id
 * is already opaque, unique and server-chosen, so it is used as-is; hashing it
 * would only make the row unreadable to an operator diagnosing a stuck claim.
 *
 * ### The fingerprint is the sku/qty set, and that matters here
 *
 * Unlike `order.create` — whose fingerprint could only ever restate its scope —
 * this operation genuinely has inputs beyond its scope: *which* SKUs and *how
 * many* of each. They are read from frozen `order_items`, so two executions of
 * the same order must agree on them, and a fingerprint that ever disagreed would
 * mean the frozen snapshot had moved underneath the reservation. GRD-030 then
 * makes that an `IDEMPOTENCY_CONFLICT` rather than a silent replay of a
 * different quantity — which is the honest outcome, not a gap.
 *
 * The pre-image is built from the **sorted** requirement list, the same order the
 * locks are taken in, so it is a property of the set and not of the row order the
 * items happened to come back in.
 *
 * ### The encoding is spelled out
 *
 * Length-prefixed and joined in a fixed order, so `"ab" + "c"` and `"a" + "bc"`
 * cannot collide — the rule `submission-fingerprint.ts` records and
 * `order-create-idempotency.ts` follows.
 */
import { createHash } from 'node:crypto';

import type { ReservationRequirement } from './reservation-requirements';

/** `DB3_IDEMPOTENCY_SPECIFICATION.md`'s namespace for this operation. */
export const INVENTORY_RESERVE_NAMESPACE = 'inventory.reserve';

/**
 * How long a claim may sit `IN_PROGRESS` before a sweep may reclaim it.
 *
 * The `order.create` value, for the `order.create` reason: generous relative to
 * a transaction that is a handful of statements, so a worker killed mid-
 * reservation does not block the retry forever, and short enough that it does
 * not outlive an operator's patience. The spec's *retention* class for this
 * namespace is "case-long"; that governs how long a **completed** record is kept
 * for replay, which no sweep in this repository shortens today, and no TTL value
 * is invented here for one.
 */
export const INVENTORY_RESERVE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

/** What a completed claim stores, so a duplicate replays it instead of writing. */
export interface ReserveOrderResult {
  readonly reservationIds: readonly string[];
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalReservePreimage(
  orderId: string,
  requirements: readonly ReservationRequirement[],
): string {
  return [
    field(orderId),
    ...requirements.flatMap((requirement) => [
      field(requirement.skuId),
      field(String(requirement.quantity)),
    ]),
  ].join('|');
}

export function reserveScopeKey(orderId: string): string {
  return orderId;
}

export function reserveFingerprint(
  orderId: string,
  requirements: readonly ReservationRequirement[],
): string {
  return `sha256:${createHash('sha256')
    .update(canonicalReservePreimage(orderId, requirements), 'utf8')
    .digest('hex')}`;
}

export function readReserveOrderResult(result: unknown): ReserveOrderResult | undefined {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }
  const ids = (result as Record<string, unknown>)['reservationIds'];
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
    return undefined;
  }
  return { reservationIds: ids };
}

/** Length-prefixed, so no two field sequences can share a pre-image. */
function field(value: string): string {
  return `${value.length}:${value}`;
}
