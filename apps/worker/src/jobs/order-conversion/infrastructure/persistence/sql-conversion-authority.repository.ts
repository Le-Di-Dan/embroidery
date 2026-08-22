/**
 * The conversion's frozen-authority reads (`APP7-W01`, corrected by
 * `APP7-W01-C1`).
 *
 * Raw SQL through the database package's sanctioned boundary, exactly as the
 * three delivered worker capabilities do: this application depends on
 * `@embroidery/database` and `@embroidery/persistence`, never on Drizzle, never
 * on the driver and never on `apps/api`.
 *
 * ### What `APP7-W01-C1` removed from this file
 *
 * It previously owned a copy of the Order chain guard, the `orders` and
 * `order_items` inserts, the `payment_obligations` pair and the canonical
 * `order.created` append. All four are canonical DB7 authority, and having a
 * second implementation of them was the defect the correction fixes: two
 * versions of GRD-009 are one refactor away from disagreeing about which
 * customer's approval may be paired with which customer's price, and every
 * foreign key would still be satisfied (INV-19).
 *
 * Those writes now go through `OrderRepository.createFromAcceptedQuotation` and
 * `PaymentObligationRepository.createForOrder`, resolved from
 * `@embroidery/persistence` — the same classes the API resolves.
 *
 * ### What is left, and why it is allowed to be here
 *
 * Reads, and only the ones `APP7-W01` §6 names: no canonical repository answers
 * "what did this approval freeze", "which version was accepted and how was it
 * priced", "which SKU of this variant is currently orderable", or "what is this
 * customer-owned product called". They are conversion inputs, not aggregate
 * state, and nothing here writes a row of any kind.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import type {
  AcceptedQuotationLine,
  AcceptedQuotationVersion,
  ConversionAuthorityRepository,
  FrozenApprovalSnapshot,
} from '../../domain/repositories/conversion-authority.repository';

interface SnapshotRow extends Record<string, unknown> {
  readonly id: string;
  readonly custom_request_id: string;
  readonly product_variant_id: string | null;
  readonly customer_owned_product_id: string | null;
  readonly product_name: string;
  readonly variant_label: string | null;
  readonly quantity_total: number | string;
}

interface VersionRow extends Record<string, unknown> {
  readonly id: string;
  readonly custom_request_id: string;
  readonly total_amount: string;
  readonly deposit_amount: string;
  readonly remaining_amount: string;
  readonly currency_code: string;
  readonly accepted_at: Date | null;
}

interface LineRow extends Record<string, unknown> {
  readonly quotation_version_id: string;
  readonly position: number | string;
  readonly quantity: number | string;
  readonly unit_price_amount: string;
  readonly line_total_amount: string;
}

@Injectable()
export class SqlConversionAuthorityRepository
  extends DrizzleRepository
  implements ConversionAuthorityRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findApprovalSnapshot(
    approvalSnapshotId: string,
  ): Promise<FrozenApprovalSnapshot | undefined> {
    return this.run('findApprovalSnapshot', async () => {
      const rows = await executeRaw<SnapshotRow>(
        this.db,
        sql`
          SELECT id, custom_request_id, product_variant_id,
                 customer_owned_product_id, product_name, variant_label, quantity_total
          FROM approval_snapshots
          WHERE id = ${approvalSnapshotId}
        `,
      );
      const row = rows[0];
      return row === undefined
        ? undefined
        : {
            id: row.id,
            customRequestId: row.custom_request_id,
            productVariantId: row.product_variant_id ?? undefined,
            customerOwnedProductId: row.customer_owned_product_id ?? undefined,
            productName: row.product_name,
            variantLabel: row.variant_label ?? undefined,
            quantityTotal: Number(row.quantity_total),
          };
    });
  }

  /**
   * Every `ACCEPTED` version of every quotation raised for the request.
   *
   * No `ORDER BY version DESC`, no `LIMIT 1` and no join through
   * `custom_requests.current_quotation_id`: each of those would answer
   * "several" by picking one, which is precisely the heuristic `APP7-W01` §5
   * forbids. The caller sees the set and refuses.
   */
  async findAcceptedQuotationVersions(
    customRequestId: string,
  ): Promise<AcceptedQuotationVersion[]> {
    return this.run('findAcceptedQuotationVersions', async () => {
      const versions = await executeRaw<VersionRow>(
        this.db,
        sql`
          SELECT qv.id, q.custom_request_id, qv.total_amount, qv.deposit_amount,
                 qv.remaining_amount, qv.currency_code, qv.accepted_at
          FROM quotation_versions qv
          JOIN quotations q ON q.id = qv.quotation_id
          WHERE q.custom_request_id = ${customRequestId} AND qv.status = 'ACCEPTED'
          ORDER BY qv.id
        `,
      );
      if (versions.length === 0) {
        return [];
      }

      // One bound parameter per id through `sql.join`, never an interpolated
      // array literal: the raw-SQL boundary's one hard rule is that parameters
      // travel as parameters.
      const versionIds = sql.join(
        versions.map((version) => sql`${version.id}`),
        sql`, `,
      );
      const lines = await executeRaw<LineRow>(
        this.db,
        sql`
          SELECT quotation_version_id, position, quantity, unit_price_amount, line_total_amount
          FROM quotation_line_items
          WHERE quotation_version_id IN (${versionIds})
          ORDER BY quotation_version_id, position
        `,
      );

      return versions.map((version) => ({
        id: version.id,
        customRequestId: version.custom_request_id,
        // Strings all the way out. `numeric(14,2)` arrives as text and stays
        // text: parsing it into a JavaScript number here is how an exact
        // đồng becomes an approximate one.
        totalAmount: version.total_amount,
        depositAmount: version.deposit_amount,
        remainingAmount: version.remaining_amount,
        currencyCode: version.currency_code,
        acceptedAt: version.accepted_at ?? undefined,
        lineItems: lines
          .filter((line) => line.quotation_version_id === version.id)
          .map((line): AcceptedQuotationLine => ({
            position: Number(line.position),
            quantity: Number(line.quantity),
            unitPriceAmount: line.unit_price_amount,
            lineTotalAmount: line.line_total_amount,
          })),
      }));
    });
  }

  async findActiveSkuIdsForVariant(productVariantId: string): Promise<string[]> {
    return this.run('findActiveSkuIdsForVariant', async () => {
      const rows = await executeRaw<{ id: string }>(
        this.db,
        sql`
          SELECT id FROM skus
          WHERE product_variant_id = ${productVariantId} AND is_active = true
          ORDER BY id
        `,
      );
      // Every match, never the first. `skus.product_variant_id` carries no
      // unique constraint, so "how many" is a real question and the caller is
      // the one authorised to refuse.
      return rows.map((row) => row.id);
    });
  }

  async findCustomerOwnedProduct(
    customerOwnedProductId: string,
  ): Promise<{ id: string; name: string; customRequestId: string } | undefined> {
    return this.run('findCustomerOwnedProduct', async () => {
      const rows = await executeRaw<{
        id: string;
        name: string;
        custom_request_id: string;
      }>(
        this.db,
        sql`
          SELECT id, name, custom_request_id
          FROM customer_owned_products
          WHERE id = ${customerOwnedProductId}
        `,
      );
      const row = rows[0];
      return row === undefined
        ? undefined
        : { id: row.id, name: row.name, customRequestId: row.custom_request_id };
    });
  }
}
