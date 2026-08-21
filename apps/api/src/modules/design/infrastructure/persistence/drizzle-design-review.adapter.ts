/**
 * Drizzle implementation of the customer review read port (`APP6-B10` §6).
 *
 * Columns are named explicitly, never `select()`, for the reason
 * `DrizzleCustomRequestDesignContextAdapter` records: TBL-028 carries
 * `parent_version_id`, the five placement columns, both physical dimensions,
 * `approved_at`, `superseded_at` and `created_at`, and an unprojected select
 * would hand every one of them to a public surface that has no rule reading them
 * — and would keep doing so for whatever the table grows next.
 *
 * Neither method locks. `FOR UPDATE` on a public read would serialise every
 * customer refresh against the workshop's concurrent sends for no benefit, and
 * this read decides nothing a later transaction relies on: `GRD-007` re-reads
 * the version under a lock when the approval is submitted.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type {
  DesignCaseId,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import type {
  DesignReviewCase,
  DesignReviewPort,
  DesignReviewVersion,
} from '../../domain/repositories/design-review.port';

const { designCases, designVersions } = schema;

/** The LC-08 state the review target is in, and the only one this port matches. */
const SENT_FOR_REVIEW = 'SENT_FOR_REVIEW';

const CASE_COLUMNS = {
  id: designCases.id,
  customRequestId: designCases.customRequestId,
} as const;

const VERSION_COLUMNS = {
  id: designVersions.id,
  designCaseId: designVersions.designCaseId,
  version: designVersions.version,
  documentSchemaVersion: designVersions.documentSchemaVersion,
  designDocument: designVersions.designDocument,
  documentHash: designVersions.documentHash,
  sentAt: designVersions.sentAt,
} as const;

@Injectable()
export class DrizzleDesignReviewAdapter extends DrizzleRepository implements DesignReviewPort {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findReviewCase(id: DesignCaseId): Promise<DesignReviewCase | undefined> {
    return this.run('findReviewCase', async () => {
      const [row] = await this.db
        .select(CASE_COLUMNS)
        .from(designCases)
        .where(eq(designCases.id, id))
        .limit(1);

      return row === undefined
        ? undefined
        : { id: row.id as DesignCaseId, customRequestId: row.customRequestId };
    });
  }

  async findVersionInReview(caseId: DesignCaseId): Promise<DesignReviewVersion | undefined> {
    return this.run('findVersionInReview', async () => {
      const [row] = await this.db
        .select(VERSION_COLUMNS)
        .from(designVersions)
        .where(
          and(
            eq(designVersions.designCaseId, caseId),
            // Matches `uq_design_versions__case__sent_for_review`, so at most one
            // row can qualify and the `limit(1)` is a formality rather than a
            // tie-break. There is no `orderBy` here on purpose: an ordering would
            // be a way to *choose*, and the choice is one GRD-004 already made.
            eq(designVersions.status, SENT_FOR_REVIEW),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id as DesignVersionId,
        designCaseId: row.designCaseId as DesignCaseId,
        version: row.version,
        documentSchemaVersion: row.documentSchemaVersion,
        designDocument: row.designDocument,
        documentHash: row.documentHash ?? undefined,
        sentAt: row.sentAt ?? undefined,
      };
    });
  }
}
