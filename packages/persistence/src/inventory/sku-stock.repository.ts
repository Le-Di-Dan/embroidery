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

  /** @requiresTransaction — rejects when available stock is short (G-DB7-26). */
  createReservation(input: {
    id: ReservationId;
    skuId: SkuId;
    orderId: string;
    quantity: number;
    actor: InventoryActor;
  }): Promise<Reservation>;

  /** @requiresTransaction */
  releaseReservation(id: ReservationId, reason: string, actor: InventoryActor): Promise<void>;

  /** Consumes a reservation at production, reducing on-hand. @requiresTransaction */
  consumeReservation(id: ReservationId, actor: InventoryActor): Promise<void>;

  findBySku(skuId: SkuId): Promise<SkuStock | undefined>;
  findHold(id: SoftHoldId): Promise<SoftHold | undefined>;
  findReservation(id: ReservationId): Promise<Reservation | undefined>;
  listLedger(skuId: SkuId): Promise<LedgerEntry[]>;
}
