/**
 * Drizzle implementation of the AGG-21 Agreement contract (TBL-068, TBL-069).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { AgreementVersionState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';

import type {
  AddAgreementVersionInput,
  Agreement,
  AgreementId,
  AgreementRepository,
  AgreementVersion,
  AgreementVersionId,
} from '../../domain/repositories/agreement.repository';

const { agreements, agreementVersions } = schema;

type AgreementRow = typeof agreements.$inferSelect;
type VersionRow = typeof agreementVersions.$inferSelect;

function toAgreement(row: AgreementRow): Agreement {
  return {
    id: row.id as AgreementId,
    agreementType: row.agreementType,
    name: row.name,
    currentVersionId: (row.currentVersionId ?? undefined) as AgreementVersionId | undefined,
  };
}

function toVersion(row: VersionRow): AgreementVersion {
  return {
    id: row.id as AgreementVersionId,
    agreementId: row.agreementId as AgreementId,
    version: row.version,
    status: row.status as AgreementVersionState,
    content: row.content,
    contentHash: row.contentHash ?? undefined,
    language: row.language,
    effectiveFrom: row.effectiveFrom ?? undefined,
  };
}

@Injectable()
export class DrizzleAgreementRepository extends DrizzleRepository implements AgreementRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async ensureAgreement(agreementType: string, name: string): Promise<Agreement> {
    return this.run('ensureAgreement', async () => {
      const tx = this.requireTransaction('ensureAgreement');

      const [inserted] = await tx
        .insert(agreements)
        .values({ id: newId(), agreementType, name })
        .onConflictDoNothing({ target: agreements.agreementType })
        .returning();

      if (inserted !== undefined) {
        return toAgreement(inserted);
      }

      const existing = await this.loadByType(agreementType);
      if (existing === undefined) {
        throw notFoundError(
          'AgreementRepository.ensureAgreement',
          'That agreement could not be read.',
        );
      }
      return existing;
    });
  }

  async addVersion(input: AddAgreementVersionInput): Promise<AgreementVersion> {
    return this.run('addVersion', async () => {
      const tx = this.requireTransaction('addVersion');

      // Lock the agreement so the version number is derived under it. A
      // concurrent second publish would still hit
      // `uq_agreement_versions__agreement_version`; the race itself is DB8's.
      const [agreement] = await tx
        .select({ id: agreements.id })
        .from(agreements)
        .where(eq(agreements.id, input.agreementId))
        .limit(1)
        .for('update');

      if (agreement === undefined) {
        throw notFoundError('AgreementRepository.addVersion', 'That agreement does not exist.');
      }

      const [latest] = await tx
        .select({ version: agreementVersions.version })
        .from(agreementVersions)
        .where(eq(agreementVersions.agreementId, input.agreementId))
        .orderBy(desc(agreementVersions.version))
        .limit(1);

      const [row] = await tx
        .insert(agreementVersions)
        .values({
          id: input.id,
          agreementId: input.agreementId,
          version: (latest?.version ?? 0) + 1,
          status: 'DRAFT',
          content: input.content,
          language: input.language,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'AgreementRepository.addVersion',
          'AGREEMENT_VERSION_NOT_CREATED',
          'Could not create the agreement version.',
        );
      }
      return toVersion(row);
    });
  }

  async publishVersion(
    id: AgreementVersionId,
    contentHash: string,
    effectiveFrom: Date,
  ): Promise<AgreementVersion> {
    return this.run('publishVersion', async () => {
      const tx = this.requireTransaction('publishVersion');
      const now = new Date();

      const [draft] = await tx
        .select({ agreementId: agreementVersions.agreementId })
        .from(agreementVersions)
        .where(
          and(
            eq(agreementVersions.id, id),
            // Only a draft may publish: re-publishing a superseded or withdrawn
            // version would silently resurrect a retired term.
            eq(agreementVersions.status, 'DRAFT'),
          ),
        )
        .limit(1);

      if (draft === undefined) {
        throw notFoundError(
          'AgreementRepository.publishVersion',
          'That agreement version is not a draft.',
        );
      }

      // Supersede the outgoing version *first*, so the two updates never
      // overlap and no window exists in which the agreement has two published
      // versions. `ne(id)` is unnecessary here — the incoming row is still
      // DRAFT at this point and cannot match.
      await tx
        .update(agreementVersions)
        .set({ status: 'SUPERSEDED', supersededAt: now })
        .where(
          and(
            eq(agreementVersions.agreementId, draft.agreementId),
            eq(agreementVersions.status, 'PUBLISHED'),
          ),
        );

      const [published] = await tx
        .update(agreementVersions)
        .set({ status: 'PUBLISHED', contentHash, effectiveFrom, publishedAt: now })
        .where(eq(agreementVersions.id, id))
        .returning();

      if (published === undefined) {
        throw guardViolationError(
          'AgreementRepository.publishVersion',
          'AGREEMENT_VERSION_NOT_PUBLISHED',
          'Could not publish the agreement version.',
        );
      }

      await tx
        .update(agreements)
        .set({ currentVersionId: id, updatedAt: now })
        .where(eq(agreements.id, draft.agreementId));

      return toVersion(published);
    });
  }

  async setCurrentVersion(agreementId: AgreementId, versionId: AgreementVersionId): Promise<void> {
    return this.run('setCurrentVersion', async () => {
      const tx = this.requireTransaction('setCurrentVersion');

      const [version] = await tx
        .select({ owner: agreementVersions.agreementId, status: agreementVersions.status })
        .from(agreementVersions)
        .where(eq(agreementVersions.id, versionId))
        .limit(1);

      if (version === undefined) {
        throw notFoundError(
          'AgreementRepository.setCurrentVersion',
          'That agreement version does not exist.',
        );
      }
      if (version.owner !== agreementId) {
        // G-DB7-01. The FK proves the version exists; only this read proves it
        // belongs to *this* agreement, so one policy type cannot point at
        // another's text.
        throw guardViolationError(
          'AgreementRepository.setCurrentVersion',
          'VERSION_BELONGS_TO_ANOTHER_AGREEMENT',
          'That version does not belong to this agreement.',
        );
      }
      if (version.status !== 'PUBLISHED') {
        throw guardViolationError(
          'AgreementRepository.setCurrentVersion',
          'VERSION_NOT_PUBLISHED',
          'Only a published version can be made current.',
        );
      }

      await tx
        .update(agreements)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(agreements.id, agreementId));
    });
  }

  async withdrawVersion(id: AgreementVersionId, reason: string): Promise<void> {
    return this.run('withdrawVersion', async () => {
      const tx = this.requireTransaction('withdrawVersion');

      // `ck_agreement_versions__withdraw_reason_required` only enforces NOT
      // NULL, and an empty string satisfies that — so the database would accept
      // a withdrawal with no stated reason, defeating the evidence the CHECK
      // exists to capture. The blank case is the application's to reject
      // (found by the DB7-CP3 suite).
      if (reason.trim() === '') {
        throw guardViolationError(
          'AgreementRepository.withdrawVersion',
          'WITHDRAW_REASON_REQUIRED',
          'A reason is required to withdraw an agreement version.',
        );
      }

      const rows = await tx
        .update(agreementVersions)
        .set({ status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawReason: reason })
        .where(eq(agreementVersions.id, id))
        .returning({ agreementId: agreementVersions.agreementId });

      const withdrawn = rows[0];
      if (withdrawn === undefined) {
        throw notFoundError(
          'AgreementRepository.withdrawVersion',
          'That agreement version does not exist.',
        );
      }

      // A withdrawn version must not stay current: an approval resolving the
      // effective set would otherwise capture a term that was pulled.
      await tx
        .update(agreements)
        .set({ currentVersionId: null, updatedAt: new Date() })
        .where(and(eq(agreements.id, withdrawn.agreementId), eq(agreements.currentVersionId, id)));
    });
  }

  async findByType(agreementType: string): Promise<Agreement | undefined> {
    return this.run('findByType', () => this.loadByType(agreementType));
  }

  async findVersion(id: AgreementVersionId): Promise<AgreementVersion | undefined> {
    return this.run('findVersion', async () => {
      const [row] = await this.db
        .select()
        .from(agreementVersions)
        .where(eq(agreementVersions.id, id))
        .limit(1);
      return row === undefined ? undefined : toVersion(row);
    });
  }

  async currentVersion(agreementType: string): Promise<AgreementVersion | undefined> {
    return this.run('currentVersion', async () => {
      const [row] = await this.db
        .select({ version: agreementVersions })
        .from(agreements)
        .innerJoin(agreementVersions, eq(agreements.currentVersionId, agreementVersions.id))
        .where(eq(agreements.agreementType, agreementType))
        .limit(1);
      return row === undefined ? undefined : toVersion(row.version);
    });
  }

  async effectiveVersions(
    agreementTypes: readonly string[],
    at: Date,
  ): Promise<AgreementVersion[]> {
    return this.run('effectiveVersions', async () => {
      if (agreementTypes.length === 0) {
        return [];
      }

      // One query for the whole required set: an approval needs all of them,
      // and a query per type would be an N+1 on the approval path.
      const rows = await this.db
        .select({ version: agreementVersions })
        .from(agreements)
        .innerJoin(agreementVersions, eq(agreements.currentVersionId, agreementVersions.id))
        .where(
          and(
            inArray(agreements.agreementType, [...agreementTypes]),
            eq(agreementVersions.status, 'PUBLISHED'),
            isNotNull(agreementVersions.effectiveFrom),
            lte(agreementVersions.effectiveFrom, at),
          ),
        );

      return rows.map((row) => toVersion(row.version));
    });
  }

  private async loadByType(agreementType: string): Promise<Agreement | undefined> {
    const [row] = await this.db
      .select()
      .from(agreements)
      .where(eq(agreements.agreementType, agreementType))
      .limit(1);
    return row === undefined ? undefined : toAgreement(row);
  }
}
