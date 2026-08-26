/**
 * The `APP8-E01` acceptance harness — API side.
 *
 * ### What it boots
 *
 * **One** real HTTP application carrying every delivered APP8 Admin surface at
 * once: the `APP8-B01` stock routes (`AdminSkuStockModule`), the `APP8-B03`
 * production create/queue/detail routes (`AdminProductionModule`) and the
 * `APP8-B04` transition route (`AdminProductionTransitionModule`), against one
 * disposable PostgreSQL with every migration applied.
 *
 * That single injector is the point. Each `B0n` suite booted the one module it
 * owned, which is what let it say "no route in this injector could have done
 * that". `E01` asks the opposite question — whether the slices *compose* — so
 * the stock an operator adjusts over `/admin/skus/:skuId/stock/adjustments` has
 * to be the same stock a production start decrements, read back from committed
 * rows rather than from a second harness's copy.
 *
 * ### Why this is a purpose-built context and not the B03/B04 one
 *
 * `admin-production-context.ts` composes production and inventory persistence
 * but not the Admin stock *routes*, and it is the shared harness of six accepted
 * suites. Widening its module list would make every one of those suites a rerun
 * candidate for a change none of them needs
 * (`APP8-INVENTORY-AND-PRODUCTION.md` §13.2). So E01 owns its own context and
 * modifies no accepted file. What it does reuse is the **canonical** seeding:
 * `seedOrderChain` for the customer -> request -> quotation -> approval chain,
 * the AGG-15 `OrderRepository` for the order itself, and the shared AGG-07
 * `SkuStockRepository` for the official reservation — the same writers
 * production uses.
 *
 * ### Nothing under test is overridden
 *
 * No guard is stubbed and no repository doubled. The real
 * `AuthenticatedAdminGuard` runs against a real `admin_sessions` row whose token
 * is minted here and hashed exactly as `SessionTokenService` does. The raw token
 * never leaves this process, and no `.env` file is read or written
 * (`CLAUDE.md` §8a).
 *
 * ### What is seeded, and what is not
 *
 * Only prerequisite state APP8 consumes and no APP8 operation produces: the
 * Catalog/commission chain, the order, and the SATISFIED `DEPOSIT` obligation.
 * The deposit is APP7's lifecycle — driving it here would rerun a neighbouring
 * phase and make an APP8 failure ambiguous, and the deposit authority reads the
 * row however it was written.
 *
 * Stock quantity, production jobs, specifications, every transition, every
 * ledger row and every audit row are produced by an owning APP8 operation over
 * HTTP. None is written by this harness.
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
import { SKU_STOCK_REPOSITORY, TransactionManager } from '@embroidery/persistence';
import type { ReservationId, SkuId, SkuStockRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../src/bootstrap/api-application';
import { AuditContextModule } from '../../../src/platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../src/platform/http-response/http-response.module';
import { RequestContextModule } from '../../../src/platform/request-context/request-context.module';
import { ValidationModule } from '../../../src/platform/validation/validation.module';
import { hashToken } from '../../../src/modules/identity/infrastructure/crypto/session-token.service';
import { AdminSkuStockModule } from '../../../src/modules/inventory/admin-sku-stock.module';
import { InventoryModule } from '../../../src/modules/inventory/inventory.module';
import { OrderModule } from '../../../src/modules/order/order.module';
import { ORDER_REPOSITORY } from '../../../src/modules/order/domain/repositories/order.repository';
import type {
  OrderId,
  OrderItem,
  OrderRepository,
} from '../../../src/modules/order/domain/repositories/order.repository';
import { seedOrderChain } from '../../../src/modules/order/tests/integration/order-fixture';
import type { OrderFixture } from '../../../src/modules/order/tests/integration/order-fixture';
import { AdminProductionModule } from '../../../src/modules/production/admin-production.module';
import { AdminProductionTransitionModule } from '../../../src/modules/production/admin-production-transition.module';

/** The development cookie name (`cookieSecure` is false outside production). */
const ADMIN_COOKIE_NAME = 'adm_session';

/** The catalog display copy `seedOrderChain`'s approval snapshot freezes. */
export const FROZEN_PRODUCT_NAME = 'Tee';
export const FROZEN_VARIANT_LABEL = 'Black / M';

/** The frozen line quantity every E01 Catalog order carries. */
export const CATALOG_QUANTITY = 25;

