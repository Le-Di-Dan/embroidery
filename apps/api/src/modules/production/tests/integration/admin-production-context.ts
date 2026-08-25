/**
 * Shared harness for the `APP8-B03` Admin production suites.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason `admin-order-context.ts` records: the
 * checkpoint's claim is that three routes are protected by APP1's existing
 * guards, and a stubbed guard would only prove the handler runs once something
 * lets it. The authenticated cases present a real session cookie against a real
 * `admin_sessions` row; the refused ones send no cookie and are refused by the
 * code path production uses.
 *
 * ### Everything is seeded through a canonical writer where one exists
 *
 * Orders are created by `OrderRepository.createFromAcceptedQuotation` — the one
 * AGG-15 implementation, under GRD-009, inside a real transaction — so what B03
 * reads is an order the production writer actually wrote, with the
 * `orders.current_approval_snapshot_id` it actually sets. Production jobs the
 * *read* suites need are created through B03's own HTTP route, so the queue and
 * the detail are proved against rows the checkpoint itself produced.
 *
 * `payment_obligations` is seeded with raw SQL. That is deliberate: the DEPOSIT
 * obligation's satisfaction is APP7's lifecycle, driving it here would re-run a
 * neighbouring checkpoint's behaviour, and a B03 failure would become ambiguous.
 * What B03 must prove is that it consults the **one** deposit authority, and the
 * authority reads the row either way it was written.
 *
 * `OrderModule` appears in the testing module for that seeding only. The
 * production `AdminProductionModule` imports it nowhere — that is the boundary
 * keeping `ORDER_REPOSITORY` out of the production routes' injector — and the
 * contract suite asserts the three published operations are the only ones.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import { OrderModule } from '../../../order/order.module';
import { ORDER_REPOSITORY } from '../../../order/domain/repositories/order.repository';
import type {
  OrderId,
  OrderItem,
  OrderRepository,
} from '../../../order/domain/repositories/order.repository';
import { seedOrderChain } from '../../../order/tests/integration/order-fixture';
import type { OrderFixture } from '../../../order/tests/integration/order-fixture';
import { AdminProductionModule } from '../../admin-production.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** The catalog display copy `seedOrderChain`'s approval snapshot freezes. */
export const FROZEN_PRODUCT_NAME = 'Tee';
export const FROZEN_VARIANT_LABEL = 'Black / M';

const COP_DOC_HASH = `sha256:${'3'.repeat(64)}`;

export interface SeededOrder {
  readonly orderId: string;
  readonly code: string;
  readonly fixture: OrderFixture;
  /** The approval `orders.current_approval_snapshot_id` points at. */
  readonly approvalSnapshotId: string;
}

export interface SeedOrderOptions {
  readonly fixture?: OrderFixture;
  /** Defaults to a single Catalog line. */
  readonly items?: readonly OrderItem[];
  /** Overrides the order's approval; defaults to the fixture's Catalog one. */
  readonly approvalSnapshotId?: string;
  /** Seeds the DEPOSIT obligation as SATISFIED. Defaults to true. */
  readonly depositSatisfied?: boolean;
}

export interface AdminProductionTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  seedChain(suffix?: string): Promise<OrderFixture>;
  seedOrder(options?: SeedOrderOptions): Promise<SeededOrder>;
  /** Satisfies the order's DEPOSIT obligation, with the evidence CST demands. */
  satisfyDeposit(orderId: string, quotationVersionId: string): Promise<void>;
  /** A COP approval snapshot on the fixture's request — no Catalog placement. */
  seedCustomerOwnedApproval(fixture: OrderFixture): Promise<string>;
  /** A COP order line, so the order has no Catalog subject at all. */
  customerOwnedItem(customerOwnedProductId: string): OrderItem;
  renameLiveProduct(fixture: OrderFixture, name: string): Promise<void>;
  countRows(table: 'production_jobs' | 'production_specifications'): Promise<number>;
  close(): Promise<void>;
}

