/**
 * The durable half of the submitted-design placement read (`APP6-B08` §8, §10).
 *
 * The statement is `APP6-B07`'s, deliberately: one row, one `WHERE`, no `OR`.
 * The session's identity, the handover pointer back to the request and the
 * `SUBMITTED` lifecycle state are all evaluated against one consistent snapshot,
 * so `submitted_request_id = :requestId` makes another request's session
 * unreachable rather than fetched and then rejected. There is no fallback to
 * "the latest session", to the request's own product, or to any default
 * placement — substituting a placement is precisely the failure
 * `ADR-APP6-001` exists to prevent, and a query with one branch cannot do it.
 *
 * Three columns, and the omissions are the guarantee: no `session_secret_hash`,
 * no `design_document`, no `product_variant_id` (the variant a formal version
 * freezes is the request's subject, not the Studio's record of it), no
 * `expires_at`, no `template_id`.
 *
 * There is no `insert`, `update`, `delete` or `for('update')` in this file.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  SubmittedDesignPlacement,
  SubmittedDesignPlacementLookup,
  SubmittedDesignPlacementPort,
} from '../../domain/repositories/submitted-design-placement.port';

const { designSessions } = schema;

/** LC-07's handover state. The only state that is submitted evidence. */
const SUBMITTED_SESSION_STATE = 'SUBMITTED';

@Injectable()
export class DrizzleSubmittedDesignPlacementRepository
  extends DrizzleRepository
  implements SubmittedDesignPlacementPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findSubmittedPlacement(
    lookup: SubmittedDesignPlacementLookup,
  ): Promise<SubmittedDesignPlacement | undefined> {
    return this.run('findSubmittedPlacement', async () => {
      const [row] = await this.db
        .select({
          productId: designSessions.productId,
          productSideId: designSessions.productSideId,
          embroideryAreaId: designSessions.embroideryAreaId,
        })
        .from(designSessions)
        .where(
          and(
            eq(designSessions.id, lookup.sessionId),
            eq(designSessions.submittedRequestId, lookup.requestId),
            eq(designSessions.status, SUBMITTED_SESSION_STATE),
          ),
        )
        .limit(1);

      if (row === undefined) return undefined;

      return {
        productId: row.productId as ProductId,
        productSideId: row.productSideId as ProductSideId,
        embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
      };
    });
  }
}
