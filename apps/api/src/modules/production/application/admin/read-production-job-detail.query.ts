/**
 * The Admin production job detail (`APP8-B03` §8).
 *
 * The stable read model an operator needs *before* `APP8-B04` adds actions to
 * it: the job root and its LC-18 evidence, the frozen specification, the
 * append-only transition history, and read-only reservation context.
 *
 * ### Four reads, no write, no lock, no transaction
 *
 * ```text
 * job          -> production_jobs                    (§8.1)
 * specification-> production_specifications          (§8.2, frozen — never re-derived)
 * transitions  -> production_job_transitions         (§8.3, append-only, insert order)
 * reservations -> ORDER_RESERVATION_SUMMARY_PORT     (§8.4, display only)
 * ```
 *
 * No transaction wraps them, deliberately. This is a screen refresh; opening one
 * would make it contend on the same rows the reservation worker and a future
 * `APP8-B04` start command take under lock, for a benefit — a consistent instant
 * across four independent reads — that an Admin detail view does not need and
 * that no accepted authority asks for.
 *
 * ### The specification is reported, never reconstructed
 *
 * `loadSpecification` reads `production_specifications` and nothing else. No
 * live `products`, `product_variants`, `quotation_versions`, `design_versions`
 * or `design_sessions` row is consulted, so a Catalog rename after the job was
 * created cannot change what this returns (§8.2, INV-03).
 *
 * A job whose specification row is missing reports `specification: undefined`
 * rather than failing: `uq_production_specifications__job` and the creation
 * transaction make that unreachable, and dressing an impossible state as a
 * `404` would tell an operator the job does not exist when it plainly does.
 *
 * ### The reservation summary is context, not a verdict (§8.4, §17)
 *
 * It is composed from two unlocked reads — the order's subject counts and the
 * reservations standing against it — and it is display-only. `APP8-B04` owns
 * `GRD-015` and must take that decision under the `sku_stocks` anchor lock
 * against rows it read there; it may not treat this as its input
 * (`FU-APP8-B02-02`). If the order behind the job cannot be resolved, the
 * summary is omitted rather than guessed: an absent section is honest, an empty
 * one would read as "no reservations".
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ORDER_PRODUCTION_CONTEXT_PORT,
  type OrderProductionContextPort,
} from '../../../order/domain/repositories/order-production-context.port';
import {
  ORDER_RESERVATION_SUMMARY_PORT,
  type OrderReservationSummaryPort,
} from '../../../inventory/domain/repositories/order-reservation-summary.port';
import { productionOperationError } from '../../domain/production-operations.errors';
import {
  ADMIN_PRODUCTION_READ_REPOSITORY,
  type AdminProductionReadRepository,
} from '../../domain/repositories/admin-production-read.repository';
import type { ProductionJobId } from '../../domain/repositories/production-job.repository';
import type {
  ProductionJobDetailView,
  ProductionReservationSummaryView,
} from './production-job.view';

@Injectable()
export class ReadProductionJobDetail {
  constructor(
    @Inject(ADMIN_PRODUCTION_READ_REPOSITORY)
    private readonly jobs: AdminProductionReadRepository,
    @Inject(ORDER_PRODUCTION_CONTEXT_PORT) private readonly orders: OrderProductionContextPort,
    @Inject(ORDER_RESERVATION_SUMMARY_PORT)
    private readonly reservations: OrderReservationSummaryPort,
  ) {}

  async read(jobId: string): Promise<ProductionJobDetailView> {
    const id = jobId as ProductionJobId;
    const job = await this.jobs.findDetail(id);
    if (job === undefined) {
      throw productionOperationError('PRODUCTION_JOB_NOT_FOUND');
    }

    const [specification, transitions, order] = await Promise.all([
      this.jobs.loadSpecification(id),
      this.jobs.listTransitions(id),
      this.orders.findByOrderId(job.orderId),
    ]);

    return {
      jobId: job.id,
      orderId: job.orderId,
      // `fk_production_jobs__order_id` is `NOT NULL` with `restrict`, so the
      // order cannot have gone; the fallback exists only so an unreachable
      // state cannot crash a read.
      orderCode: order?.code ?? '',
      approvalSnapshotId: job.approvalSnapshotId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      cancelledAt: job.cancelledAt,
      cancelledReason: job.cancelledReason,
      reworkedFromJobId: job.reworkedFromJobId,
      specification,
      transitions: transitions.map((row) => ({
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        actorKind: row.actorKind,
        adminId: row.adminId,
        systemJobKey: row.systemJobKey,
        reason: row.reason,
        correlationId: row.correlationId,
        occurredAt: row.occurredAt,
      })),
      reservationSummary:
        order === undefined ? undefined : await this.summarise(job.orderId, order),
    };
  }

  private async summarise(
    orderId: string,
    order: { readonly catalogItemCount: number; readonly customerOwnedItemCount: number },
  ): Promise<ProductionReservationSummaryView> {
    const rows = await this.reservations.listForOrder(orderId);
    return {
      // `PO-APP8-001` §1.3/§1.4: a Catalog line is what creates a reservation
      // requirement, and a COP line never weakens or offsets one.
      required: order.catalogItemCount > 0,
      catalogItemCount: order.catalogItemCount,
      customerOwnedItemCount: order.customerOwnedItemCount,
      reservations: rows.map((row) => ({
        reservationId: row.reservationId,
        skuStockId: row.skuStockId,
        skuId: row.skuId,
        quantity: row.quantity,
        status: row.status,
      })),
    };
  }
}
