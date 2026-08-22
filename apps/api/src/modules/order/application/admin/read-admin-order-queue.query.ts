/**
 * The Admin order queue (`APP7-B02` §5, §6).
 *
 * One keyset page of orders, newest first. One statement, whatever the page
 * size: every column reported is a column of `orders`, so there is nothing to
 * batch and nothing to resolve per row.
 *
 * ### What it does not do
 *
 * It joins no Catalog table, reads no customer profile and asks no payment
 * question. `totalAmount` is the order's own frozen total, not a sum over its
 * lines; `customerId` and `customRequestId` are the order's own foreign keys,
 * exposed so the Admin screen can navigate, not a customer name resolved from
 * live profile state (§9).
 *
 * ### There is no default status filter
 *
 * `APP5-B04`'s queue defaults to a three-state triage set because `APP5-G01`
 * defines one. LC-14 defines no equivalent for orders, so B02 invents none: with
 * no `status` parameter the page is every state in `created_at DESC` order, and
 * the caller knows exactly what it asked for. A default subset here would be a
 * business rule with no authority behind it, and it would silently hide the
 * `CANCELLED` and `ON_HOLD` orders an operator went looking for.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { OrderState } from '@embroidery/database';

import { adminOrderReadError } from '../../domain/admin/admin-order-read.errors';
import {
  ADMIN_ORDER_READ_REPOSITORY,
  type AdminOrderQueuePosition,
  type AdminOrderQueueRow,
  type AdminOrderReadRepository,
} from '../../domain/repositories/admin-order-read.repository';

export interface AdminOrderQueueInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly statuses?: readonly OrderState[] | undefined;
}

export interface AdminOrderQueueItem {
  readonly orderId: string;
  readonly code: string;
  readonly status: OrderState;
  readonly customRequestId: string;
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: Date;
}

export interface AdminOrderQueueView {
  readonly items: readonly AdminOrderQueueItem[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}

@Injectable()
export class ReadAdminOrderQueue {
  constructor(
    @Inject(ADMIN_ORDER_READ_REPOSITORY) private readonly orders: AdminOrderReadRepository,
  ) {}

  async list(input: AdminOrderQueueInput): Promise<AdminOrderQueueView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const rows = await this.orders.listQueue({
      filter: { statuses: input.statuses },
      after,
      limit,
    });

    const page = buildPage(rows, limit, (row: AdminOrderQueueRow) => ({
      sortValue: row.createdAt.toISOString(),
      tieBreaker: row.id,
    }));

    return {
      items: page.items.map((row): AdminOrderQueueItem => ({
        orderId: row.id,
        code: row.code,
        status: row.status,
        customRequestId: row.customRequestId,
        customerId: row.customerId,
        // The frozen total, byte for byte as `numeric(14,2)` stored it. Not
        // re-summed from the lines, and not re-derived from a current price.
        totalAmount: row.totalAmount,
        currencyCode: row.currencyCode,
        createdAt: row.createdAt,
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
function decodePosition(cursor: string | undefined): AdminOrderQueuePosition | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw adminOrderReadError('ORDER_CURSOR_INVALID');
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw adminOrderReadError('ORDER_CURSOR_INVALID');
  }
}