export async function createAdminProductionContext(
  label: string,
): Promise<AdminProductionTestContext> {
  const previous = { url: process.env['DATABASE_URL'], env: process.env['NODE_ENV'] };

  const disposable = await createDisposableDatabase(label);
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  let app: INestApplication;
  let orders: OrderRepository;
  let transactions: TransactionManager;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        AdminProductionModule,
        // Seeding only — see the file header.
        OrderModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
    orders = moduleRef.get<OrderRepository>(ORDER_REPOSITORY);
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
        values (${adminId}, ${`b03-${adminId}@example.test`}, 'B03 Operator', 'ACTIVE')
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

  /**
   * A DEPOSIT obligation in SATISFIED, with the evidence the schema demands.
   *
   * `ck_payment_obligations__satisfied_evidence_required` refuses a SATISFIED
   * row without both `satisfied_at` and `satisfied_by_attempt_id`, so the
   * succeeded attempt is written too — a three-statement seed rather than a
   * single one, because a shortcut here would be seeding a state the database
   * says cannot exist. What B03 must prove is that it consults the one deposit
   * authority; that authority reads `payment_obligations` however the row got
   * there, and driving APP7's verification lifecycle instead would make a B03
   * failure ambiguous.
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
    quantity: 25,
    unitPriceAmount: '100000.00',
    lineTotalAmount: '2500000.00',
  });

  const seedOrder: AdminProductionTestContext['seedOrder'] = async (options = {}) => {
    const fixture = options.fixture ?? (await seedOrderChain({ disposable }, newId().slice(0, 8)));
    const approvalSnapshotId = options.approvalSnapshotId ?? fixture.approvalSnapshotId;
    const orderId = newId() as OrderId;
    const code = `ORD-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await transactions.runInTransaction(() =>
      orders.createFromAcceptedQuotation({
        id: orderId,
        code,
        customRequestId: fixture.customRequestId,
        acceptedQuotationVersionId: fixture.quotationVersionId,
        approvalSnapshotId,
        items: options.items ?? [catalogItem(fixture)],
      }),
    );

    if (options.depositSatisfied !== false) {
      await satisfyDeposit(orderId, fixture.quotationVersionId);
    }

    return { orderId, code, fixture, approvalSnapshotId };
  };

  const seedCustomerOwnedApproval: AdminProductionTestContext['seedCustomerOwnedApproval'] = async (
    fixture,
  ) => {
    const customerOwnedProductId = newId();
    const designVersionId = newId();
    const approvalSnapshotId = newId();
    const name = 'Áo khoác của khách';

    await db.execute(sql`
      insert into customer_owned_products
             (id, custom_request_id, name, description, physical_width_mm, physical_height_mm)
      values (${customerOwnedProductId}, ${fixture.customRequestId}, ${name},
              'Khách tự mang tới', 300, 400)
    `);

    const [designCase] = (
      await db.execute<{ id: string }>(
        sql`select id from design_cases where custom_request_id = ${fixture.customRequestId} limit 1`,
      )
    ).rows;

    // The COP branch of `ck_design_versions__exactly_one_placement_branch`:
    // every Catalog placement column null, the customer-owned id set, and the
    // two placement labels present because the branch requires them.
    await db.execute(sql`
      insert into design_versions
        (id, design_case_id, version, status, design_document, document_schema_version,
         document_hash, customer_owned_product_id, placement_side_label, placement_area_label,
         physical_width_mm, physical_height_mm, sent_at, approved_at)
      values (${designVersionId}, ${designCase?.id ?? null}, 2, 'APPROVED', '{}'::jsonb, 1,
              ${COP_DOC_HASH}, ${customerOwnedProductId}, 'Mặt trước', 'Ngực trái',
              120.00, 80.00, now() - interval '1 hour', now())
    `);
    // The COP branch of `ck_approval_snapshots__exactly_one_placement_branch`.
    // `product_name` freezes the customer's own description of their item; no
    // Catalog identity is invented to give it something to point at (INV-13).
    await db.execute(sql`
      insert into approval_snapshots
        (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
         customer_owned_product_id, product_name, variant_label, side_name, area_name,
         physical_width_mm, physical_height_mm, quantity_total,
         grant_id, step_up_challenge_id, approved_at)
      values (${approvalSnapshotId}, ${designVersionId}, ${designCase?.id ?? null},
              ${fixture.customRequestId}, ${fixture.customerId}, ${COP_DOC_HASH},
              ${customerOwnedProductId}, ${name}, null, 'Mặt trước', 'Ngực trái',
              120.00, 80.00, 25, ${fixture.grantId}, ${fixture.challengeId}, now())
    `);

    return approvalSnapshotId;
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
    seedChain: (suffix = '1') => seedOrderChain({ disposable }, suffix),
    seedOrder,
    satisfyDeposit,
    seedCustomerOwnedApproval,
    customerOwnedItem: (customerOwnedProductId) => ({
      position: 1,
      skuId: undefined,
      customerOwnedProductId,
      productName: 'Áo khoác của khách',
      variantLabel: undefined,
      sizeLabel: undefined,
      quantity: 25,
      unitPriceAmount: '100000.00',
      lineTotalAmount: '2500000.00',
    }),
    renameLiveProduct: async (fixture, name) => {
      await db.execute(sql`update products set name = ${name} where id = ${fixture.productId}`);
    },
    countRows: async (table) => {
      const statement =
        table === 'production_jobs'
          ? sql`select count(*)::text as count from production_jobs`
          : sql`select count(*)::text as count from production_specifications`;
      const [row] = (await db.execute<{ count: string }>(statement)).rows;
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

/** The three canonical routes, under the global API prefix. */
export const ROUTES = {
  create: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/production-jobs`,
  queue: () => `/${GLOBAL_ROUTE_PREFIX}/admin/production-jobs`,
  detail: (jobId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/production-jobs/${jobId}`,
} as const;
