/**
 * Drizzle implementation of the Admin read model (`APP5-B04` §12, §13).
 *
 * Every statement names its columns. On TBL-037 that keeps
 * `current_design_case_id` and `current_quotation_id` — APP6 pointers with no
 * shape yet — out of a response B04 has no authority to define, and on TBL-042
 * it keeps `correlation_id` and `system_job_key` out of the history.
 *
 * ### The queue's access path
 *
 * `ix_custom_requests__status_created_id` is `(status, created_at DESC,
 * id DESC)` — the index DB5 created for exactly this list. The query filters
 * `status IN (…)` and pages on `(created_at, id) < (…)`, which is that index's
 * leading column followed by its ordering columns, so no migration is needed
 * and none is added (§13).
 *
 * No write, no transaction, no lock: reading a request changes nothing, and a
 * lock taken by a report is a lock a moderation transaction would wait on.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { CustomRequestState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  AdminRequestAssetLink,
  AdminRequestCustomerOwnedProduct,
  AdminRequestDetailRow,
  AdminRequestModerationNoteRow,
  AdminRequestQuantityLine,
  AdminRequestQueueQuery,
  AdminRequestQueueRow,
  AdminRequestTransitionRow,
  CustomRequestAdminRepository,
} from '../../domain/repositories/custom-request-admin.repository';

const {
  customRequests,
  customRequestQuantityBreakdowns,
  customerOwnedProducts,
  customRequestAssets,
  customRequestTransitions,
  requestModerationNotes,
} = schema;

@Injectable()
export class DrizzleCustomRequestAdminRepository
  extends DrizzleRepository
  implements CustomRequestAdminRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listQueue(query: AdminRequestQueueQuery): Promise<AdminRequestQueueRow[]> {
    return this.run('listQueue', async () => {
      const { filter, after } = query;
      const conditions: SQL[] = [inArray(customRequests.status, [...filter.statuses])];

      if (filter.subjectKind === 'CATALOG') {
        conditions.push(isNotNull(customRequests.productId));
      } else if (filter.subjectKind === 'CUSTOMER_OWNED') {
        // The branch is the *absence* of a catalog subject, which is how the
        // row itself expresses it (`APP5-G01` §3 — catalog XOR customer-owned).
        // Filtering by "has a TBL-038 child" instead would need a join and would
        // silently drop a COP request whose child row is still being written.
        conditions.push(isNull(customRequests.productId));
      }
      if (filter.code !== undefined) {
        conditions.push(eq(customRequests.code, filter.code));
      }
      if (filter.customerId !== undefined) {
        conditions.push(eq(customRequests.customerId, filter.customerId));
      }
      if (filter.submittedFrom !== undefined) {
        conditions.push(gte(customRequests.createdAt, filter.submittedFrom));
      }
      if (filter.submittedTo !== undefined) {
        conditions.push(lte(customRequests.createdAt, filter.submittedTo));
      }
      if (after !== undefined) {
        // The keyset predicate, written out rather than as a row comparison so
        // it stays readable: strictly older, or the same instant with a smaller
        // id. `created_at` is not unique, so the id is what makes the page
        // boundary total and stops a row being repeated or skipped.
        const keyset = or(
          lt(customRequests.createdAt, after.createdAt),
          and(eq(customRequests.createdAt, after.createdAt), lt(customRequests.id, after.id)),
        );
        if (keyset !== undefined) {
          conditions.push(keyset);
        }
      }

      const rows = await this.db
        .select({
          id: customRequests.id,
          code: customRequests.code,
          status: customRequests.status,
          customerId: customRequests.customerId,
          createdAt: customRequests.createdAt,
          productId: customRequests.productId,
        })
        .from(customRequests)
        .where(and(...conditions))
        .orderBy(desc(customRequests.createdAt), desc(customRequests.id))
        .limit(query.limit + 1);

      return rows.map((row) => ({
        id: row.id as CustomRequestId,
        code: row.code,
        status: row.status as CustomRequestState,
        customerId: row.customerId,
        createdAt: row.createdAt,
        productId: (row.productId ?? undefined) as ProductId | undefined,
      }));
    });
  }

  async loadQueueCustomerOwnedNames(
    requestIds: readonly CustomRequestId[],
  ): Promise<ReadonlyMap<string, string>> {
    if (requestIds.length === 0) {
      return new Map();
    }
    return this.run('loadQueueCustomerOwnedNames', async () => {
      const rows = await this.db
        .select({
          customRequestId: customerOwnedProducts.customRequestId,
          name: customerOwnedProducts.name,
        })
        .from(customerOwnedProducts)
        .where(inArray(customerOwnedProducts.customRequestId, [...requestIds]));

      return new Map(rows.map((row) => [row.customRequestId, row.name]));
    });
  }

  async loadQueueQuantityTotals(
    requestIds: readonly CustomRequestId[],
  ): Promise<ReadonlyMap<string, number>> {
    if (requestIds.length === 0) {
      return new Map();
    }
    return this.run('loadQueueQuantityTotals', async () => {
      // Summed in the database rather than by loading every line for the page:
      // a request may carry one line per variant, and the queue needs one number
      // per request.
      const rows = await this.db
        .select({
          customRequestId: customRequestQuantityBreakdowns.customRequestId,
          total: sql<string>`sum(${customRequestQuantityBreakdowns.quantity})`,
        })
        .from(customRequestQuantityBreakdowns)
        .where(inArray(customRequestQuantityBreakdowns.customRequestId, [...requestIds]))
        .groupBy(customRequestQuantityBreakdowns.customRequestId);

      // `sum()` over an integer column returns `bigint`, which the driver hands
      // back as a string. Parsed here, where the column type is known, rather
      // than left for a consumer to coerce.
      return new Map(rows.map((row) => [row.customRequestId, Number(row.total)]));
    });
  }

  async findDetail(id: CustomRequestId): Promise<AdminRequestDetailRow | undefined> {
    return this.run('findDetail', async () => {
      const [row] = await this.db
        .select({
          id: customRequests.id,
          code: customRequests.code,
          status: customRequests.status,
          customerId: customRequests.customerId,
          createdAt: customRequests.createdAt,
          updatedAt: customRequests.updatedAt,
          productId: customRequests.productId,
          productVariantId: customRequests.productVariantId,
          customerNote: customRequests.customerNote,
          cancelledReason: customRequests.cancelledReason,
          cancelledCustomerReason: customRequests.cancelledCustomerReason,
          submittedSessionId: customRequests.submittedSessionId,
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
        customerId: row.customerId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        productId: (row.productId ?? undefined) as ProductId | undefined,
        productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
        customerNote: row.customerNote ?? undefined,
        cancelledReason: row.cancelledReason ?? undefined,
        cancelledCustomerReason: row.cancelledCustomerReason ?? undefined,
        submittedSessionId: row.submittedSessionId ?? undefined,
      };
    });
  }

  async loadQuantityLines(id: CustomRequestId): Promise<AdminRequestQuantityLine[]> {
    return this.run('loadQuantityLines', async () => {
      const rows = await this.db
        .select({
          productVariantId: customRequestQuantityBreakdowns.productVariantId,
          sizeLabel: customRequestQuantityBreakdowns.sizeLabel,
          quantity: customRequestQuantityBreakdowns.quantity,
        })
        .from(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id))
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
  ): Promise<AdminRequestCustomerOwnedProduct | undefined> {
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

  async loadAssetLinks(id: CustomRequestId): Promise<AdminRequestAssetLink[]> {
    return this.run('loadAssetLinks', async () => {
      const rows = await this.db
        .select({
          assetId: customRequestAssets.assetId,
          role: customRequestAssets.role,
          createdAt: customRequestAssets.createdAt,
        })
        .from(customRequestAssets)
        .where(eq(customRequestAssets.customRequestId, id))
        .orderBy(asc(customRequestAssets.createdAt), asc(customRequestAssets.id));

      return rows.map((row) => ({
        assetId: row.assetId,
        role: row.role,
        linkedAt: row.createdAt,
      }));
    });
  }

  async loadTransitions(id: CustomRequestId): Promise<AdminRequestTransitionRow[]> {
    return this.run('loadTransitions', async () => {
      const rows = await this.db
        .select({
          id: customRequestTransitions.id,
          fromStatus: customRequestTransitions.fromStatus,
          toStatus: customRequestTransitions.toStatus,
          actorKind: customRequestTransitions.actorKind,
          adminId: customRequestTransitions.adminId,
          customerId: customRequestTransitions.customerId,
          reason: customRequestTransitions.reason,
          customerVisibleReason: customRequestTransitions.customerVisibleReason,
          createdAt: customRequestTransitions.createdAt,
        })
        .from(customRequestTransitions)
        .where(eq(customRequestTransitions.customRequestId, id))
        .orderBy(asc(customRequestTransitions.id));

      return rows.map((row) => ({
        sequence: Number(row.id),
        fromStatus: row.fromStatus as CustomRequestState,
        toStatus: row.toStatus as CustomRequestState,
        actorKind: row.actorKind,
        adminId: row.adminId ?? undefined,
        customerId: row.customerId ?? undefined,
        reason: row.reason ?? undefined,
        customerVisibleReason: row.customerVisibleReason ?? undefined,
        occurredAt: row.createdAt,
      }));
    });
  }

  async loadModerationNotes(id: CustomRequestId): Promise<AdminRequestModerationNoteRow[]> {
    return this.run('loadModerationNotes', async () => {
      const rows = await this.db
        .select({
          id: requestModerationNotes.id,
          kind: requestModerationNotes.kind,
          note: requestModerationNotes.note,
          adminId: requestModerationNotes.adminId,
          createdAt: requestModerationNotes.createdAt,
        })
        .from(requestModerationNotes)
        .where(eq(requestModerationNotes.customRequestId, id))
        .orderBy(asc(requestModerationNotes.id));

      return rows.map((row) => ({
        sequence: Number(row.id),
        kind: row.kind,
        note: row.note,
        adminId: row.adminId,
        createdAt: row.createdAt,
      }));
    });
  }
}
