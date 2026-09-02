/**
 * How much of a SKU a customer could take right now — **display only**
 * (`APP12-B01`).
 *
 * A read-only CTX-INV contract published so the public Catalog can answer
 * `BR-022` ("available stock is greater than zero") without reading
 * `sku_stocks`, `inventory_soft_holds` or `inventory_reservations` itself:
 * `BACKEND_CONVENTIONS.md` §10 forbids Catalog from touching another module's
 * tables, and `REL-026`'s inventory truth split is the reason those tables are
 * not on `skus` in the first place.
 *
 * ### Why not `SKU_STOCK_REPOSITORY`
 *
 * The same argument `order-reservation-summary.port.ts` already made. That
 * symbol is the canonical AGG-07 **writer** — `adjust`, `createSoftHold`,
 * `convertHold`, `createReservation`, `release`, `consume`. An anonymous public
 * GET that imported `InventoryPersistenceModule` to read a number would acquire
 * every one of them, and `APP12-B01` may create no hold, no reservation and no
 * stock row at all. One method that returns numbers makes that a property of the
 * wiring rather than of the controller's restraint.
 *
 * Its `availability` is also the wrong shape twice over: it is `@requiresTransaction`
 * and takes the anchor lock, and it answers for exactly one SKU. A public
 * catalog read of a product's variants asks about a *set*, and taking a write
 * lock per SKU on every anonymous page view would make a browser refresh contend
 * with the reservation worker for the rows it needs.
 *
 * ### This read is NOT decision-grade
 *
 * `FU-APP8-B02-02` is explicit that a read used to *decide* something must hold
 * the `sku_stocks` anchor (GRD-014). This one takes **no lock and opens no
 * transaction**: what it returns is what a customer sees on a page, correct as
 * of the instant it was read and no longer. `BR-024` puts the reservation at
 * durable order creation, and `APP12-B02` re-checks availability under the
 * anchor lock there. This port must never become the input to that gate.
 *
 * ### Availability only
 *
 * `quantity_on_hand`, the held and reserved breakdown, the low-stock threshold,
 * the stock-anchor id, reservation ids and the ledger are all absent — not
 * redacted downstream but never selected, so no later widening of a Catalog
 * projection can publish a warehouse fact. The single number that leaves is the
 * one `BR-022` is written in terms of.
 */
export const SKU_AVAILABILITY_SNAPSHOT_PORT = Symbol('SKU_AVAILABILITY_SNAPSHOT_PORT');

/** One SKU's purchasable quantity at the instant it was read. */
export interface SkuAvailabilityRow {
  readonly skuId: string;
  /**
   * `quantity_on_hand − Σ active holds − Σ active reservations`, floored at 0.
   *
   * The formula is DB4 §Inventory balance, unchanged — the same one
   * `StockAnchor.availability` computes under the lock, over the same two active
   * states. Terminal holds and reservations (`CONVERTED`, `RELEASED`, `EXPIRED`,
   * `CONSUMED`) are history and withhold nothing.
   *
   * The floor is not arithmetic of its own. The balance can only go negative
   * through an oversubscription defect, and "−3 available" is not a truthful
   * answer to "how many may I buy": zero is. A negative would also travel into
   * a quantity stepper's maximum, where it means nothing.
   */
  readonly availableQuantity: number;
}

export interface SkuAvailabilitySnapshotPort {
  /**
   * Availability for the SKUs named, in one bounded read.
   *
   * A SKU with **no `sku_stocks` anchor is absent from the result**, not
   * reported as zero here: the port says what inventory knows, and the caller
   * decides what an unknown SKU means. `APP12-B01` treats it as unavailable.
   * That is the whole reason this method cannot provision — a public GET that
   * created the missing anchor would write to the inventory ledger's tables on
   * an anonymous page view.
   *
   * An empty input is an empty result and issues no statement.
   */
  listAvailability(skuIds: readonly string[]): Promise<SkuAvailabilityRow[]>;
}