/** Tables E01 counts rows in, to prove an effect happened exactly once. */
export type CountableTable =
  | 'production_jobs'
  | 'production_specifications'
  | 'production_job_transitions'
  | 'order_transitions'
  | 'inventory_reservations'
  | 'inventory_ledger_entries'
  | 'outbox_events'
  | 'audit_events';

export interface ReservationRow {
  readonly id: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly status: string;
  readonly releasedReason: string | null;
}

export interface LedgerRow {
  readonly entryKind: string;
  readonly quantity: number;
  readonly onHandDelta: number;
  readonly reason: string | null;
}

export interface SeededOrder {
  readonly orderId: string;
  readonly code: string;
  readonly fixture: OrderFixture;
  readonly approvalSnapshotId: string;
}

export interface App8AcceptanceContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  /** One Catalog order, deposit SATISFIED, at `DEPOSIT_PAID`. No stock, no job. */
  seedCatalogOrder(suffix?: string): Promise<SeededOrder>;
  /** Moves an order through the canonical AGG-15 `transition`. */
  moveOrder(orderId: string, to: OrderState, reason?: string): Promise<void>;
  orderStatusOf(orderId: string): Promise<string>;
  /** `sku_stocks.quantity_on_hand` as stored. */
  onHand(skuId: string): Promise<number>;
  reservationsOf(orderId: string): Promise<ReservationRow[]>;
  ledgerOf(skuId: string): Promise<LedgerRow[]>;
  countRows(table: CountableTable): Promise<number>;
  /** Audit event actions, in append order. */
  auditActions(): Promise<string[]>;
  /**
   * One official `RESERVED` reservation through the canonical AGG-07 writer —
   * the exact call `APP8-W01`'s `ReserveOrderInventoryUseCase` makes, with the
   * same `inventory.reserve` SYSTEM actor. `J2` proves the worker reaches it;
   * `J3`/`J4` continue from it, because `apps/api` may not import `apps/worker`.
   */
  reserveAsWorker(orderId: string, skuId: string, quantity: number): Promise<string>;
  close(): Promise<void>;
}

