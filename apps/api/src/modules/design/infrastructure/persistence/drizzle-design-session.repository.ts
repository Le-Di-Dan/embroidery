/**
 * Drizzle implementation of the AGG-09 Design Session contract
 * (TBL-025, TBL-026).
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, gt } from 'drizzle-orm';

import { PLACEMENT_HIERARCHY_PORT } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { PlacementHierarchyPort } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  CloneFromTemplateInput,
  DesignSession,
  DesignSessionId,
  DesignSessionRepository,
  OpenDesignSessionInput,
  SaveDocumentInput,
} from '../../domain/repositories/design-session.repository';
import { DESIGN_TEMPLATE_REPOSITORY } from '../../domain/repositories/design-template.repository';
import type { DesignTemplateRepository } from '../../domain/repositories/design-template.repository';
import { toSession } from './design-row.mapper';

const { designSessions, designSessionAssets } = schema;

@Injectable()
export class DrizzleDesignSessionRepository
  extends DrizzleRepository
  implements DesignSessionRepository
{
  constructor(
    executor: DatabaseExecutor,
    @Inject(PLACEMENT_HIERARCHY_PORT) private readonly placement: PlacementHierarchyPort,
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
  ) {
    super(executor);
  }

  async open(input: OpenDesignSessionInput): Promise<DesignSession> {
    return this.run('open', async () => {
      this.requireTransaction('open');

      // G-DB7-13, same chain guard the formal design version uses.
      await this.placement.assertValidPlacement({
        productId: input.productId,
        productVariantId: input.productVariantId,
        productSideId: input.productSideId,
        embroideryAreaId: input.embroideryAreaId,
      });

      const [row] = await this.db
        .insert(designSessions)
        .values({
          id: input.id,
          sessionSecretHash: input.sessionSecretHash,
          productId: input.productId,
          productVariantId: input.productVariantId ?? null,
          productSideId: input.productSideId,
          embroideryAreaId: input.embroideryAreaId,
          designDocument: input.designDocument,
          documentSchemaVersion: input.documentSchemaVersion,
          autosaveRevision: 0,
          status: 'ACTIVE',
          expiresAt: input.expiresAt,
          lastActivityAt: new Date(),
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignSessionRepository.open',
          'DESIGN_SESSION_NOT_CREATED',
          'Could not open the design session.',
        );
      }
      return toSession(row);
    });
  }

  async cloneFromTemplate(input: CloneFromTemplateInput): Promise<DesignSession> {
    return this.run('cloneFromTemplate', async () => {
      this.requireTransaction('cloneFromTemplate');

      await this.placement.assertValidPlacement({
        productId: input.productId,
        productVariantId: input.productVariantId,
        productSideId: input.productSideId,
        embroideryAreaId: input.embroideryAreaId,
      });

      // G-DB7-18/GRD-028: the template must be PUBLISHED at this instant.
      // The session then stamps `(templateId, templateVersion)` as
      // provenance only — a later template publish never touches it.
      const published = await this.templates.loadPublished(input.templateId);
      if (published === undefined) {
        throw guardViolationError(
          'DesignSessionRepository.cloneFromTemplate',
          'TEMPLATE_NOT_PUBLISHED',
          'That design template is not published.',
        );
      }

      const [row] = await this.db
        .insert(designSessions)
        .values({
          id: input.id,
          sessionSecretHash: input.sessionSecretHash,
          productId: input.productId,
          productVariantId: input.productVariantId ?? null,
          productSideId: input.productSideId,
          embroideryAreaId: input.embroideryAreaId,
          designDocument: published.version.designDocument,
          documentSchemaVersion: published.version.documentSchemaVersion,
          autosaveRevision: 0,
          templateId: input.templateId,
          templateVersion: published.version.version,
          status: 'ACTIVE',
          expiresAt: input.expiresAt,
          lastActivityAt: new Date(),
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignSessionRepository.cloneFromTemplate',
          'DESIGN_SESSION_NOT_CREATED',
          'Could not open the design session.',
        );
      }
      return toSession(row);
    });
  }

  async saveDocument(input: SaveDocumentInput): Promise<DesignSession> {
    return this.run('saveDocument', async () => {
      this.requireTransaction('saveDocument');

      const now = new Date();
      // G-DB7-19: ACTIVE, unexpired, and the revision predicate is the
      // optimistic marker — a stale write matches zero rows instead of
      // silently overwriting a newer save (CC-01 owns the race itself).
      const [row] = await this.db
        .update(designSessions)
        .set({
          designDocument: input.designDocument,
          documentSchemaVersion: input.documentSchemaVersion,
          autosaveRevision: input.expectedRevision + 1,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(designSessions.id, input.id),
            eq(designSessions.status, 'ACTIVE'),
            eq(designSessions.autosaveRevision, input.expectedRevision),
            gt(designSessions.expiresAt, now),
          ),
        )
        .returning();

      if (row !== undefined) {
        return toSession(row);
      }

      const [current] = await this.db
        .select({ id: designSessions.id })
        .from(designSessions)
        .where(eq(designSessions.id, input.id))
        .limit(1);

      if (current === undefined) {
        throw notFoundError('DesignSessionRepository.saveDocument', 'That session does not exist.');
      }
      throw guardViolationError(
        'DesignSessionRepository.saveDocument',
        'STALE_WRITE',
        'This session was modified since you last loaded it.',
      );
    });
  }

  async attachAsset(id: DesignSessionId, assetId: string): Promise<void> {
    return this.run('attachAsset', async () => {
      await this.db.insert(designSessionAssets).values({ id: newId(), sessionId: id, assetId });
    });
  }

  async submit(id: DesignSessionId, customRequestId: string, at: Date): Promise<DesignSession> {
    return this.run('submit', async () => {
      const [row] = await this.db
        .update(designSessions)
        .set({ status: 'SUBMITTED', submittedRequestId: customRequestId, updatedAt: at })
        .where(and(eq(designSessions.id, id), eq(designSessions.status, 'ACTIVE')))
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'DesignSessionRepository.submit',
          'SESSION_NOT_ACTIVE',
          'That session is not active.',
        );
      }
      return toSession(row);
    });
  }

  async expire(id: DesignSessionId, at: Date): Promise<void> {
    return this.run('expire', async () => {
      await this.db
        .update(designSessions)
        .set({ status: 'EXPIRED', updatedAt: at })
        .where(and(eq(designSessions.id, id), eq(designSessions.status, 'ACTIVE')));
    });
  }

  async findById(id: DesignSessionId): Promise<DesignSession | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(designSessions)
        .where(eq(designSessions.id, id))
        .limit(1);
      return row === undefined ? undefined : toSession(row);
    });
  }

  async findActiveBySecretHash(sessionSecretHash: string): Promise<DesignSession | undefined> {
    return this.run('findActiveBySecretHash', async () => {
      const [row] = await this.db
        .select()
        .from(designSessions)
        .where(
          and(
            eq(designSessions.sessionSecretHash, sessionSecretHash),
            eq(designSessions.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toSession(row);
    });
  }

  async listAssetIds(id: DesignSessionId): Promise<string[]> {
    return this.run('listAssetIds', async () => {
      const rows = await this.db
        .select({ assetId: designSessionAssets.assetId })
        .from(designSessionAssets)
        .where(eq(designSessionAssets.sessionId, id));
      return rows.map((row) => row.assetId);
    });
  }
}
