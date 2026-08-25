/**
 * The Admin production queue (`APP8-B03` §7).
 *
 * One keyset page of production jobs, newest first. One statement, whatever the
 * page size: every column reported is a column of `production_jobs`, so there
 * is nothing to batch and nothing to resolve per row.
 *
 * ### There is no default status filter
 *
 * With no `status` parameter the page is every LC-18 state in
 * `created_at DESC` order. IDX-082 is partial on the two active states, which
 * makes an active-only page the cheap one — but making that the *default* would
 * be a triage rule no accepted authority states, and it would silently hide the
 * `COMPLETED` and `CANCELLED` jobs an operator went looking for. `APP7-B02`
 * settled the same question the same way for orders.
 *
 * ### What it does not do
 *
 * It joins no order, no approval, no specification and no reservation. A queue
 * row says which job needs attention; the frozen specification and the
 * reservation context are the detail read's, opened deliberately for one job.
 * It invents no priority, no SLA, no operator, no machine and no attempt count:
 * `APP8-G01` §7.2 creates none of those columns (§7.1, §14).
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { ProductionJobState } from '@embroidery/database';

import { productionOperationError } from '../../domain/production-operations.errors';
import {
  ADMIN_PRODUCTION_READ_REPOSITORY,
  type AdminProductionReadRepository,
  type ProductionQueuePosition,
  type ProductionQueueRow,
} from '../../domain/repositories/admin-production-read.repository';
import type { ProductionQueueItem, ProductionQueueView } from './production-job.view';

export interface ProductionQueueInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly statuses?: readonly ProductionJobState[] | undefined;
  readonly orderId?: string | undefined;
}

@Injectable()
export class ReadProductionQueue {
  constructor(
    @Inject(ADMIN_PRODUCTION_READ_REPOSITORY)
    private readonly jobs: AdminProductionReadRepository,
  ) {}

  async list(input: ProductionQueueInput): Promise<ProductionQueueView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const rows = await this.jobs.listQueue({
      filter: { statuses: input.statuses, orderId: input.orderId },
      after,
      limit,
    });

    const page = buildPage(rows, limit, (row: ProductionQueueRow) => ({
      sortValue: row.createdAt.toISOString(),
      tieBreaker: row.id,
    }));

    return {
      items: page.items.map((row): ProductionQueueItem => ({
        jobId: row.id,
        orderId: row.orderId,
        approvalSnapshotId: row.approvalSnapshotId,
        status: row.status,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        cancelledAt: row.cancelledAt,
      })),
      nextCursor: page.nextCursor,
      hasNext: page.nextCursor !== undefined,
    };
  }
}

/**
 * A malformed cursor is a client error, never "start from the beginning".
 *
 * Silently restarting is how an operator paging a queue would process the first
 * page twice and believe they had reached the end of it.
 */
function decodePosition(cursor: string | undefined): ProductionQueuePosition | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw productionOperationError('PRODUCTION_CURSOR_INVALID');
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw productionOperationError('PRODUCTION_CURSOR_INVALID');
  }
}