export async function createApp8AcceptanceContext(label: string): Promise<App8AcceptanceContext> {
  const previous = { url: process.env['DATABASE_URL'], env: process.env['NODE_ENV'] };

  const disposable = await createDisposableDatabase(label);
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  let app: INestApplication;
  let orders: OrderRepository;
  let stock: SkuStockRepository;
  let transactions: TransactionManager;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        // The three delivered APP8 Admin surfaces, in one injector.
        AdminSkuStockModule,
        AdminProductionModule,
        AdminProductionTransitionModule,
        // Seeding only: the canonical AGG-15 order writer and the shared AGG-07
        // stock writer. No APP8 route resolves either through these imports.
        OrderModule,
        InventoryModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
    orders = moduleRef.get<OrderRepository>(ORDER_REPOSITORY);
    stock = moduleRef.get<SkuStockRepository>(SKU_STOCK_REPOSITORY);
    transactions = moduleRef.get(TransactionManager);
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  let currentCookie = '';

  const seedAdminSession = async (): Promise<string> => {
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so reuse
    // whichever one the seeded chain already produced.
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
        values (${adminId}, ${`e01-${adminId}@example.test`}, 'E01 Operator', 'ACTIVE')
      `);
    }
    // A real 256-bit token, hashed exactly as `SessionTokenService` does, so the
    // guard performs its production lookup. Synthetic, minted per run, and
    // written nowhere but the request header.
    const rawToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
              ${new Date(Date.now() + 30 * 60 * 1_000)})
    `);
    currentCookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
    return currentCookie;
  };

  /**
   * The DEPOSIT obligation in SATISFIED, with the evidence the schema demands.
   *
   * `ck_payment_obligations__satisfied_evidence_required` refuses a SATISFIED
   * row without both `satisfied_at` and `satisfied_by_attempt_id`, so the
   * succeeded attempt is written too.
   */
  const satisfyDeposit = async (orderId: string, quotationVersionId: string): Promise<void> => {
    const obligationId = newId();
    const attemptId = newId();
    await db.execute(sql`
      insert into payment_obligations
        (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
      values (${obligationId}, ${orderId}, 'DEPOSIT', 765000.00, 'VND', 'PENDING',
              ${quotationVersionId})
    `);
    await db.execute(sql`
      insert into payment_attempts
        (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
      values (${attemptId}, ${obligationId}, 765000.00, 'VND', 'BANK_TRANSFER', 'SUCCEEDED', now())
    `);
    await db.execute(sql`
      update payment_obligations
         set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attemptId}
       where id = ${obligationId}
    `);
  };

  const catalogItem = (fixture: OrderFixture): OrderItem => ({
    position: 1,
    skuId: fixture.skuId,
    customerOwnedProductId: undefined,
    productName: FROZEN_PRODUCT_NAME,
    variantLabel: FROZEN_VARIANT_LABEL,
    sizeLabel: undefined,
    quantity: CATALOG_QUANTITY,
    unitPriceAmount: '100000.00',
    lineTotalAmount: '2500000.00',
  });

  const moveOrder: App8AcceptanceContext['moveOrder'] = async (orderId, to, reason) => {
    await transactions.runInTransaction(() =>
      orders.transition({
        id: orderId as OrderId,
        to,
        actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
        ...(reason === undefined ? {} : { reason }),
        correlationId: newId(),
      }),
    );
  };

  const seedCatalogOrder: App8AcceptanceContext['seedCatalogOrder'] = async (suffix) => {
    const fixture = await seedOrderChain({ disposable }, suffix ?? newId().slice(0, 8));
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
    await satisfyDeposit(orderId, fixture.quotationVersionId);
    await moveOrder(orderId, 'DEPOSIT_PAID');

    return { orderId, code, fixture, approvalSnapshotId: fixture.approvalSnapshotId };
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
    seedCatalogOrder,
    moveOrder,
    orderStatusOf: async (orderId) => {
      const order = await transactions.runInTransaction(() => orders.findById(orderId as OrderId));
      return order?.status ?? 'MISSING';
    },
    onHand: async (skuId) => {
      const [row] = (
        await db.execute<{ quantity_on_hand: number }>(
          sql`select quantity_on_hand from sku_stocks where sku_id = ${skuId}`,
        )
      ).rows;
      return Number(row?.quantity_on_hand ?? -1);
    },
    reservationsOf: async (orderId) => {
      const rows = (
        await db.execute<{
          id: string;
          sku_id: string;
          quantity: number;
          status: string;
          released_reason: string | null;
        }>(sql`
          select r.id, s.sku_id, r.quantity, r.status, r.released_reason
            from inventory_reservations r
            join sku_stocks s on s.id = r.sku_stock_id
           where r.order_id = ${orderId}
           order by r.id
        `)
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        skuId: row.sku_id,
        quantity: Number(row.quantity),
        status: row.status,
        releasedReason: row.released_reason,
      }));
    },
    ledgerOf: async (skuId) => {
      const rows = (
        await db.execute<{
          entry_kind: string;
          quantity: number;
          on_hand_delta: number;
          reason: string | null;
        }>(sql`
          select l.entry_kind, l.quantity, l.on_hand_delta, l.reason
            from inventory_ledger_entries l
            join sku_stocks s on s.id = l.sku_stock_id
           where s.sku_id = ${skuId}
           order by l.id
        `)
      ).rows;
      return rows.map((row) => ({
        entryKind: row.entry_kind,
        quantity: Number(row.quantity),
        onHandDelta: Number(row.on_hand_delta),
        reason: row.reason,
      }));
    },
    countRows: async (table) => {
      // `sql.raw` on a value from a closed union, never from a test's input:
      // eight literal table names, each spelled in `CountableTable`.
      const [row] = (
        await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${sql.raw(table)}`,
        )
      ).rows;
      return Number(row?.count ?? '0');
    },
    auditActions: async () => {
      const rows = (
        await db.execute<{ action: string }>(
          sql`select action from audit_events order by occurred_at, id`,
        )
      ).rows;
      return rows.map((row) => row.action);
    },
    reserveAsWorker: async (orderId, skuId, quantity) => {
      const reservation = await transactions.runInTransaction(() =>
        stock.createReservation({
          id: newId() as ReservationId,
          skuId: skuId as SkuId,
          orderId,
          quantity,
          actor: { kind: 'SYSTEM', systemJobKey: 'inventory.reserve' },
        }),
      );
      return reservation.id;
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

/** The delivered APP8 Admin routes, under the global API prefix. */
export const ROUTES = {
  stock: (skuId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/skus/${skuId}/stock`,
  adjust: (skuId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/skus/${skuId}/stock/adjustments`,
  ledger: (skuId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/skus/${skuId}/stock/ledger`,
  create: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/production-jobs`,
  queue: () => `/${GLOBAL_ROUTE_PREFIX}/admin/production-jobs`,
  detail: (jobId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/production-jobs/${jobId}`,
  transition: (jobId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/production-jobs/${jobId}/transitions`,
} as const;
