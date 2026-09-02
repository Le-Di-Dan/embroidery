/**
 * AGG-07 SKU Stock persistence contract (TBL-018..TBL-021).
 *
 * `sku_stocks` is the **lock anchor** (GRD-014): every operation that changes
 * availability takes a row lock on it first, so all decisions about one SKU
 * serialise behind the same row. Holds, reservations and the ledger hang off
 * that anchor.
 *
 * `available = quantity_on_hand − Σ active holds − Σ active reservations` is
 * computed in-transaction rather than stored (DB4 §Inventory balance): a
 * denormalised counter would need its own invariant, and at this volume the
 * computation is trivially cheap.
 *
 * Carries **G-DB7-26** (sufficient stock under the lock), **G-DB7-28**
 * (hold → reservation conversion), **G-DB7-29** (every change appends a
 * ledger entry) and **G-DB7-30** (an adjustment states its reason).
 *
 * **DB7 proves single-run behaviour only.** Oversubscription under concurrency
 * is DB8 CC-20/21/22.
 */
import type {
  InventoryEntryKind,
  InventoryReservationState,
  InventorySoftHoldState,
} from '@embroidery/database';

import type { SkuId } from './inventory-identity';

export type SkuStockId = string & { readonly __brand: 'SkuStockId' };
export type SoftHoldId = string & { readonly __brand: 'SoftHoldId' };
export type ReservationId = string & { readonly __brand: 'ReservationId' };

export interface SkuStock {
  readonly id: SkuStockId;
  readonly skuId: SkuId;
  readonly quantityOnHand: number;
  readonly lowStockThreshold: number | undefined;
}

/** The computed view a decision is made against. */
export interface StockAvailability {
  readonly quantityOnHand: number;
  readonly heldQuantity: number;
  readonly reservedQuantity: number;
  readonly available: number;
}

export interface SoftHold {
  readonly id: SoftHoldId;
  readonly skuStockId: SkuStockId;
  readonly customRequestId: string;
  readonly quantity: number;
  readonly status: InventorySoftHoldState;
  readonly expiresAt: Date;
}

export interface Reservation {
  readonly id: ReservationId;
  readonly skuStockId: SkuStockId;
  readonly orderId: string;
  readonly quantity: number;
  readonly status: InventoryReservationState;
  /**
   * When the pre-payment window closes, or `undefined` for a no-expiry
   * reservation (`PO-APP8-002`, `ADR-DB1-018` r3).
   *
   * Published by `APP12-B02` because a Ready-Made reservation now has one
   * (`BR-025`) and its creator has to be able to report the exact instant it
   * committed rather than the one it intended to.
   */
  readonly expiresAt: Date | undefined;
}

export interface LedgerEntry {
  readonly entryKind: InventoryEntryKind;
  readonly quantity: number;
  readonly onHandDelta: number;
  readonly reason: string | undefined;
  /**
   * When the movement was appended (`APP8-B01`).
   *
   * Mapped from `created_at`, a column the table has carried since DB7. It is
   * published rather than left behind because an operator reading a stock
   * history needs to know *when* it changed, and the ledger is append-only so
   * the value never moves. Ordering still comes from the identity sequence,
   * which is the append order; this is the timestamp of that append, not a
   * second sort key.
   */
  readonly occurredAt: Date;
}

/** Who caused a stock movement. Ledger entries are evidence, so this is required. */
export type InventoryActor =
  | { readonly kind: 'ADMIN'; readonly adminId: string }
  | { readonly kind: 'SYSTEM'; readonly systemJobKey: string };

export const SKU_STOCK_REPOSITORY = Symbol('SKU_STOCK_REPOSITORY');

export interface SkuStockRepository {
  /** @requiresTransaction */
  ensureStockRow(id: SkuStockId, skuId: SkuId, quantityOnHand: number): Promise<SkuStock>;

  /**
   * Loads the stock row under a row lock — the anchor every decision waits on.
   *
   * @requiresTransaction
   */
  loadForUpdate(skuId: SkuId): Promise<SkuStock | undefined>;

  /** Availability computed under the lock, for a decision about `skuId`. @requiresTransaction */
  availability(skuId: SkuId): Promise<StockAvailability | undefined>;

  /**
   * Adjusts on-hand stock, appending the ledger entry that explains it.
   *
   * A reason is mandatory (G-DB7-30): stock that changed for no recorded
   * reason cannot be reconciled.
   *
   * @requiresTransaction
   */
  adjust(skuId: SkuId, delta: number, reason: string, actor: InventoryActor): Promise<SkuStock>;

  /** @requiresTransaction — rejects when available stock is short (G-DB7-26). */
  createSoftHold(input: {
    id: SoftHoldId;
    skuId: SkuId;
    customRequestId: string;
    quantity: number;
    expiresAt: Date;
    actor: InventoryActor;
  }): Promise<SoftHold>;

  /** @requiresTransaction */
  releaseSoftHold(id: SoftHoldId, reason: string, actor: InventoryActor): Promise<void>;

  /**
   * Converts a held quantity into an official reservation (G-DB7-28).
   *
   * The hold must be HELD and for the same SKU; conversion and both ledger
   * entries share one transaction.
   *
   * @requiresTransaction
   */
  convertHold(input: {
    holdId: SoftHoldId;
    reservationId: ReservationId;
    orderId: string;
    actor: InventoryActor;
  }): Promise<Reservation>;

