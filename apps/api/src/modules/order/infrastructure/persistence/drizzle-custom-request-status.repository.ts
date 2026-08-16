/**
 * Drizzle implementation of the customer read model (`APP5-B03` §10).
 *
 * Every statement names its columns explicitly. `select()` with no projection
 * would return whatever the table grows next — which on TBL-037 already means
 * `cancelled_reason` and `submitted_session_id`, and on TBL-042 means the
 * internal `reason`, three actor references and the correlation id. Listing the
 * columns is what makes "the internal data is never retrieved" true of the
 * query rather than of a mapper below it.
 *
 * No write, no transaction, no lock. Reading a request changes nothing.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { CustomRequestState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, desc, eq } from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  CustomRequestStatusAsset,
  CustomRequestStatusCustomerOwnedProduct,
  CustomRequestStatusQuantityLine,
  CustomRequestStatusRepository,
  CustomRequestStatusRow,
} from '../../domain/repositories/custom-request-status.repository';

const {
  customRequests,
  customRequestQuantityBreakdowns,
  customerOwnedProducts,
  customRequestAssets,
  customRequestTransitions,
} = schema;

@Injectable()
export class DrizzleCustomRequestStatusRepository
  extends DrizzleRepository
  implements CustomRequestStatusRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findRequest(id: CustomRequestId): Promise<CustomRequestStatusRow | undefined> {
    return this.run('findRequest', async () => {
      const [row] = await this.db
        .select({
          id: customRequests.id,
          code: customRequests.code,
          status: customRequests.status,
          createdAt: customRequests.createdAt,
          productId: customRequests.productId,
          productVariantId: customRequests.productVariantId,
          cancelledCustomerReason: customRequests.cancelledCustomerReason,
        })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id as CustomRequestId,
        code: row.code,
        status: row.status as CustomRequestState,
        createdAt: row.createdAt,
        productId: (row.productId ?? undefined) as ProductId | undefined,
        productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
        cancelledCustomerReason: row.cancelledCustomerReason ?? undefined,
      };
    });
  }

  async loadQuantityLines(id: CustomRequestId): Promise<CustomRequestStatusQuantityLine[]> {
    return this.run('loadQuantityLines', async () => {
      const rows = await this.db
        .select({
          productVariantId: customRequestQuantityBreakdowns.productVariantId,
          sizeLabel: customRequestQuantityBreakdowns.sizeLabel,
          quantity: customRequestQuantityBreakdowns.quantity,
        })
        .from(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id))
        // Stable order for a response a browser renders. `created_at` alone can
        // tie — the lines are inserted in one statement — so the id breaks it.
        .orderBy(
          asc(customRequestQuantityBreakdowns.createdAt),
          asc(customRequestQuantityBreakdowns.id),
        );

      return rows.map((row) => ({
        productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
        sizeLabel: row.sizeLabel ?? undefined,
        quantity: row.quantity,
      }));
    });
  }

  async loadCustomerOwnedProduct(
    id: CustomRequestId,
  ): Promise<CustomRequestStatusCustomerOwnedProduct | undefined> {
    return this.run('loadCustomerOwnedProduct', async () => {
      const [row] = await this.db
        .select({
          name: customerOwnedProducts.name,
          description: customerOwnedProducts.description,
          physicalWidthMm: customerOwnedProducts.physicalWidthMm,
          physicalHeightMm: customerOwnedProducts.physicalHeightMm,
        })
        .from(customerOwnedProducts)
        .where(eq(customerOwnedProducts.customRequestId, id))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        name: row.name,
        description: row.description ?? undefined,
        physicalWidthMm: row.physicalWidthMm ?? undefined,
        physicalHeightMm: row.physicalHeightMm ?? undefined,
      };
    });
  }

  async loadAssets(id: CustomRequestId): Promise<CustomRequestStatusAsset[]> {
    return this.run('loadAssets', async () => {
      const rows = await this.db
        .select({
          assetId: customRequestAssets.assetId,
          role: customRequestAssets.role,
        })
        .from(customRequestAssets)
        .where(eq(customRequestAssets.customRequestId, id))
        .orderBy(asc(customRequestAssets.createdAt), asc(customRequestAssets.id));

      return rows.map((row) => ({ assetId: row.assetId, role: row.role }));
    });
  }

  async findCurrentCustomerVisibleReason(
    id: CustomRequestId,
    status: CustomRequestState,
  ): Promise<string | undefined> {
    return this.run('findCurrentCustomerVisibleReason', async () => {
      const [row] = await this.db
        .select({ customerVisibleReason: customRequestTransitions.customerVisibleReason })
        .from(customRequestTransitions)
        .where(
          and(
            eq(customRequestTransitions.customRequestId, id),
            // Not merely "the latest transition": the latest one is the one that
            // produced the current status, and pinning `to_status` keeps that
            // true even if a later read races a transition this query does not
            // see. A reason is only ever shown for the state it explains.
            eq(customRequestTransitions.toStatus, status),
          ),
        )
        // TBL-042's id is the append sequence (IDX-100), so it is the insertion
        // order — a timestamp could tie between two moves in one transaction.
        .orderBy(desc(customRequestTransitions.id))
        .limit(1);

      return row?.customerVisibleReason ?? undefined;
    });
  }
}
