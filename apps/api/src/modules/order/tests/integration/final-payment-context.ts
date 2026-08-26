/**
 * Shared harness for the `APP9-B01` Admin final-payment entry suite.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason `admin-order-context.ts` records: B01's
 * claim is that its one route is protected by APP1's existing guards, and a
 * stubbed guard would only prove the handler runs once something lets it. The
 * authenticated cases present a real session cookie against a real
 * `admin_sessions` row; the refused one sends no cookie and is refused by the
 * code path production uses.
 *
 * ### Everything is seeded through a canonical writer
 *
 * The order is created by `OrderRepository.createFromAcceptedQuotation` and
 * walked to `PRODUCTION_COMPLETED` by `OrderRepository.transition` — the one
 * AGG-15 implementation, under GRD-009 and LC-14, inside real transactions. The
 * `DEPOSIT` and `REMAINING` obligations are created by
 * `PaymentObligationRepository.createForOrder` — the one AGG-16 writer, the same
 * one `APP7-W01`'s conversion job calls — so what B01's guard reads is a pair a
 * real conversion would have written, with the initial state it actually sets.
 *
 * It does **not** run the `APP7-W01` worker, and it does not drive APP8's
 * production transitions to reach `PRODUCTION_COMPLETED`: re-running a
 * neighbouring checkpoint's behaviour would make a B01 failure ambiguous. The
 * canonical repositories are the seam they all share. Raw SQL appears only to
 * read committed state back, and in the one place a suite must manufacture a
 * state no writer offers — a `SUPERSEDED` obligation, which is the shipping-fee
 * recalculation's outcome and belongs to `APP9-B04`.
 *
 * `OrderModule` and `PaymentModule` appear in the testing module for that
 * seeding only. The production `AdminOrderLifecycleModule` imports neither.
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
import { AdminOrderLifecycleModule } from '../../admin-order-lifecycle.module';
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

/** The tables the suite counts rows in. */
export type CountableTable =
  | 'order_transitions'
  | 'payment_obligations'
  | 'payment_attempts'
  | 'outbox_events'
  | 'audit_events';

export interface ObligationRow {
  readonly id: string;
  readonly kind: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly status: string;
  readonly satisfiedAt: string | null;
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
  /** The LC-14 state to walk the order to. Defaults to `PRODUCTION_COMPLETED`. */
  readonly status?: OrderState;
  /** Creates the REMAINING obligation beside the DEPOSIT one. Defaults to true. */
  readonly remaining?: boolean;
}

export interface FinalPaymentTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  /** One order at the requested LC-14 state, with its canonical obligations. */
  seedOrder(options?: SeedOrderOptions): Promise<SeededOrder>;
  /** `orders.status` as stored. */
  orderStatus(orderId: string): Promise<string>;
  /** Every obligation row for one order, by kind. */
  obligationsOf(orderId: string): Promise<ObligationRow[]>;
  /** Every LC-14 transition row for one order, in append order. */
  transitionsOf(orderId: string): Promise<TransitionRow[]>;
  countRows(table: CountableTable): Promise<number>;
  /**
   * Forces one obligation to `SUPERSEDED`.
   *
   * The state a shipping-fee recalculation produces (`APP9-G01` §4), which no
   * checkpoint before `APP9-B04` delivers a writer for. Written directly so B01
   * can prove its guard ignores a non-live row without borrowing behaviour that
   * does not exist yet.
   */
  supersede(obligationId: string): Promise<void>;
  close(): Promise<void>;
}

export async function createFinalPaymentContext(label: string): Promise<FinalPaymentTestContext> {
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
        AdminOrderLifecycleModule,
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
        values (${adminId}, ${`b01-${adminId}@example.test`}, 'B01 Operator', 'ACTIVE')
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
   * Every hop is a legal `ALLOWED` move, applied through the canonical
   * `transition`, so the seeded order carries the history a real one would.
   */
  const PATH_TO: Readonly<Partial<Record<OrderState, readonly OrderState[]>>> = {
    AWAITING_DEPOSIT: [],
    DEPOSIT_PAID: ['DEPOSIT_PAID'],
    IN_PRODUCTION: ['DEPOSIT_PAID', 'IN_PRODUCTION'],
    PRODUCTION_COMPLETED: ['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED'],
    ON_HOLD: ['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED', 'ON_HOLD'],
  };

  const seedOrder: FinalPaymentTestContext['seedOrder'] = async (options = {}) => {
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

    // The pair `APP7-W01` creates in the conversion transaction: DEPOSIT and,
    // unless a case is proving its absence, REMAINING — both PENDING, both
    // attributed to the accepted quotation version the amount came from.
    await transactions.runInTransaction(async () => {
      await obligations.createForOrder({
        id: newId() as ObligationId,
        orderId,
        kind: 'DEPOSIT',
        amount: DEPOSIT_AMOUNT,
        sourceQuotationVersionId: fixture.quotationVersionId,
      });
      if (options.remaining !== false) {
        await obligations.createForOrder({
          id: newId() as ObligationId,
          orderId,
          kind: 'REMAINING',
          amount: REMAINING_AMOUNT,
          sourceQuotationVersionId: fixture.quotationVersionId,
        });
      }
    });

    for (const to of PATH_TO[options.status ?? 'PRODUCTION_COMPLETED'] ?? []) {
      await transactions.runInTransaction(() =>
        orders.transition({
          id: orderId,
          to,
          actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
          ...(to === 'ON_HOLD' ? { reason: 'Seeded hold.' } : {}),
          correlationId: newId(),
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
    reset: async () => {
      await truncateAllTables(db);
      currentCookie = '';
    },
    seedAdminSession,
    seedOrder,
    orderStatus: async (orderId) => {
      const [row] = (
        await db.execute<{ status: string }>(sql`select status from orders where id = ${orderId}`)
      ).rows;
      return row?.status ?? 'MISSING';
    },
    obligationsOf: async (orderId) => {
      const rows = (
        await db.execute<{
          id: string;
          kind: string;
          amount: string;
          currency_code: string;
          status: string;
          satisfied_at: string | null;
        }>(sql`
          select id, kind, amount::text as amount, currency_code, status,
                 satisfied_at::text as satisfied_at
            from payment_obligations
           where order_id = ${orderId}
           order by kind
        `)
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        currencyCode: row.currency_code,
        status: row.status,
        satisfiedAt: row.satisfied_at,
      }));
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
            from order_transitions
           where order_id = ${orderId}
           order by id
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
      // five literal table names, each spelled in `CountableTable`.
      const [row] = (
        await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${sql.raw(table)}`,
        )
      ).rows;
      return Number(row?.count ?? '0');
    },
    supersede: async (obligationId) => {
      await db.execute(
        sql`update payment_obligations set status = 'SUPERSEDED' where id = ${obligationId}`,
      );
    },
    close: async () => {
      await app.close();
      await disposable.drop();
      restore('DATABASE_URL', previous.url);
      restore('NODE_ENV', previous.env);
    },
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

/** The one canonical route, under the global API prefix. */
export const TRANSITION_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/transitions`;