  /**
   * @requiresTransaction — rejects when available stock is short (G-DB7-26).
   *
   * `expiresAt` absent means **no expiry**, which is the delivered
   * `PO-APP8-002` semantics for a custom reservation. `APP12-B02` supplies one
   * for a Ready-Made reservation's `BR-025` pre-payment window; the window is
   * the caller's policy and is not computed here.
   */
  createReservation(input: {
    id: ReservationId;
    skuId: SkuId;
    orderId: string;
    quantity: number;
    actor: InventoryActor;
    expiresAt?: Date | undefined;
  }): Promise<Reservation>;

  /** @requiresTransaction */
  releaseReservation(id: ReservationId, reason: string, actor: InventoryActor): Promise<void>;

  /**
   * Expires one reservation if it is still `RESERVED`, carries an `expires_at`
   * and that instant has passed (`BR-026`, `APP12-B02`).
   *
   * Returns `undefined` when any of the three no longer holds — an ordinary
   * outcome for a sweep, not a failure. A no-expiry (custom) reservation is
   * therefore unreachable by this method by construction.
   *
   * @requiresTransaction
   */
  expireReservationIfDue(input: {
    id: ReservationId;
    now: Date;
    actor: InventoryActor;
  }): Promise<Reservation | undefined>;

  /**
   * The order's one active `RESERVED` reservation, under its row lock
   * (`APP12-B03` §17).
   *
   * The (order) form of the pair {@link consumeOrderReservation} takes, for the
   * caller that knows which order it is acting on but has no SKU in hand: the
   * Ready-Made shipping-fee transaction reaches the reservation through the
   * order alone, and a Ready-Made order holds exactly one
   * (`APP12-P01` — one SKU per checkout).
   *
   * Every reservation the order holds is locked in `id` order, so two
   * transactions reaching the same order queue in the same direction, and the
   * status is read under those locks rather than before them. `undefined` when
   * nothing active stands — expired, released or consumed — which the caller
   * treats as a refusal rather than as licence to create a replacement.
   *
   * @requiresTransaction
   */
  lockActiveOrderReservation(orderId: string): Promise<Reservation | undefined>;

  /**
   * Moves one `RESERVED` reservation's `expires_at` to a new instant
   * (`BR-025`, `APP12-B03` §16, §17).
   *
   * The payment window a Ready-Made order gets when its fee is first confirmed:
   * the customer has had no payable figure until that moment, so the window
   * that was measured from creation restarts from the confirmation. It is the
   * **same reservation row** throughout — nothing is released, nothing is
   * re-reserved and no second row is created — because the identity and the
   * ledger history of the hold on that stock must survive a repricing.
   *
   * Deliberately narrow: it changes one timestamp and writes **no ledger
   * entry**. `G-DB7-29` requires an entry for every change to committed
   * quantity, and this changes none — the reserved quantity, the anchor and
   * availability are all untouched. Inventing a ledger kind for a deadline move
   * would put a non-movement in the movement log.
   *
   * Refuses when the reservation is not `RESERVED`: a terminal hold has no
   * window to extend, and silently reviving one would hand back stock the
   * expiry sweep has already returned to availability.
   *
   * The new instant is `now() + windowMs`, computed **in the statement** so it
   * is the database's own clock (`APP12-B03` §16). The caller supplies the
   * window length, which is business policy, and never the resulting timestamp:
   * an API process whose clock has drifted would otherwise be able to write a
   * payment deadline the database does not agree with, and the reservation
   * sweep — which compares against `now()` — is the thing that would act on the
   * difference. The committed row is returned so the caller can report the
   * instant that actually landed.
   *
   * @requiresTransaction — the caller must already hold this reservation's row
   * lock, taken by {@link lockActiveOrderReservation}.
   */
  rescheduleReservationExpiry(input: { id: ReservationId; windowMs: number }): Promise<Reservation>;

  /** Consumes a reservation at production, reducing on-hand. @requiresTransaction */
  consumeReservation(id: ReservationId, actor: InventoryActor): Promise<void>;

  /**
   * Consumes the order's active reservation for one SKU (`APP8-B04` §9, §10).
   *
   * The (order, SKU) form of {@link consumeReservation}, for the caller that
   * derived *"this order requires 25 of that SKU"* from the frozen order items
   * and holds no reservation id. Everything — which row is active, whether its
   * quantity covers `requiredQuantity`, and the terminal write — is decided under
   * the reservation's row lock, so no state is read through an unlocked query
   * and then acted on (`FU-APP8-B02-02`).
   *
   * Refuses with `RESERVATION_NOT_ACTIVE` when nothing active stands for the
   * pair and `RESERVATION_QUANTITY_INSUFFICIENT` when what stands is short. It
   * never creates a replacement reservation and never restocks.
   *
   * @requiresTransaction
   */
  consumeOrderReservation(input: {
    orderId: string;
    skuId: SkuId;
    requiredQuantity: number;
    actor: InventoryActor;
  }): Promise<Reservation>;

  /**
   * Releases the order's reservation for one SKU **if one is still active**
   * (`APP8-B04` §13.2).
   *
   * Returns `undefined` when there is none — the ordinary outcome once
   * production has started and the reservation is `CONSUMED`. Nothing is
   * fabricated to give a cancellation something to release.
   *
   * @requiresTransaction
   */
  releaseOrderReservationIfActive(input: {
    orderId: string;
    skuId: SkuId;
    reason: string;
    actor: InventoryActor;
  }): Promise<Reservation | undefined>;

  findBySku(skuId: SkuId): Promise<SkuStock | undefined>;
  findHold(id: SoftHoldId): Promise<SoftHold | undefined>;
  findReservation(id: ReservationId): Promise<Reservation | undefined>;
  listLedger(skuId: SkuId): Promise<LedgerEntry[]>;
}
