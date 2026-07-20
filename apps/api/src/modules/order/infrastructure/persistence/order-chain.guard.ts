/**
 * **G-DB7-05** — the order creation chain resolves to exactly one request.
 *
 * An order freezes a quotation version and an approval snapshot. Each has its
 * own foreign key, and nothing in the schema ties them to each other or to the
 * request being ordered. Without this check an order could pair customer A's
 * accepted price with customer B's approved artwork, and every constraint in
 * the database would be satisfied (`DB6_DB7_DB10_HANDOFF.md` §1, INV-19).
 *
 * One query walks the whole chain: three separate reads would be three chances
 * to see different states, and this must be a single consistent view.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

const { quotationVersions, quotations, approvalSnapshots } = schema;

export interface OrderChain {
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
}

@Injectable()
export class OrderChainGuard extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Verifies and returns the chain, or throws.
   *
   * Returns the facts the order needs (customer, total) so the caller does not
   * re-read what this already had to load — and so those values provably come
   * from the verified chain rather than from the caller.
   */
  async assertOrderChain(
    customRequestId: string,
    quotationVersionId: string,
    approvalSnapshotId: string,
  ): Promise<OrderChain> {
    return this.run('assertOrderChain', async () => {
      const [quotationRow] = await this.db
        .select({
          requestId: quotations.customRequestId,
          status: quotationVersions.status,
          totalAmount: quotationVersions.totalAmount,
          currencyCode: quotationVersions.currencyCode,
        })
        .from(quotationVersions)
        .innerJoin(quotations, eq(quotationVersions.quotationId, quotations.id))
        .where(eq(quotationVersions.id, quotationVersionId))
        .limit(1);

      if (quotationRow === undefined) {
        throw chainError('QUOTATION_VERSION_NOT_FOUND', 'That quotation version does not exist.');
      }
      if (quotationRow.requestId !== customRequestId) {
        throw chainError(
          'QUOTATION_BELONGS_TO_ANOTHER_REQUEST',
          'That quotation was not raised for this request.',
        );
      }
      // GRD-009: an order may only be created from an *accepted* price.
      if (quotationRow.status !== 'ACCEPTED') {
        throw chainError('QUOTE_NOT_ACCEPTED', 'That quotation version has not been accepted.');
      }

      const [approvalRow] = await this.db
        .select({
          requestId: approvalSnapshots.customRequestId,
          customerId: approvalSnapshots.customerId,
        })
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.id, approvalSnapshotId))
        .limit(1);

      if (approvalRow === undefined) {
        throw chainError('APPROVAL_NOT_FOUND', 'That approval does not exist.');
      }
      if (approvalRow.requestId !== customRequestId) {
        // The case this guard exists for: a valid approval, a valid accepted
        // quotation, and they belong to different customers' requests.
        throw chainError(
          'APPROVAL_BELONGS_TO_ANOTHER_REQUEST',
          'That approval does not belong to this request.',
        );
      }

      return {
        customerId: approvalRow.customerId,
        totalAmount: quotationRow.totalAmount,
        currencyCode: quotationRow.currencyCode,
      };
    });
  }
}

function chainError(code: string, message: string) {
  return guardViolationError('OrderChainGuard.assertOrderChain', code, message);
}
