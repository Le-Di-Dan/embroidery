/**
 * Drizzle implementation of the public availability snapshot (`APP12-B01`).
 *
 * ## Three statements, not one per SKU
 *
 * The anchors, then the active holds grouped by anchor, then the active
 * reservations grouped by anchor. Three round trips whatever the product's SKU
 * count is — the cost is constant, not per item, so a variant list of any size
 * costs the same as one SKU and there is no N+1 to grow into.
 *
 * They are three rather than one on purpose. A single statement would need two
 * correlated aggregate subqueries in the select list, which is exactly the shape
 * that has already produced an unqualified-column defect in this repository
 * (`APP11-B03`), and it would buy nothing: these are indexed equality reads of a
 * handful of rows.
 *
 * ## The arithmetic is APP8's, not a second copy
 *
 * `available = quantity_on_hand − Σ HELD − Σ RESERVED` and the two active states
 * come from `@embroidery/persistence` — the same constants `StockAnchor` filters
 * on before it lets a write through. This adapter chooses no state and invents
 * no balance; if LC-17 ever gains an active state, both readers gain it at once.
 *
 * ## No lock, no transaction, no write
 *
 * Deliberate, and the reason this sits behind its own port rather than on
 * `SKU_STOCK_REPOSITORY` — see `sku-availability-snapshot.port.ts`. Nothing here
 * inserts, updates or provisions: a SKU with no anchor row simply produces no
 * result row, so an anonymous `GET` can never create one (`APP12-B01` §9).
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import {
  ACTIVE_RESERVATION_STATE,
  ACTIVE_SOFT_HOLD_STATE,
  DatabaseExecutor,
  DrizzleRepository,
} from '@embroidery/persistence';
import { and, eq, inArray, sum } from 'drizzle-orm';

import type {
  SkuAvailabilityRow,
  SkuAvailabilitySnapshotPort,
} from '../../domain/repositories/sku-availability-snapshot.port';

const { skuStocks, inventorySoftHolds, inventoryReservations } = schema;

/** The floor `SkuAvailabilityRow.availableQuantity` documents. */
const MINIMUM_AVAILABLE_QUANTITY = 0;

@Injectable()
export class DrizzleSkuAvailabilitySnapshotAdapter
  extends DrizzleRepository
  implements SkuAvailabilitySnapshotPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listAvailability(skuIds: readonly string[]): Promise<SkuAvailabilityRow[]> {
    if (skuIds.length === 0) {
      // `inArray` with an empty list is not a statement worth sending, and some
      // drivers render it as invalid SQL rather than as "matches nothing".
      return [];
    }

    return this.run('listAvailability', async () => {
      const anchors = await this.db
        .select({
          id: skuStocks.id,
          skuId: skuStocks.skuId,
          quantityOnHand: skuStocks.quantityOnHand,
        })
        .from(skuStocks)
        .where(inArray(skuStocks.skuId, [...skuIds]));

      if (anchors.length === 0) {
        return [];
      }

      const anchorIds = anchors.map((anchor) => anchor.id);
      const held = await this.sumActiveHolds(anchorIds);
      const reserved = await this.sumActiveReservations(anchorIds);

      return anchors.map((anchor) => ({
        skuId: anchor.skuId,
        availableQuantity: Math.max(
          MINIMUM_AVAILABLE_QUANTITY,
          anchor.quantityOnHand - (held.get(anchor.id) ?? 0) - (reserved.get(anchor.id) ?? 0),
        ),
      }));
    });
  }

  /** `Σ quantity` of the still-active holds on each anchor. */
  private async sumActiveHolds(anchorIds: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ anchorId: inventorySoftHolds.skuStockId, total: sum(inventorySoftHolds.quantity) })
      .from(inventorySoftHolds)
      .where(
        and(
          inArray(inventorySoftHolds.skuStockId, [...anchorIds]),
          eq(inventorySoftHolds.status, ACTIVE_SOFT_HOLD_STATE),
        ),
      )
      .groupBy(inventorySoftHolds.skuStockId);

    return toTotals(rows);
  }

  /** `Σ quantity` of the still-active reservations on each anchor. */
  private async sumActiveReservations(anchorIds: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        anchorId: inventoryReservations.skuStockId,
        total: sum(inventoryReservations.quantity),
      })
      .from(inventoryReservations)
      .where(
        and(
          inArray(inventoryReservations.skuStockId, [...anchorIds]),
          eq(inventoryReservations.status, ACTIVE_RESERVATION_STATE),
        ),
      )
      .groupBy(inventoryReservations.skuStockId);

    return toTotals(rows);
  }
}

/**
 * Grouped sums → a lookup.
 *
 * `sum` over `integer` comes back as a string, and as `null` for a group with
 * no rows, so the conversion happens once here rather than at the arithmetic.
 */
function toTotals(
  rows: readonly { anchorId: string; total: string | null }[],
): Map<string, number> {
  return new Map(rows.map((row) => [row.anchorId, Number(row.total ?? 0)]));
}
