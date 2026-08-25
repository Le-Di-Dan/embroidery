/**
 * The runtime shapes the two Admin production reads return (`APP8-B03` §7, §8).
 *
 * Beside the queries that build them rather than in `presentation/`, so a
 * property cannot be added to one and forgotten in the other. Instants are
 * `Date` here and become strings exactly once, in the controller.
 */
import type { InventoryReservationState, ProductionJobState } from '@embroidery/database';

export interface ProductionQueueItem {
  readonly jobId: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;
  readonly cancelledAt: Date | undefined;
}

export interface ProductionQueueView {
  readonly items: readonly ProductionQueueItem[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}

/** The immutable specification, exactly as `createJob` froze it (§8.2). */
export interface ProductionSpecificationView {
  readonly approvalSnapshotId: string;
  readonly documentHash: string;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly productionParameters: string | undefined;
}

export interface ProductionTransitionView {
  readonly fromStatus: ProductionJobState;
  readonly toStatus: ProductionJobState;
  readonly actorKind: string;
  readonly adminId: string | undefined;
  readonly systemJobKey: string | undefined;
  readonly reason: string | undefined;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface ProductionReservationView {
  readonly reservationId: string;
  readonly skuStockId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly status: InventoryReservationState;
}

/**
 * Read-only reservation context (§8.4) — **never a start decision**.
 *
 * `required` is `false` exactly when the order has no Catalog line, which is
 * `PO-APP8-001` §1.3's `COP_RESERVATION_EXPECTATION = ABSENT_BY_DESIGN`: an
 * empty list on such an order is the correct answer, not missing coverage, and
 * publishing the distinction is what stops a screen from rendering it as a
 * problem.
 *
 * `required: true` with an empty or non-`RESERVED` list is **not** a verdict
 * that production may not start. `GRD-015` is `APP8-B04`'s, it is decided under
 * the `sku_stocks` anchor lock (GRD-014, `FU-APP8-B02-02`), and this summary is
 * an unlocked read that may be stale the instant after it is taken.
 */
export interface ProductionReservationSummaryView {
  readonly required: boolean;
  readonly catalogItemCount: number;
  readonly customerOwnedItemCount: number;
  readonly reservations: readonly ProductionReservationView[];
}

export interface ProductionJobDetailView {
  readonly jobId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;
  readonly cancelledAt: Date | undefined;
  readonly cancelledReason: string | undefined;
  readonly reworkedFromJobId: string | undefined;
  readonly specification: ProductionSpecificationView | undefined;
  readonly transitions: readonly ProductionTransitionView[];
  readonly reservationSummary: ProductionReservationSummaryView | undefined;
}
