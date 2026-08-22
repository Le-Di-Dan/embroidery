/**
 * **G-DB7-05 / G-DB7-21 (GRD-009)** — the order-creation chain resolves to
 * exactly one request, and the price was actually accepted.
 *
 * An order freezes a quotation version and an approval snapshot. Each has its
 * own foreign key, and nothing in the schema ties them to each other or to the
 * request being ordered. Without this check an order could pair customer A's
 * accepted price with customer B's approved artwork, and **every constraint in
 * the database would be satisfied** (`DB6_DB7_DB10_HANDOFF.md` §1, INV-19).
 *
 * One query walks version → quotation → request: three separate reads would be
 * three chances to see different states, and this must be a single consistent
 * view. The customer, total and currency come back **from** the verified chain
 * so the caller cannot write values this did not check.
 *
 * ### Why it is restated rather than imported
 *
 * The delivered `OrderChainGuard` lives in `apps/api`, and importing it here
 * would be the app-to-app dependency the worker's whole persistence layer exists
 * to avoid — the reason the delivered `APP4-W01` port records for its own
 * restatement. The refusal codes are kept identical so the two never diverge in
 * meaning, and `APP7-W01` §4 is explicit that this is not optional: the event
 * arriving from APP6 is not evidence that the chain resolves.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import { conversionRefusal } from '../../domain/order-conversion.errors';

/** Exactly the facts the order writes, all read from the verified chain. */
export interface VerifiedOrderChain {
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
}

interface QuotationChainRow extends Record<string, unknown> {
  readonly request_id: string;
  readonly status: string;
  readonly total_amount: string;
  readonly currency_code: string;
}

interface ApprovalChainRow extends Record<string, unknown> {
  readonly request_id: string;
  readonly customer_id: string;
}

@Injectable()
export class WorkerOrderChainGuard extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /** Verifies and returns the chain, or refuses. */
  async assertOrderChain(
    customRequestId: string,
    quotationVersionId: string,
    approvalSnapshotId: string,
  ): Promise<VerifiedOrderChain> {
    return this.run('assertOrderChain', async () => {
      const quotationRows = await executeRaw<QuotationChainRow>(
        this.db,
        sql`
          SELECT q.custom_request_id AS request_id, qv.status, qv.total_amount, qv.currency_code
          FROM quotation_versions qv
          JOIN quotations q ON q.id = qv.quotation_id
          WHERE qv.id = ${quotationVersionId}
        `,
      );
      const quotation = quotationRows[0];
      if (quotation === undefined) {
        throw conversionRefusal('QUOTE_NOT_ACCEPTED', 'That quotation version does not exist.');
      }
      if (quotation.request_id !== customRequestId) {
        throw conversionRefusal(
          'QUOTATION_BELONGS_TO_ANOTHER_REQUEST',
          'That quotation was not raised for this request.',
        );
      }
      // GRD-009: an order may only be created from an *accepted* price.
      if (quotation.status !== 'ACCEPTED') {
        throw conversionRefusal(
          'QUOTE_NOT_ACCEPTED',
          'That quotation version has not been accepted.',
        );
      }

      const approvalRows = await executeRaw<ApprovalChainRow>(
        this.db,
        sql`
          SELECT custom_request_id AS request_id, customer_id
          FROM approval_snapshots
          WHERE id = ${approvalSnapshotId}
        `,
      );
      const approval = approvalRows[0];
      if (approval === undefined) {
        throw conversionRefusal('APPROVAL_NOT_FOUND', 'That approval does not exist.');
      }
      if (approval.request_id !== customRequestId) {
        // The case this guard exists for: a valid approval, a valid accepted
        // quotation, and they belong to different customers' requests.
        throw conversionRefusal(
          'APPROVAL_BELONGS_TO_ANOTHER_REQUEST',
          'That approval does not belong to this request.',
        );
      }

      return {
        customerId: approval.customer_id,
        totalAmount: quotation.total_amount,
        currencyCode: quotation.currency_code,
      };
    });
  }
}
