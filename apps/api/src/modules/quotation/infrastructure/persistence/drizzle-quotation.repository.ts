/**
 * Drizzle implementation of the AGG-14 Quotation contract
 * (TBL-050..TBL-053).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm';

import type {
  AcceptQuotationInput,
  AddQuotationVersionInput,
  Quotation,
  QuotationId,
  QuotationLineItem,
  QuotationRepository,
  QuotationVersion,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { toLineItem, toQuotation, toVersion } from './quotation-row.mapper';

const { quotations, quotationVersions, quotationLineItems, quotationAcceptances } = schema;

const CURRENCY = 'VND';

@Injectable()
export class DrizzleQuotationRepository extends DrizzleRepository implements QuotationRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async createForRequest(
    id: QuotationId,
    code: string,
    customRequestId: string,
  ): Promise<Quotation> {
    return this.run('createForRequest', async () => {
      const [row] = await this.db
        .insert(quotations)
        .values({ id, code, customRequestId, status: 'DRAFT' })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'QuotationRepository.createForRequest',
          'QUOTATION_NOT_CREATED',
          'Could not create the quotation.',
        );
      }
      return toQuotation(row);
    });
  }

  async addVersion(input: AddQuotationVersionInput): Promise<QuotationVersion> {
    return this.run('addVersion', async () => {
      const tx = this.requireTransaction('addVersion');

      const [quotation] = await tx
        .select({ id: quotations.id })
        .from(quotations)
        .where(eq(quotations.id, input.quotationId))
        .limit(1)
        .for('update');

      if (quotation === undefined) {
        throw notFoundError('QuotationRepository.addVersion', 'That quotation does not exist.');
      }

      const [latest] = await tx
        .select({ version: quotationVersions.version })
        .from(quotationVersions)
        .where(eq(quotationVersions.quotationId, input.quotationId))
        .orderBy(desc(quotationVersions.version))
        .limit(1);

      const [row] = await tx
        .insert(quotationVersions)
        .values({
          id: input.id,
          quotationId: input.quotationId,
          version: (latest?.version ?? 0) + 1,
          status: 'DRAFT',
          stitchCount: input.stitchCount ?? null,
          quantityTotal: input.quantityTotal,
          subtotalAmount: input.subtotalAmount,
          manualAdjustmentAmount: input.manualAdjustmentAmount ?? '0',
          adjustmentReason: input.adjustmentReason ?? null,
          shippingFeeAmount: input.shippingFeeAmount,
          totalAmount: input.totalAmount,
          depositPercent: input.depositPercent,
          depositAmount: input.depositAmount,
          remainingAmount: input.remainingAmount,
          currencyCode: CURRENCY,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'QuotationRepository.addVersion',
          'QUOTATION_VERSION_NOT_CREATED',
          'Could not create the quotation version.',
        );
      }

      // Lines and their version are one write: a total with no lines behind it
      // is a price nobody can explain to the customer.
      if (input.lineItems.length > 0) {
        await tx.insert(quotationLineItems).values(
          input.lineItems.map((line) => ({
            id: newId(),
            quotationVersionId: input.id,
            position: line.position,
            lineKind: line.lineKind,
            description: line.description,
            skuId: line.skuId ?? null,
            quantity: line.quantity,
            unitPriceAmount: line.unitPriceAmount,
            lineTotalAmount: line.lineTotalAmount,
            currencyCode: CURRENCY,
          })),
        );
      }

      return toVersion(row);
    });
  }

  async send(id: QuotationVersionId, validUntil: Date, at: Date): Promise<QuotationVersion> {
    return this.run('send', async () => {
      const tx = this.requireTransaction('send');

      const [row] = await tx
        .update(quotationVersions)
        .set({ status: 'SENT', sentAt: at, validFrom: at, validUntil })
        .where(
          and(
            eq(quotationVersions.id, id),
            // Only a draft may be sent: re-sending an accepted or superseded
            // version would put a settled price back in play.
            eq(quotationVersions.status, 'DRAFT'),
          ),
        )
        .returning();

      if (row === undefined) {
        throw notFoundError('QuotationRepository.send', 'That quotation version is not a draft.');
      }

      // Supersede any previously sent version and promote this one, so the
      // customer only ever has one live price.
      await tx
        .update(quotationVersions)
        .set({ status: 'SUPERSEDED', supersededAt: at })
        .where(
          and(
            eq(quotationVersions.quotationId, row.quotationId),
            eq(quotationVersions.status, 'SENT'),
            eq(quotationVersions.version, row.version - 1),
          ),
        );

      await tx
        .update(quotations)
        .set({ status: 'SENT', currentVersionId: id, updatedAt: at })
        .where(eq(quotations.id, row.quotationId));

      return toVersion(row);
    });
  }

  async setCurrentVersion(quotationId: QuotationId, versionId: QuotationVersionId): Promise<void> {
    return this.run('setCurrentVersion', async () => {
      const tx = this.requireTransaction('setCurrentVersion');

      const [version] = await tx
        .select({ owner: quotationVersions.quotationId })
        .from(quotationVersions)
        .where(eq(quotationVersions.id, versionId))
        .limit(1);

      if (version === undefined) {
        throw notFoundError(
          'QuotationRepository.setCurrentVersion',
          'That quotation version does not exist.',
        );
      }
      if (version.owner !== quotationId) {
        // G-DB7-03. The FK proves the version exists; only this read proves it
        // belongs here, so one request's quotation cannot present another's price.
        throw guardViolationError(
          'QuotationRepository.setCurrentVersion',
          'VERSION_BELONGS_TO_ANOTHER_QUOTATION',
          'That version does not belong to this quotation.',
        );
      }

      await tx
        .update(quotations)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(quotations.id, quotationId));
    });
  }

  async accept(input: AcceptQuotationInput): Promise<QuotationVersion> {
    return this.run('accept', async () => {
      const tx = this.requireTransaction('accept');

      // G-DB7-20 / GRD-006. All three conditions are re-read here, inside the
      // accepting transaction: the customer may be looking at a page rendered
      // before a newer version superseded this one, or before it expired.
      const [version] = await tx
        .select({ version: quotationVersions, currentVersionId: quotations.currentVersionId })
        .from(quotationVersions)
        .innerJoin(quotations, eq(quotationVersions.quotationId, quotations.id))
        .where(
          and(
            eq(quotationVersions.id, input.versionId),
            eq(quotationVersions.status, 'SENT'),
            // Unexpired: `valid_until` null means no expiry was set.
            or(
              isNull(quotationVersions.validUntil),
              gt(quotationVersions.validUntil, input.acceptedAt),
            ),
          ),
        )
        .limit(1)
        .for('update', { of: quotationVersions });

      if (version === undefined) {
        throw guardViolationError(
          'QuotationRepository.accept',
          'QUOTE_VERSION_STALE',
          'That quotation is no longer available for acceptance.',
        );
      }
      if (version.currentVersionId !== input.versionId) {
        // Sent and unexpired, but no longer the current version: a newer one
        // was issued while the customer was deciding.
        throw guardViolationError(
          'QuotationRepository.accept',
          'QUOTE_VERSION_STALE',
          'That quotation is no longer available for acceptance.',
        );
      }

      const [accepted] = await tx
        .update(quotationVersions)
        .set({ status: 'ACCEPTED', acceptedAt: input.acceptedAt })
        .where(eq(quotationVersions.id, input.versionId))
        .returning();

      if (accepted === undefined) {
        throw notFoundError('QuotationRepository.accept', 'That quotation version does not exist.');
      }

      // The acceptance evidence carries the amount the customer actually saw,
      // so a later repricing cannot rewrite what they agreed to.
      await tx.insert(quotationAcceptances).values({
        quotationVersionId: input.versionId,
        customerId: input.customerId,
        grantId: input.grantId,
        stepUpChallengeId: input.stepUpChallengeId,
        acceptedTotalAmount: accepted.totalAmount,
        currencyCode: accepted.currencyCode,
        acceptedAt: input.acceptedAt,
      });

      await tx
        .update(quotations)
        .set({ status: 'ACCEPTED', updatedAt: input.acceptedAt })
        .where(eq(quotations.id, accepted.quotationId));

      return toVersion(accepted);
    });
  }

  async expire(id: QuotationVersionId, at: Date): Promise<void> {
    return this.run('expire', async () => {
      await this.db
        .update(quotationVersions)
        .set({ status: 'EXPIRED', expiredAt: at })
        .where(and(eq(quotationVersions.id, id), eq(quotationVersions.status, 'SENT')));
    });
  }

  async findByRequest(customRequestId: string): Promise<Quotation | undefined> {
    return this.run('findByRequest', async () => {
      const [row] = await this.db
        .select()
        .from(quotations)
        .where(eq(quotations.customRequestId, customRequestId))
        .limit(1);
      return row === undefined ? undefined : toQuotation(row);
    });
  }

  async findById(id: QuotationId): Promise<Quotation | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
      return row === undefined ? undefined : toQuotation(row);
    });
  }

  async loadVersion(id: QuotationVersionId): Promise<QuotationVersion | undefined> {
    return this.run('loadVersion', async () => {
      const [row] = await this.db
        .select()
        .from(quotationVersions)
        .where(eq(quotationVersions.id, id))
        .limit(1);
      return row === undefined ? undefined : toVersion(row);
    });
  }

  async loadLineItems(id: QuotationVersionId): Promise<QuotationLineItem[]> {
    return this.run('loadLineItems', async () => {
      const rows = await this.db
        .select()
        .from(quotationLineItems)
        .where(eq(quotationLineItems.quotationVersionId, id))
        .orderBy(asc(quotationLineItems.position));
      return rows.map(toLineItem);
    });
  }

  async listVersions(quotationId: QuotationId): Promise<QuotationVersion[]> {
    return this.run('listVersions', async () => {
      const rows = await this.db
        .select()
        .from(quotationVersions)
        .where(eq(quotationVersions.quotationId, quotationId))
        .orderBy(asc(quotationVersions.version));
      return rows.map(toVersion);
    });
  }

  async acceptedVersionForRequest(customRequestId: string): Promise<QuotationVersion | undefined> {
    return this.run('acceptedVersionForRequest', async () => {
      const [row] = await this.db
        .select({ version: quotationVersions })
        .from(quotations)
        .innerJoin(quotationVersions, eq(quotationVersions.quotationId, quotations.id))
        .where(
          and(
            eq(quotations.customRequestId, customRequestId),
            eq(quotationVersions.status, 'ACCEPTED'),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toVersion(row.version);
    });
  }
}
