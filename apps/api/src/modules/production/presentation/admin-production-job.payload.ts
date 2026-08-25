/**
 * View → wire projection for the two Admin production reads (`APP8-B03` §7, §8).
 *
 * The single place a production `Date` becomes an ISO string, and the single
 * place an optional field is either present or omitted. Field by field, never a
 * spread of the view: a column added to a read model must be published
 * deliberately, and a spread is how a `[PII]` contact copy or an internal
 * artifact reference would arrive in a response by accident.
 *
 * `exactOptionalPropertyTypes` is on repository-wide, so an absent value is an
 * absent **key** — never `undefined` and never `null`. That is the
 * `...(x === undefined ? {} : { k: x })` shape every response projection in this
 * repository already uses.
 *
 * Pure — no injection, no query, no clock. Whether the wire shape matches the
 * published schema can be argued about here rather than inside a controller.
 */
import type {
  ProductionJobDetailView,
  ProductionQueueView,
} from '../application/admin/production-job.view';
import type {
  AdminProductionJobDetailPayload,
  AdminProductionJobQueuePayload,
} from './schemas/admin-production-job.response';

export function toQueuePayload(view: ProductionQueueView): AdminProductionJobQueuePayload {
  return {
    items: view.items.map((item) => ({
      jobId: item.jobId,
      orderId: item.orderId,
      approvalSnapshotId: item.approvalSnapshotId,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      ...(item.startedAt === undefined ? {} : { startedAt: item.startedAt.toISOString() }),
      ...(item.completedAt === undefined ? {} : { completedAt: item.completedAt.toISOString() }),
      ...(item.cancelledAt === undefined ? {} : { cancelledAt: item.cancelledAt.toISOString() }),
    })),
    nextCursor: view.nextCursor,
    hasNext: view.hasNext,
  };
}

export function toDetailPayload(view: ProductionJobDetailView): AdminProductionJobDetailPayload {
  const specification = view.specification;
  const summary = view.reservationSummary;

  return {
    jobId: view.jobId,
    orderId: view.orderId,
    orderCode: view.orderCode,
    approvalSnapshotId: view.approvalSnapshotId,
    status: view.status,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    ...(view.startedAt === undefined ? {} : { startedAt: view.startedAt.toISOString() }),
    ...(view.completedAt === undefined ? {} : { completedAt: view.completedAt.toISOString() }),
    ...(view.cancelledAt === undefined ? {} : { cancelledAt: view.cancelledAt.toISOString() }),
    ...(view.cancelledReason === undefined ? {} : { cancelledReason: view.cancelledReason }),
    ...(view.reworkedFromJobId === undefined ? {} : { reworkedFromJobId: view.reworkedFromJobId }),
    ...(specification === undefined
      ? {}
      : {
          specification: {
            approvalSnapshotId: specification.approvalSnapshotId,
            documentHash: specification.documentHash,
            productName: specification.productName,
            ...(specification.variantLabel === undefined
              ? {}
              : { variantLabel: specification.variantLabel }),
            sideName: specification.sideName,
            areaName: specification.areaName,
            physicalWidthMm: specification.physicalWidthMm,
            physicalHeightMm: specification.physicalHeightMm,
            quantityTotal: specification.quantityTotal,
            ...(specification.productionParameters === undefined
              ? {}
              : { productionParameters: specification.productionParameters }),
          },
        }),
    transitions: view.transitions.map((row) => ({
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      actorKind: row.actorKind,
      ...(row.adminId === undefined ? {} : { adminId: row.adminId }),
      ...(row.systemJobKey === undefined ? {} : { systemJobKey: row.systemJobKey }),
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      correlationId: row.correlationId,
      occurredAt: row.occurredAt.toISOString(),
    })),
    ...(summary === undefined
      ? {}
      : {
          reservationSummary: {
            required: summary.required,
            catalogItemCount: summary.catalogItemCount,
            customerOwnedItemCount: summary.customerOwnedItemCount,
            reservations: summary.reservations.map((row) => ({
              reservationId: row.reservationId,
              skuStockId: row.skuStockId,
              skuId: row.skuId,
              quantity: row.quantity,
              status: row.status,
            })),
          },
        }),
  };
}
