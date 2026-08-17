/**
 * Drizzle implementation of the request↔asset association read (`APP5-B06`).
 *
 * One statement against one Ordering table. It names its columns, joins nothing,
 * locks nothing and opens no transaction: the whole question is whether TBL-040
 * holds a row for this pair carrying a role APP5 produces.
 *
 * ### The access path
 *
 * `uq_custom_request_assets__request_asset_role` is
 * `(custom_request_id, asset_id, role)` — the unique constraint CST-043 created,
 * and its leading two columns are exactly this predicate. No migration is needed
 * and none is added.
 *
 * ### Why the role is a `WHERE` term and not a post-filter
 *
 * CST-043 permits the *same* asset to be bound to one request under two roles,
 * so a pair lookup can legitimately match more than one row. Selecting them all
 * and picking in TypeScript would make an `ATTACHMENT` row briefly a candidate;
 * restricting the statement means an `ATTACHMENT`-only association returns no
 * row at all, and the ordering below makes the two-role case deterministic
 * rather than dependent on the plan.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  APP5_REQUEST_ASSET_ROLES,
  isDeliverableRequestAssetRole,
  type App5RequestAssetRole,
} from '../../domain/delivery/request-asset-delivery.policy';
import type {
  RequestAssetDeliveryRepository,
  RequestAssetLookup,
} from '../../domain/repositories/request-asset-delivery.repository';

const { customRequestAssets } = schema;

@Injectable()
export class DrizzleRequestAssetDeliveryRepository
  extends DrizzleRepository
  implements RequestAssetDeliveryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverableRole(lookup: RequestAssetLookup): Promise<App5RequestAssetRole | undefined> {
    return this.run('findDeliverableRole', async () => {
      const rows = await this.db
        .select({ role: customRequestAssets.role })
        .from(customRequestAssets)
        .where(
          and(
            eq(customRequestAssets.customRequestId, lookup.requestId),
            eq(customRequestAssets.assetId, lookup.assetId),
            inArray(customRequestAssets.role, [...APP5_REQUEST_ASSET_ROLES]),
          ),
        )
        // Deterministic when one asset carries both deliverable roles on one
        // request: the earliest association wins, rather than whichever row the
        // plan happened to emit first. The bytes are identical either way — this
        // only fixes which role the response reports.
        .orderBy(asc(customRequestAssets.createdAt), asc(customRequestAssets.id))
        .limit(1);

      const role = rows[0]?.role;
      // The `inArray` above already restricted the set; this narrows the `text`
      // column to the union rather than re-deciding it, so a role added to the
      // policy tomorrow cannot reach the caller as an unchecked string.
      return role !== undefined && isDeliverableRequestAssetRole(role) ? role : undefined;
    });
  }
}
