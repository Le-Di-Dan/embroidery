/**
 * Order-conversion persistence (`APP7-W01` §11, §24).
 *
 * Raw SQL through the database package's sanctioned boundary, exactly as the
 * three delivered worker capabilities do: this application depends on
 * `@embroidery/database` and `@embroidery/persistence`, never on Drizzle, never
 * on the driver and never on `apps/api`.
 *
 * ### GRD-009 is re-read here, not taken from the event
 *
 * `WorkerOrderChainGuard` is a collaborator rather than a method, mirroring the
 * responsibility split the delivered `OrderChainGuard` already makes: the chain
 * check is its own argument and its own file. It runs inside this transaction,
 * against the persisted rows, before a single row is written. What it must never
 * become is *optional* — the event arriving from APP6 is not evidence that the
 * chain resolves, and `APP7-W01` §4 says so in as many words.
 *
 * ### One method, because the order is one fact
 *
 * `createConvertedOrder` writes the order, its frozen lines, the DEPOSIT and
 * REMAINING obligations (INV-04) and the `order.created` outbox row (SE-006,
 * G-DB7-54) in the caller's transaction. It is the single owner of that event in
 * this checkpoint: nothing else appends `order.created`, so one committed order
 * is exactly one canonical event, and a rolled-back conversion is none.
 *
 * `uq_orders__request` is the final duplicate arbiter and is left to do its job —
 * no `ON CONFLICT`, no swallow, no retry loop. A second conversion that gets past
 * the `order.create` claim fails on the `orders` insert, before a single item,
 * obligation or event row exists.
 *
 * ### What this file must never do, all one line away
 *
 * No payment attempt, no order transition, no `DEPOSIT_PAID`, no reservation, no
 * soft hold, no production row, no Catalog write, no SKU creation or
 * activation, and no read of `skus.price_override_amount` or any live product
 * price. Money is copied from the accepted version's own columns and from
 * nowhere else.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, guardViolationError, newId, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository, OutboxEventStore } from '@embroidery/persistence';

import type {
  AcceptedQuotationLine,
  AcceptedQuotationVersion,
  ConvertedOrder,
  CreateConvertedOrderInput,
  FrozenApprovalSnapshot,
  OrderConversionRepository,
} from '../../domain/repositories/order-conversion.repository';
import { WorkerOrderChainGuard } from './order-chain.guard';

/** `ck_orders__currency_vnd`, `ck_order_items__currency_vnd`, `ck_payment_obligations__currency_vnd`. */
const CURRENCY = 'VND';

/** The one state `TR-LC14-01` may create. Nothing here can express another. */
const INITIAL_ORDER_STATE = 'AWAITING_DEPOSIT';

