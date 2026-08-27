/**
 * Harness for the `APP9-B05` Admin delivery suite (dispatch + completion).
 *
 * A **B05-specific** context rather than an extension of an accepted one. The
 * `APP9-B04` harness ends at 599 of its 600 permitted lines and may not grow
 * (`APP9-B05` §20), and `final-payment-context.ts` is `APP9-B01`'s: adding a
 * shipping seeder, a snapshot reader and a `READY_FOR_DELIVERY` walk to it would
 * put B05's needs inside a file an accepted suite depends on and force that
 * suite to be re-run for a change it did not ask for. Neither file is touched.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason both of those harnesses record: the
 * checkpoint claims its two routes are protected by APP1's existing guards, and
 * a stubbed guard would only prove the handler runs once something lets it.
 *
 * ### Everything is seeded through a canonical writer
 *
 * The order is created by `OrderRepository.createFromAcceptedQuotation` and
 * walked by `OrderRepository.transition`; the obligations are created by
 * `PaymentObligationRepository.createForOrder`; a `SATISFIED` remaining is
 * produced by the real `openAttempt` → `settleAttempt` → `satisfy` chain rather
 * than by an UPDATE, because `satisfy` is the guard (G-DB7-06 / G-DB7-33) that
 * makes the state legitimate; the shipping detail is written by
 * `OrderRepository.saveShippingDetails`, the one pre-freeze writer.
 *
 * Nothing here reaches for B05's own HTTP surface to build a precondition for a
 * B05 behaviour (§24): `FROZEN` is only ever reached by the command under test.
 * Raw SQL appears only to read committed state back — every snapshot, freeze and
 * transition assertion reads the database, not the response body.
 *
 * `OrderModule` and `PaymentModule` appear in the testing module for that
 * seeding only. The production `AdminOrderDeliveryModule` imports neither.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type AttemptId,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import { AdminOrderDeliveryModule } from '../../admin-order-delivery.module';
import { OrderModule } from '../../order.module';
import { PaymentModule } from '../../../payment/payment.module';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type {
  OrderId,
  OrderItem,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { seedOrderChain } from './order-fixture';
import type { OrderFixture } from './order-fixture';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** The amounts the seeded obligations carry, exactly as stored. */
export const DEPOSIT_AMOUNT = '765000.00';
export const REMAINING_AMOUNT = '1785000.00';

/** The shipping fee the seeded detail carries, exactly as stored. */
export const SHIPPING_FEE = '50000.00';

/** The shipping facts the seeded detail carries, so a snapshot can be compared. */
export const SEEDED_SHIPPING = {
  recipientName: 'Seeded Recipient',
  recipientPhone: '0900000000',
  addressLine: '1 Seed Street',
  ward: 'Phường 1',
  district: 'Quận 1',
  province: 'Hà Nội',
  carrierName: 'Nội bộ',
  trackingCode: 'TRK-SEED-0001',
} as const;

/** The tables the suite counts rows in. */
export type CountableTable =
  | 'order_transitions'
  | 'shipping_snapshots'
  | 'shipping_details'
  | 'payment_obligations'
  | 'outbox_events'
  | 'audit_events';

export interface ShippingRow {
  readonly id: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward: string | null;
  readonly district: string | null;
  readonly province: string;
  readonly countryCode: string;
  readonly feeAmount: string | null;
  readonly currencyCode: string;
  readonly carrierName: string | null;
  readonly trackingCode: string | null;
  readonly status: string;
  readonly frozenAt: string | null;
}

export interface SnapshotRow {
  readonly id: string;
  readonly shippingDetailId: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward: string | null;
  readonly district: string | null;
  readonly province: string;
  readonly countryCode: string;
  readonly feeAmount: string;
  readonly currencyCode: string;
  readonly carrierName: string | null;
  readonly trackingCode: string | null;
  readonly dispatchedAt: string;
}

export interface TransitionRow {
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly eventKind: string;
  readonly actorKind: string;
  readonly adminId: string | null;
}

