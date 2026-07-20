/**
 * Drizzle implementation of the AGG-10 Design Case contract
 * (TBL-027..TBL-030).
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, desc, eq } from 'drizzle-orm';

import { PLACEMENT_HIERARCHY_PORT } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { PlacementHierarchyPort } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  CreateDesignVersionInput,
  DesignCase,
  DesignCaseId,
  DesignCaseRepository,
  DesignVersion,
  DesignVersionId,
  RecordReviewInput,
} from '../../domain/repositories/design-case.repository';
import { toCase, toVersion } from './design-row.mapper';

const { designCases, designVersions, designReviews, customRequests } = schema;

@Injectable()
export class DrizzleDesignCaseRepository extends DrizzleRepository implements DesignCaseRepository {
  constructor(
    executor: DatabaseExecutor,
    @Inject(PLACEMENT_HIERARCHY_PORT) private readonly placement: PlacementHierarchyPort,
  ) {
    super(executor);
  }

  async createForRequest(id: DesignCaseId, customRequestId: string): Promise<DesignCase> {
    return this.run('createForRequest', async () => {
      const tx = this.requireTransaction('createForRequest');

      const [row] = await tx.insert(designCases).values({ id, customRequestId }).returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignCaseRepository.createForRequest',
          'DESIGN_CASE_NOT_CREATED',
          'Could not create the design case.',
        );
      }

      // G-DB7-09: both directions are written in one transaction, so the
      // request's pointer and the case's `custom_request_id` can never
      // disagree about which case belongs to which request.
      await tx
        .update(customRequests)
        .set({ currentDesignCaseId: id, updatedAt: new Date() })
        .where(eq(customRequests.id, customRequestId));

      return toCase(row);
    });
  }

  async createVersion(input: CreateDesignVersionInput): Promise<DesignVersion> {
    return this.run('createVersion', async () => {
      const tx = this.requireTransaction('createVersion');

      // G-DB7-13: the four placement columns each have their own FK, and
      // nothing in the schema proves they form one chain. Validated before the
      // insert, inside this transaction.
      await this.placement.assertValidPlacement({
        productId: input.placement.productId,
        productVariantId: input.placement.productVariantId,
        productSideId: input.placement.productSideId,
        embroideryAreaId: input.placement.embroideryAreaId,
      });

      // Lock the case, then derive the next version number under it. A
      // concurrent second create would still hit
      // `uq_design_versions__case_version`; the race itself is DB8's.
      const [designCase] = await tx
        .select({ id: designCases.id })
        .from(designCases)
        .where(eq(designCases.id, input.designCaseId))
        .limit(1)
        .for('update');

      if (designCase === undefined) {
        throw notFoundError(
          'DesignCaseRepository.createVersion',
          'That design case does not exist.',
        );
      }

      const [latest] = await tx
        .select({ version: designVersions.version })
        .from(designVersions)
        .where(eq(designVersions.designCaseId, input.designCaseId))
        .orderBy(desc(designVersions.version))
        .limit(1);

      const nextVersion = (latest?.version ?? 0) + 1;

      const [row] = await tx
        .insert(designVersions)
        .values({
          id: input.id,
          designCaseId: input.designCaseId,
          version: nextVersion,
          parentVersionId: input.parentVersionId ?? null,
          status: 'DRAFT',
          designDocument: input.designDocument,
          documentSchemaVersion: input.documentSchemaVersion,
          productId: input.placement.productId,
          productVariantId: input.placement.productVariantId,
          productSideId: input.placement.productSideId,
          embroideryAreaId: input.placement.embroideryAreaId,
          physicalWidthMm: input.placement.physicalWidthMm,
          physicalHeightMm: input.placement.physicalHeightMm,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignCaseRepository.createVersion',
          'DESIGN_VERSION_NOT_CREATED',
          'Could not create the design version.',
        );
      }
      return toVersion(row);
    });
  }

  async sendForReview(id: DesignVersionId, documentHash: string, at: Date): Promise<DesignVersion> {
    return this.run('sendForReview', async () => {
      const [row] = await this.db
        .update(designVersions)
        .set({ status: 'SENT_FOR_REVIEW', documentHash, sentAt: at })
        .where(
          and(
            eq(designVersions.id, id),
            // Only a draft may be sent. Re-sending an approved or superseded
            // version would put a settled decision back in play.
            eq(designVersions.status, 'DRAFT'),
          ),
        )
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'DesignCaseRepository.sendForReview',
          'That design version is not a draft.',
        );
      }
      return toVersion(row);
    });
  }

  async setCurrentVersion(caseId: DesignCaseId, versionId: DesignVersionId): Promise<void> {
    return this.run('setCurrentVersion', async () => {
      const tx = this.requireTransaction('setCurrentVersion');

      const [version] = await tx
        .select({ owner: designVersions.designCaseId })
        .from(designVersions)
        .where(eq(designVersions.id, versionId))
        .limit(1);

      if (version === undefined) {
        throw notFoundError(
          'DesignCaseRepository.setCurrentVersion',
          'That design version does not exist.',
        );
      }
      if (version.owner !== caseId) {
        // G-DB7-02. The FK proves the version exists; only this read proves it
        // belongs to this case, so one customer's case cannot point at
        // another's artwork.
        throw guardViolationError(
          'DesignCaseRepository.setCurrentVersion',
          'VERSION_BELONGS_TO_ANOTHER_CASE',
          'That version does not belong to this design case.',
        );
      }

      await tx
        .update(designCases)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(designCases.id, caseId));
    });
  }

  async recordReview(input: RecordReviewInput): Promise<DesignVersion> {
    return this.run('recordReview', async () => {
      const tx = this.requireTransaction('recordReview');

      // First decision wins. Guarding the status transition on
      // SENT_FOR_REVIEW is what makes that true: without it a customer could
      // approve a version after having requested a revision on it.
      const [row] = await tx
        .update(designVersions)
        .set({
          status: input.outcome === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED',
          approvedAt: input.outcome === 'APPROVE' ? input.decidedAt : null,
        })
        .where(
          and(
            eq(designVersions.id, input.designVersionId),
            eq(designVersions.status, 'SENT_FOR_REVIEW'),
          ),
        )
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignCaseRepository.recordReview',
          'DESIGN_VERSION_NOT_IN_REVIEW',
          'That design version is not awaiting a decision.',
        );
      }

      await tx.insert(designReviews).values({
        designVersionId: input.designVersionId,
        outcome: input.outcome,
        feedback: input.feedback ?? null,
        customerId: input.customerId,
        grantId: input.grantId,
        stepUpChallengeId: input.stepUpChallengeId ?? null,
        decidedAt: input.decidedAt,
      });

      return toVersion(row);
    });
  }

  async supersede(id: DesignVersionId, at: Date): Promise<void> {
    return this.run('supersede', async () => {
      await this.db
        .update(designVersions)
        .set({ status: 'SUPERSEDED', supersededAt: at })
        .where(eq(designVersions.id, id));
    });
  }

  async findByRequest(customRequestId: string): Promise<DesignCase | undefined> {
    return this.run('findByRequest', async () => {
      const [row] = await this.db
        .select()
        .from(designCases)
        .where(eq(designCases.customRequestId, customRequestId))
        .limit(1);
      return row === undefined ? undefined : toCase(row);
    });
  }

  async findById(id: DesignCaseId): Promise<DesignCase | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(designCases).where(eq(designCases.id, id)).limit(1);
      return row === undefined ? undefined : toCase(row);
    });
  }

  async loadVersion(id: DesignVersionId): Promise<DesignVersion | undefined> {
    return this.run('loadVersion', async () => {
      const [row] = await this.db
        .select()
        .from(designVersions)
        .where(eq(designVersions.id, id))
        .limit(1);
      return row === undefined ? undefined : toVersion(row);
    });
  }

  async listVersions(caseId: DesignCaseId): Promise<DesignVersion[]> {
    return this.run('listVersions', async () => {
      const rows = await this.db
        .select()
        .from(designVersions)
        .where(eq(designVersions.designCaseId, caseId))
        .orderBy(asc(designVersions.version));
      return rows.map(toVersion);
    });
  }

  async findVersionInReview(caseId: DesignCaseId): Promise<DesignVersion | undefined> {
    return this.run('findVersionInReview', async () => {
      const [row] = await this.db
        .select()
        .from(designVersions)
        .where(
          and(
            eq(designVersions.designCaseId, caseId),
            // Matches `uq_design_versions__case__sent_for_review`, so at most
            // one row can qualify.
            eq(designVersions.status, 'SENT_FOR_REVIEW'),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toVersion(row);
    });
  }
}
