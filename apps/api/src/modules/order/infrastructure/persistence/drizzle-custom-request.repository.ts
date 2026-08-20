/**
 * Drizzle implementation of the AGG-13 Custom Request contract
 * (TBL-037..TBL-042).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { CustomRequestState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq, inArray, sum } from 'drizzle-orm';

import { isLegalRequestTransition } from '../../domain/lifecycle/request-transitions';
import type {
  AppendedModerationNote,
  CustomRequest,
  CustomRequestId,
  CustomRequestRepository,
  CustomerOwnedProduct,
  QuantityBreakdownLine,
  RequestActor,
  RequestTransition,
  SubmitRequestInput,
  TransitionRequestInput,
} from '../../domain/repositories/custom-request.repository';
import type { ProductVariantId } from '../../../catalog/domain/repositories/placement-hierarchy.port';

const {
  customRequests,
  customRequestQuantityBreakdowns,
  customerOwnedProducts,
  customRequestAssets,
  requestModerationNotes,
  customRequestTransitions,
  quotations,
} = schema;

type RequestRow = typeof customRequests.$inferSelect;

function toRequest(row: RequestRow): CustomRequest {
  return {
    id: row.id as CustomRequestId,
    code: row.code,
    customerId: row.customerId,
    status: row.status as CustomRequestState,
    currentDesignCaseId: row.currentDesignCaseId ?? undefined,
    currentQuotationId: row.currentQuotationId ?? undefined,
  };
}

/** Spreads the actor into the columns its kind requires (schema actor CHECK). */
function actorColumns(actor: RequestActor) {
  switch (actor.kind) {
    case 'ADMIN':
      return { actorKind: 'ADMIN', adminId: actor.adminId };
    case 'CUSTOMER':
      return { actorKind: 'CUSTOMER', customerId: actor.customerId, grantId: actor.grantId };
    case 'SYSTEM':
      return { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
  }
}

@Injectable()
export class DrizzleCustomRequestRepository
  extends DrizzleRepository
  implements CustomRequestRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async submit(input: SubmitRequestInput): Promise<CustomRequest> {
    return this.run('submit', async () => {
      const tx = this.requireTransaction('submit');

      const [row] = await tx
        .insert(customRequests)
        .values({
          id: input.id,
          code: input.code,
          customerId: input.customerId,
          status: 'NEW',
          productId: input.productId ?? null,
          productVariantId: input.productVariantId ?? null,
          customerNote: input.customerNote ?? null,
          // `G01-D09` — documented provenance with no FK; the caller passes the
          // session it just submitted, never a client-supplied value.
          submittedSessionId: input.submittedSessionId ?? null,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'CustomRequestRepository.submit',
          'REQUEST_NOT_CREATED',
          'Could not submit the request.',
        );
      }

      if (input.breakdown.length > 0) {
        await tx.insert(customRequestQuantityBreakdowns).values(
          input.breakdown.map((line) => ({
            id: newId(),
            customRequestId: input.id,
            productVariantId: line.productVariantId ?? null,
            sizeLabel: line.sizeLabel ?? null,
            quantity: line.quantity,
          })),
        );
      }

      if (input.customerOwnedProduct !== undefined) {
        // INV-13: a COP is never a SKU. It lives in its own table precisely so
        // it cannot be mistaken for catalog stock.
        await tx.insert(customerOwnedProducts).values({
          id: newId(),
          customRequestId: input.id,
          name: input.customerOwnedProduct.name,
          description: input.customerOwnedProduct.description ?? null,
          physicalWidthMm: input.customerOwnedProduct.physicalWidthMm ?? null,
          physicalHeightMm: input.customerOwnedProduct.physicalHeightMm ?? null,
        });
      }

      return toRequest(row);
    });
  }

  async replaceBreakdown(
    id: CustomRequestId,
    breakdown: readonly QuantityBreakdownLine[],
  ): Promise<void> {
    return this.run('replaceBreakdown', async () => {
      const tx = this.requireTransaction('replaceBreakdown');

      const [current] = await tx
        .select({ status: customRequests.status })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1)
        .for('update');

      if (current === undefined) {
        throw notFoundError(
          'CustomRequestRepository.replaceBreakdown',
          'That request does not exist.',
        );
      }

      // Mutable until quoted (CON-074): once a quotation has priced these
      // quantities, changing them would silently invalidate the price.
      const quotableStates: CustomRequestState[] = ['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'];
      if (!quotableStates.includes(current.status as CustomRequestState)) {
        throw guardViolationError(
          'CustomRequestRepository.replaceBreakdown',
          'BREAKDOWN_FROZEN',
          'The quantities can no longer be changed for this request.',
        );
      }

      await tx
        .delete(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id));

      if (breakdown.length > 0) {
        await tx.insert(customRequestQuantityBreakdowns).values(
          breakdown.map((line) => ({
            id: newId(),
            customRequestId: id,
            productVariantId: line.productVariantId ?? null,
            sizeLabel: line.sizeLabel ?? null,
            quantity: line.quantity,
          })),
        );
      }
    });
  }

  async attachAsset(id: CustomRequestId, assetId: string, role: string): Promise<void> {
    return this.run('attachAsset', async () => {
      await this.db.insert(customRequestAssets).values({
        id: newId(),
        customRequestId: id,
        assetId,
        role,
      });
    });
  }

  async appendModerationNote(
    id: CustomRequestId,
    kind: string,
    note: string,
    adminId: string,
  ): Promise<AppendedModerationNote> {
    return this.run('appendModerationNote', async () => {
      // `id` and `created_at` are generated by the database — the insert names
      // neither — so the returned row is the only truthful source for the
      // sequence and the timestamp a caller reports back.
      const [row] = await this.db
        .insert(requestModerationNotes)
        .values({
          customRequestId: id,
          kind,
          note,
          adminId,
        })
        .returning({ id: requestModerationNotes.id, createdAt: requestModerationNotes.createdAt });

      if (row === undefined) {
        throw guardViolationError(
          'CustomRequestRepository.appendModerationNote',
          'MODERATION_NOTE_NOT_APPENDED',
          'Could not record the moderation note.',
        );
      }
      return { sequence: Number(row.id), createdAt: row.createdAt };
    });
  }

  async transition(input: TransitionRequestInput): Promise<CustomRequest> {
    return this.run('transition', async () => {
      const tx = this.requireTransaction('transition');

      // Lock the row so the legality check and the write see the same state.
      const [current] = await tx
        .select()
        .from(customRequests)
        .where(eq(customRequests.id, input.id))
        .limit(1)
        .for('update');

      if (current === undefined) {
        throw notFoundError('CustomRequestRepository.transition', 'That request does not exist.');
      }

      const from = current.status as CustomRequestState;

      // The caller judged its command against a state it read before this lock
      // was granted. If the row has moved since, that judgement is void — the
      // required reasons and the note kind were decided for a different state —
      // so the move is refused rather than re-applied from wherever the request
      // ended up. Checked before the legality guard so a losing racer is told it
      // lost, not that its move was illegal.
      if (input.expectedFrom !== undefined && input.expectedFrom !== from) {
        throw guardViolationError(
          'CustomRequestRepository.transition',
          'STALE_TRANSITION',
          'This request changed state before the change could be applied.',
        );
      }

      // G-DB7-25 / GRD-019. The CHECK constrains the value of `status`, not the
      // move — without this, a delivered request could slide back to NEW.
      if (!isLegalRequestTransition(from, input.to)) {
        throw guardViolationError(
          'CustomRequestRepository.transition',
          'INVALID_TRANSITION',
          'That status change is not allowed for this request.',
        );
      }

      const [row] = await tx
        .update(customRequests)
        .set({
          status: input.to,
          // COL-TBL037-08/09 are the cancellation's own columns and are written
          // only by a cancellation. Set on no other move, so a rejection's text
          // can never end up in the field that explains a cancellation.
          ...(input.to === 'CANCELLED'
            ? {
                cancelledReason: input.reason ?? null,
                cancelledCustomerReason: input.customerVisibleReason ?? null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(customRequests.id, input.id))
        .returning();

      // The evidence and the move are one write: a state change with no
      // transition row would be a state nobody can explain.
      await tx.insert(customRequestTransitions).values({
        customRequestId: input.id,
        fromStatus: from,
        toStatus: input.to,
        ...actorColumns(input.actor),
        reason: input.reason ?? null,
        customerVisibleReason: input.customerVisibleReason ?? null,
        correlationId: input.correlationId,
      });

      if (row === undefined) {
        throw notFoundError('CustomRequestRepository.transition', 'That request does not exist.');
      }
      return toRequest(row);
    });
  }

  async setCurrentQuotation(id: CustomRequestId, quotationId: string): Promise<void> {
    return this.run('setCurrentQuotation', async () => {
      const tx = this.requireTransaction('setCurrentQuotation');

      const [quotation] = await tx
        .select({ owner: quotations.customRequestId })
        .from(quotations)
        .where(eq(quotations.id, quotationId))
        .limit(1);

      if (quotation === undefined) {
        throw notFoundError(
          'CustomRequestRepository.setCurrentQuotation',
          'That quotation does not exist.',
        );
      }
      if (quotation.owner !== id) {
        // G-DB7-04. The FK proves the quotation exists; only this read proves
        // it was raised for *this* request, so one customer's request cannot
        // point at another's price.
        throw guardViolationError(
          'CustomRequestRepository.setCurrentQuotation',
          'QUOTATION_BELONGS_TO_ANOTHER_REQUEST',
          'That quotation does not belong to this request.',
        );
      }

      await tx
        .update(customRequests)
        .set({ currentQuotationId: quotationId, updatedAt: new Date() })
        .where(eq(customRequests.id, id));
    });
  }

  async findBoundAssetIds(assetIds: readonly string[]): Promise<string[]> {
    return this.run('findBoundAssetIds', async () => {
      if (assetIds.length === 0) {
        // `inArray` with an empty list is a degenerate predicate; answering
        // without a round trip is also the honest answer.
        return [];
      }
      const rows = await this.db
        .selectDistinct({ assetId: customRequestAssets.assetId })
        .from(customRequestAssets)
        .where(inArray(customRequestAssets.assetId, [...assetIds]));

      return rows.map((row) => row.assetId);
    });
  }

  async findById(id: CustomRequestId): Promise<CustomRequest | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1);
      return row === undefined ? undefined : toRequest(row);
    });
  }

  async lockById(id: CustomRequestId): Promise<CustomRequest | undefined> {
    return this.run('lockById', async () => {
      const tx = this.requireTransaction('lockById');

      const [row] = await tx
        .select()
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1)
        // The same `FOR UPDATE` the three writing methods above take, taken by
        // itself so a caller whose decision depends on this state can hold the
        // row for the rest of its transaction.
        .for('update');
      return row === undefined ? undefined : toRequest(row);
    });
  }

  async findByCode(code: string): Promise<CustomRequest | undefined> {
    return this.run('findByCode', async () => {
      const [row] = await this.db
        .select()
        .from(customRequests)
        .where(eq(customRequests.code, code))
        .limit(1);
      return row === undefined ? undefined : toRequest(row);
    });
  }

  async loadBreakdown(id: CustomRequestId): Promise<QuantityBreakdownLine[]> {
    return this.run('loadBreakdown', async () => {
      const rows = await this.db
        .select()
        .from(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id));

      return rows.map((row) => ({
        productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
        sizeLabel: row.sizeLabel ?? undefined,
        quantity: row.quantity,
      }));
    });
  }

  async loadCustomerOwnedProduct(id: CustomRequestId): Promise<CustomerOwnedProduct | undefined> {
    return this.run('loadCustomerOwnedProduct', async () => {
      const [row] = await this.db
        .select()
        .from(customerOwnedProducts)
        .where(eq(customerOwnedProducts.customRequestId, id))
        .limit(1);

      return row === undefined
        ? undefined
        : {
            name: row.name,
            description: row.description ?? undefined,
            physicalWidthMm: row.physicalWidthMm ?? undefined,
            physicalHeightMm: row.physicalHeightMm ?? undefined,
          };
    });
  }

  async listTransitions(id: CustomRequestId): Promise<RequestTransition[]> {
    return this.run('listTransitions', async () => {
      const rows = await this.db
        .select()
        .from(customRequestTransitions)
        .where(eq(customRequestTransitions.customRequestId, id))
        .orderBy(asc(customRequestTransitions.id));

      return rows.map((row) => ({
        fromStatus: row.fromStatus as CustomRequestState,
        toStatus: row.toStatus as CustomRequestState,
        actorKind: row.actorKind,
        reason: row.reason ?? undefined,
        correlationId: row.correlationId,
      }));
    });
  }

  async totalQuantity(id: CustomRequestId): Promise<number> {
    return this.run('totalQuantity', async () => {
      const [row] = await this.db
        .select({ total: sum(customRequestQuantityBreakdowns.quantity) })
        .from(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id));

      // `sum` returns a string (numeric) or null for an empty set.
      return row?.total === null || row?.total === undefined ? 0 : Number(row.total);
    });
  }
}