export interface SeededOrder {
  readonly orderId: string;
  readonly code: string;
  readonly fixture: OrderFixture;
}

export interface SeedOrderOptions {
  /** The LC-14 state to walk the order to. Defaults to `READY_FOR_DELIVERY`. */
  readonly status?: OrderState;
  /** Settles the REMAINING obligation through the canonical chain. Defaults to true. */
  readonly satisfyRemaining?: boolean;
  /**
   * Writes a complete shipping detail. Defaults to true.
   *
   * `'noFee'` writes one with every NOT NULL fact and **no fee** — the smallest
   * canonical GRD-017 failure that is not simply an absent row.
   */
  readonly shipping?: boolean | 'noFee';
}

export interface OrderDeliveryTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  /** The ACTIVE admin account the seeded session belongs to. */
  adminId(): string;
  seedOrder(options?: SeedOrderOptions): Promise<SeededOrder>;
  orderStatus(orderId: string): Promise<string>;
  /** `orders.delivered_at` / `completed_at` as stored. */
  orderStamps(orderId: string): Promise<{
    readonly deliveredAt: string | null;
    readonly completedAt: string | null;
  }>;
  shippingOf(orderId: string): Promise<ShippingRow | undefined>;
  snapshotsOf(orderId: string): Promise<SnapshotRow[]>;
  transitionsOf(orderId: string): Promise<TransitionRow[]>;
  countRows(table: CountableTable): Promise<number>;
  close(): Promise<void>;
}