interface SnapshotRow extends Record<string, unknown> {
  readonly id: string;
  readonly custom_request_id: string;
  readonly customer_id: string;
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
export class SqlOrderConversionRepository
  extends DrizzleRepository
  implements OrderConversionRepository
{
  constructor(
    executor: DatabaseExecutor,
    private readonly chain: WorkerOrderChainGuard,
    private readonly outbox: OutboxEventStore,
  ) {
    super(executor);
  }

  async findApprovalSnapshot(
    approvalSnapshotId: string,
  ): Promise<FrozenApprovalSnapshot | undefined> {
    return this.run('findApprovalSnapshot', async () => {
      const rows = await executeRaw<SnapshotRow>(
        this.db,
        sql`
          SELECT id, custom_request_id, customer_id, product_variant_id,
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
            customerId: row.customer_id,
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

  async findOrderByRequest(customRequestId: string): Promise<ConvertedOrder | undefined> {
    return this.run('findOrderByRequest', async () => {
      const rows = await executeRaw<{ id: string; code: string }>(
        this.db,
        sql`SELECT id, code FROM orders WHERE custom_request_id = ${customRequestId}`,
      );
      const row = rows[0];
      return row === undefined ? undefined : { id: row.id, code: row.code };
    });
  }

  async createConvertedOrder(input: CreateConvertedOrderInput): Promise<ConvertedOrder> {
    return this.run('createConvertedOrder', async () => {
      // Multi-table and multi-aggregate: order, items, both obligations and the
      // outbox row have to commit together or not at all.
      this.requireTransaction('createConvertedOrder');

      // GRD-009, re-read from the persisted rows inside this transaction. The
      // customer, total and currency written below come back from the verified
      // chain, so the order cannot disagree with what was checked.
      const chain = await this.chain.assertOrderChain(
        input.customRequestId,
        input.acceptedQuotationVersionId,
        input.approvalSnapshotId,
      );

      // `ck_order_items__exactly_one_subject` in application terms, so a caller
      // gets a message naming the actual problem rather than a generic "values
      // not valid" from the constraint.
      for (const item of input.items) {
        if ((item.skuId !== undefined) === (item.customerOwnedProductId !== undefined)) {
          throw guardViolationError(
            'SqlOrderConversionRepository.createConvertedOrder',
            'ORDER_ITEM_SUBJECT_INVALID',
            'Each order line must reference exactly one of a SKU or a customer-supplied product.',
          );
        }
      }

      const orders = await executeRaw<{ id: string; code: string }>(
        this.db,
        sql`
          INSERT INTO orders
            (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
             current_approval_snapshot_id, status, total_amount, currency_code)
          VALUES
            (${input.id}, ${input.code}, ${input.customRequestId}, ${chain.customerId},
             ${input.acceptedQuotationVersionId}, ${input.approvalSnapshotId},
             ${INITIAL_ORDER_STATE}, ${chain.totalAmount}, ${chain.currencyCode})
          RETURNING id, code
        `,
      );
      const order = orders[0];
      if (order === undefined) {
        throw guardViolationError(
          'SqlOrderConversionRepository.createConvertedOrder',
          'ORDER_NOT_CREATED',
          'Could not create the order.',
        );
      }

      for (const item of input.items) {
        await executeRaw(
          this.db,
          sql`
            INSERT INTO order_items
              (id, order_id, position, sku_id, customer_owned_product_id, product_name,
               variant_label, size_label, quantity, unit_price_amount, line_total_amount,
               currency_code, approval_snapshot_id)
            VALUES
              (${newId()}, ${input.id}, ${item.position}, ${item.skuId ?? null},
               ${item.customerOwnedProductId ?? null}, ${item.productName},
               ${item.variantLabel ?? null}, ${item.sizeLabel ?? null}, ${item.quantity},
               ${item.unitPriceAmount}, ${item.lineTotalAmount}, ${CURRENCY},
               ${input.approvalSnapshotId})
          `,
        );
      }

      // INV-04 / `TR-LC15-01`: **both** obligations, in this transaction. APP7
      // never makes the remaining one payable — that is `TR-LC14-05`, APP9's —
      // but an order that exists without it would be an order whose second
      // instalment nothing records. `source_quotation_version_id` is the exact
      // accepted version, so each amount can be traced to the price that
      // justified it. No `payment_attempts` row is written here, by any path.
      await this.insertObligation(
        input.depositObligationId,
        input.id,
        'DEPOSIT',
        input.depositAmount,
        input.acceptedQuotationVersionId,
      );
      await this.insertObligation(
        input.remainingObligationId,
        input.id,
        'REMAINING',
        input.remainingAmount,
        input.acceptedQuotationVersionId,
      );

      // SE-006 / G-DB7-54, and the **only** append of it in this checkpoint.
      // The payload holds canonical references and nothing else: a consumer
      // resolves amounts and contact details from the ids, so the row cannot go
      // stale or leak what it does not carry.
      await this.outbox.append({
        eventType: 'order.created',
        aggregateKind: 'ORDER',
        aggregateId: input.id,
        payload: { orderId: input.id, code: input.code, customRequestId: input.customRequestId },
        payloadSchemaVersion: 1,
      });

      return { id: order.id, code: order.code };
    });
  }

  private async insertObligation(
    id: string,
    orderId: string,
    kind: 'DEPOSIT' | 'REMAINING',
    amount: string,
    sourceQuotationVersionId: string,
  ): Promise<void> {
    await executeRaw(
      this.db,
      sql`
        INSERT INTO payment_obligations
          (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
        VALUES
          (${id}, ${orderId}, ${kind}, ${amount}, ${CURRENCY}, 'PENDING',
           ${sourceQuotationVersionId})
      `,
    );
  }
}
