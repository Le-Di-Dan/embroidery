/**
 * The inventory half of a production transition (`APP8-B04` §5.5, §6, §9, §10,
 * §13.2).
 *
 * One place where *"which reservations does this order's production need"* is
 * answered, so the start path and the cancellation path cannot disagree about
 * the requirement set, the SKU order they walk it in, or which canonical write
 * they reach it through.
 *
 * ### The requirement is re-derived from the frozen order items
 *
 * Through `aggregateCatalogRequirements`, the one canonical rule — promoted into
 * `@embroidery/persistence` by this checkpoint precisely so `APP8-W01` reserves
 * and `APP8-B04` consumes by the same aggregation (§6). `APP8-B03`'s
 * `ORDER_RESERVATION_SUMMARY_PORT` is display-only and unlocked
 * (`FU-APP8-B03-02`); it is not injected here, so it cannot become a decision by
 * convenience.
 *
 * A COP order item has no `sku_id`, contributes no requirement and is not
 * represented in the result at all — so a COP-only order needs nothing, consumes
 * nothing and releases nothing, and no SKU, stock row or reservation is
 * fabricated to give it something (`PO-APP8-001` §1.3).
 *
 * ### Sequential, in ascending SKU id
 *
 * `for…of` with `await` **is** the lock ordering. `Promise.all` would still take
 * every lock, but in whatever order the connection interleaved them, and two
 * commands over overlapping SKU sets could then deadlock. Same logical lock set,
 * same acquisition order, every execution.
 *
 * ### Two actors, because they are two facts
 *
 * Consumption is system-owned: `TR-LC17-05` is a goods issue the production step
 * caused, not a stock decision an operator took, and `APP8-B04` §4 names
 * `SYSTEM` for it. The Admin who commanded the start is recorded where LC-18
 * records actors — `production_job_transitions` — and on the accepted audit row.
 * Writing an Admin id into the inventory ledger instead would make the ledger
 * claim an operator adjusted stock, which is `GRD-023`'s vocabulary and a
 * different fact.
 *
 * Release is the opposite case and carries the **Admin**: it is an operator's
 * decision to stop the work, with the mandatory reason attached to it.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  aggregateCatalogRequirements,
  ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  type OrderId,
  type OrderRepository,
  type SkuStockRepository,
} from '@embroidery/persistence';

/** The accepted system job key for the production-start goods issue. */
export const PRODUCTION_START_SYSTEM_JOB_KEY = 'production.start';

@Injectable()
export class ProductionReservationCoordinator {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
  ) {}

  /**
   * Consumes every Catalog reservation the order's frozen items require.
   *
   * Each one exactly once, each decided under its own row lock, on-hand
   * decremented once per reservation. A missing, terminal or short reservation
   * refuses from inside the canonical repository and the caller's whole
   * transaction rolls back — including any earlier requirement in this same
   * loop that had already been consumed (§10).
   *
   * @requiresTransaction
   */
  async consumeAll(orderId: OrderId): Promise<string[]> {
    const consumed: string[] = [];
    for (const requirement of await this.requirementsOf(orderId)) {
      const reservation = await this.stock.consumeOrderReservation({
        orderId,
        skuId: requirement.skuId,
        requiredQuantity: requirement.quantity,
        actor: { kind: 'SYSTEM', systemJobKey: PRODUCTION_START_SYSTEM_JOB_KEY },
      });
      consumed.push(reservation.id);
    }
    return consumed;
  }

  /**
   * Releases whatever is **still** `RESERVED`, and nothing else.
   *
   * After a production start the reservations are `CONSUMED` and stay that way:
   * the goods left, and §13.2 forbids "unconsuming" them or fabricating a
   * release so that cancelling a `STARTED` job looks like cancelling a `PLANNED`
   * one. The returned ids are the reservations this cancellation actually
   * released — empty is a truthful answer, not a silent failure.
   *
   * @requiresTransaction
   */
  async releaseAll(orderId: OrderId, reason: string, adminId: string): Promise<string[]> {
    const released: string[] = [];
    for (const requirement of await this.requirementsOf(orderId)) {
      const reservation = await this.stock.releaseOrderReservationIfActive({
        orderId,
        skuId: requirement.skuId,
        reason,
        actor: { kind: 'ADMIN', adminId },
      });
      if (reservation !== undefined) {
        released.push(reservation.id);
      }
    }
    return released;
  }

  private async requirementsOf(orderId: OrderId) {
    return aggregateCatalogRequirements(await this.orders.loadItems(orderId));
  }
}