export async function createOrderDeliveryContext(label: string): Promise<OrderDeliveryTestContext> {
  const previous = { url: process.env['DATABASE_URL'], env: process.env['NODE_ENV'] };

  const disposable = await createDisposableDatabase(label);
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  let app: INestApplication;
  let orders: OrderRepository;
  let obligations: PaymentObligationRepository;
  let transactions: TransactionManager;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        AdminOrderDeliveryModule,
        // Seeding only — see the file header.
        OrderModule,
        PaymentModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
    orders = moduleRef.get<OrderRepository>(ORDER_REPOSITORY);
    obligations = moduleRef.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
    transactions = moduleRef.get(TransactionManager);
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  let currentCookie = '';
  let currentAdminId = '';

  const seedAdminSession = async (): Promise<string> => {
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so the
    // suite reuses whichever one already exists rather than minting a second.
    const existing = (
      await db.execute<{ id: string }>(
        sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
      )
    ).rows[0];

    let adminId = existing?.id;
    if (adminId === undefined) {
      adminId = newId();
      await db.execute(sql`
        insert into admin_accounts (id, email, display_name, status)
        values (${adminId}, ${`b05-${adminId}@example.test`}, 'B05 Operator', 'ACTIVE')
      `);
    }
    // A real 256-bit token, hashed exactly as `SessionTokenService` does, so the
    // guard performs its production lookup. The raw value never leaves this
    // process and is written nowhere but the request header.
    const rawToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
              ${new Date(Date.now() + 30 * 60 * 1_000)})
    `);
    currentAdminId = adminId;
    currentCookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
    return currentCookie;
  };

  const catalogItem = (fixture: OrderFixture): OrderItem => ({
    position: 1,
    skuId: fixture.skuId,
    customerOwnedProductId: undefined,
    productName: 'Tee',
    variantLabel: 'Black / M',
    sizeLabel: undefined,
    quantity: 25,
    unitPriceAmount: '100000.00',
    lineTotalAmount: '2500000.00',
  });

  /**
   * The LC-14 walk from creation to a requested state.
   *
   * Every hop is a legal `ALLOWED` move applied through the canonical
   * `transition`, so the seeded order carries the history a real one would —
   * and `DELIVERED` is deliberately absent: reaching it is what B05's dispatch
   * command does, and seeding past it would let a case prove a completion
   * against a state no delivered writer produced.
   */
  const PATH_TO: Readonly<Partial<Record<OrderState, readonly OrderState[]>>> = {
    PRODUCTION_COMPLETED: ['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED'],
    AWAITING_FINAL_PAYMENT: [
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
    ],
    READY_FOR_DELIVERY: [
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
      'READY_FOR_DELIVERY',
    ],
  };

  const seedOrder: OrderDeliveryTestContext['seedOrder'] = async (options = {}) => {
    const fixture = await seedOrderChain({ disposable }, newId().slice(0, 8));
    const orderId = newId() as OrderId;
    const code = `ORD-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await transactions.runInTransaction(() =>
      orders.createFromAcceptedQuotation({
        id: orderId,
        code,
        customRequestId: fixture.customRequestId,
        acceptedQuotationVersionId: fixture.quotationVersionId,
        approvalSnapshotId: fixture.approvalSnapshotId,
        items: [catalogItem(fixture)],
      }),
    );

    // The pair `APP7-W01` creates in the conversion transaction: DEPOSIT and
    // REMAINING, both PENDING, both attributed to the accepted quotation
    // version the amount came from.
    let remainingId: ObligationId | undefined;
    await transactions.runInTransaction(async () => {
      await obligations.createForOrder({
        id: newId() as ObligationId,
        orderId,
        kind: 'DEPOSIT',
        amount: DEPOSIT_AMOUNT,
        sourceQuotationVersionId: fixture.quotationVersionId,
      });
      const remaining = await obligations.createForOrder({
        id: newId() as ObligationId,
        orderId,
        kind: 'REMAINING',
        amount: REMAINING_AMOUNT,
        sourceQuotationVersionId: fixture.quotationVersionId,
      });
      remainingId = remaining.id;
    });

    for (const to of PATH_TO[options.status ?? 'READY_FOR_DELIVERY'] ?? []) {
      await transactions.runInTransaction(() =>
        orders.transition({
          id: orderId,
          to,
          actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
          correlationId: newId(),
        }),
      );
    }

    if (options.satisfyRemaining !== false && remainingId !== undefined) {
      // The real chain, not an UPDATE: `satisfy` is the guard that makes a
      // SATISFIED obligation legitimate, so borrowing it is what stops a case
      // proving a refusal against a state no writer could have produced.
      const target = remainingId;
      await transactions.runInTransaction(async () => {
        const attemptId = newId() as AttemptId;
        await obligations.openAttempt({
          id: attemptId,
          paymentObligationId: target,
          amount: REMAINING_AMOUNT,
          method: 'BANK_TRANSFER',
        });
        await obligations.settleAttempt(attemptId, 'SUCCEEDED', new Date());
        await obligations.satisfy(target, attemptId, new Date());
      });
    }

    if (options.shipping !== false) {
      await transactions.runInTransaction(() =>
        orders.saveShippingDetails({
          orderId,
          ...SEEDED_SHIPPING,
          ...(options.shipping === 'noFee' ? {} : { feeAmount: SHIPPING_FEE }),
        }),
      );
    }

    return { orderId, code, fixture };
  };

  return {
    app,
    disposable,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => currentCookie,
    adminId: () => currentAdminId,
    reset: async () => {
      await truncateAllTables(db);
      currentCookie = '';
      currentAdminId = '';
    },
    seedAdminSession,
    seedOrder,
    orderStatus: async (orderId) => {
      const [row] = (
        await db.execute<{ status: string }>(sql`select status from orders where id = ${orderId}`)
      ).rows;
      return row?.status ?? 'MISSING';
    },
    orderStamps: async (orderId) => {
      const [row] = (
        await db.execute<{ delivered_at: string | null; completed_at: string | null }>(sql`
          select delivered_at::text as delivered_at, completed_at::text as completed_at
            from orders where id = ${orderId}
        `)
      ).rows;
      return { deliveredAt: row?.delivered_at ?? null, completedAt: row?.completed_at ?? null };
    },
    shippingOf: async (orderId) => {
      const [row] = (
        await db.execute<Record<string, string | null>>(sql`
          select id, recipient_name, recipient_phone, address_line, ward, district, province,
                 country_code, fee_amount::text as fee_amount, currency_code, carrier_name,
                 tracking_code, status, frozen_at::text as frozen_at
            from shipping_details where order_id = ${orderId}
        `)
      ).rows;
      return row === undefined ? undefined : toShippingRow(row);
    },
    snapshotsOf: async (orderId) => {
      const rows = (
        await db.execute<Record<string, string | null>>(sql`
          select id, shipping_detail_id, recipient_name, recipient_phone, address_line, ward,
                 district, province, country_code, fee_amount::text as fee_amount, currency_code,
                 carrier_name, tracking_code, dispatched_at::text as dispatched_at
            from shipping_snapshots where order_id = ${orderId} order by id
        `)
      ).rows;
      return rows.map(toSnapshotRow);
    },
    transitionsOf: async (orderId) => {
      const rows = (
        await db.execute<{
          from_status: string;
          to_status: string;
          event_kind: string;
          actor_kind: string;
          admin_id: string | null;
        }>(sql`
          select from_status, to_status, event_kind, actor_kind, admin_id
            from order_transitions where order_id = ${orderId} order by id
        `)
      ).rows;
      return rows.map((row) => ({
        fromStatus: row.from_status,
        toStatus: row.to_status,
        eventKind: row.event_kind,
        actorKind: row.actor_kind,
        adminId: row.admin_id,
      }));
    },
    countRows: async (table) => {
      // `sql.raw` on a value from a closed union, never from a test's input:
      // six literal table names, each spelled in `CountableTable`.
      const [row] = (
        await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${sql.raw(table)}`,
        )
      ).rows;
      return Number(row?.count ?? '0');
    },
    close: async () => {
      await app.close();
      await disposable.drop();
      restore('DATABASE_URL', previous.url);
      restore('NODE_ENV', previous.env);
    },
  };
}

function toShippingRow(row: Record<string, string | null>): ShippingRow {
  return {
    id: row['id'] ?? '',
    recipientName: row['recipient_name'] ?? '',
    recipientPhone: row['recipient_phone'] ?? '',
    addressLine: row['address_line'] ?? '',
    ward: row['ward'] ?? null,
    district: row['district'] ?? null,
    province: row['province'] ?? '',
    countryCode: row['country_code'] ?? '',
    feeAmount: row['fee_amount'] ?? null,
    currencyCode: row['currency_code'] ?? '',
    carrierName: row['carrier_name'] ?? null,
    trackingCode: row['tracking_code'] ?? null,
    status: row['status'] ?? '',
    frozenAt: row['frozen_at'] ?? null,
  };
}

function toSnapshotRow(row: Record<string, string | null>): SnapshotRow {
  return {
    id: row['id'] ?? '',
    shippingDetailId: row['shipping_detail_id'] ?? '',
    recipientName: row['recipient_name'] ?? '',
    recipientPhone: row['recipient_phone'] ?? '',
    addressLine: row['address_line'] ?? '',
    ward: row['ward'] ?? null,
    district: row['district'] ?? null,
    province: row['province'] ?? '',
    countryCode: row['country_code'] ?? '',
    feeAmount: row['fee_amount'] ?? '',
    currencyCode: row['currency_code'] ?? '',
    carrierName: row['carrier_name'] ?? null,
    trackingCode: row['tracking_code'] ?? null,
    dispatchedAt: row['dispatched_at'] ?? '',
  };
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

/** The envelope's `data`, typed. Narrowed here, at one boundary. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`, narrowed at the same one boundary. */
export function errorCodeOf(response: { readonly body: unknown }): string {
  return (response.body as { readonly code?: string }).code ?? '';
}

/** The two canonical routes, under the global API prefix. */
export const DISPATCH_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/dispatch`;

export const COMPLETION_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/completion`;
