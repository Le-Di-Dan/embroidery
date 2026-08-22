/**
 * Shared harness for the `APP7-B02` Admin order suites.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason `admin-request-context.ts` records: B02's
 * defining claim is that two routes are protected by APP1's existing guard, and
 * a stubbed guard would only prove the handler runs once something lets it. The
 * authenticated cases present a real session cookie against a real
 * `admin_sessions` row; the refused ones send no cookie, or a token no session
 * was ever minted for, and are refused by the code path production uses.
 *
 * ### Orders are created by the canonical writer, not by raw SQL
 *
 * The fixture seeds the chain — customer, request, accepted quotation version,
 * design case, approved version, approval snapshot — with `seedOrderChain`, the
 * delivered AGG-15 fixture, and then creates the order through
 * `OrderRepository.createFromAcceptedQuotation`: the one implementation
 * `APP7-W01-C1` consolidated into `@embroidery/persistence`, under GRD-009 and
 * inside a real transaction. So what B02 reads back is an order the production
 * writer actually wrote, with the `order_items` columns it actually freezes.
 *
 * It does **not** run the `APP7-W01` worker. The conversion job is W01's
 * behaviour and re-running it here would make a B02 failure ambiguous; the
 * canonical repository is the seam both share.
 *
 * `OrderModule` appears in the testing module for that seeding only. The
 * production `AdminOrderModule` imports it nowhere — that is the boundary that
 * keeps `ORDER_REPOSITORY` out of the read routes' injector — and the suites
 * assert the two published operations are the only ones that exist.
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
import { AdminOrderModule } from '../../admin-order.module';
import { OrderModule } from '../../order.module';
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

/** The catalog display copy `seedOrderChain`'s approval snapshot freezes. */
export const FROZEN_PRODUCT_NAME = 'Tee';
export const FROZEN_VARIANT_LABEL = 'Black / M';

export interface SeededOrder {
  readonly orderId: string;
  readonly code: string;
  readonly fixture: OrderFixture;
}

export interface SeedOrderOptions {
  /** Reuses an already-seeded chain instead of creating another one. */
  readonly fixture?: OrderFixture;
  /** Defaults to a single catalog line. */
  readonly items?: readonly OrderItem[];
  /** Overrides `orders.created_at` after creation, for deterministic paging. */
  readonly createdAt?: string;
  /** A legal LC-14 move applied after creation, for the status filter. */
  readonly status?: 'DEPOSIT_PAID';
}

export interface SeededCustomerOwnedSubject {
  readonly fixture: OrderFixture;
  readonly customerOwnedProductId: string;
  readonly approvalSnapshotId: string;
  readonly name: string;
}

export interface AdminOrderTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  /** Creates the suite's single ACTIVE Admin account and a live session. */
  seedAdminSession(): Promise<string>;
  /** One complete order-ready chain (customer → accepted quote → approval). */
  seedChain(suffix?: string): Promise<OrderFixture>;
  /** Creates one order through the canonical AGG-15 writer. */
  seedOrder(options?: SeedOrderOptions): Promise<SeededOrder>;
  /**
   * A customer-owned chain: a COP row for the fixture's request, a COP design
   * version and a COP approval snapshot, with no Catalog placement at all.
   */
  seedCustomerOwnedSubject(fixture: OrderFixture): Promise<SeededCustomerOwnedSubject>;
  /** Renames the live Catalog product the fixture froze its copy from. */
  renameLiveProduct(fixture: OrderFixture, name: string): Promise<void>;
  close(): Promise<void>;
}

const DOC_HASH = `sha256:${'2'.repeat(64)}`;

export async function createAdminOrderContext(label: string): Promise<AdminOrderTestContext> {
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
        AdminOrderModule,
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
    const adminId = newId();
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so the
    // suite mints exactly one per reset. `seedOrderChain` reuses it rather than
    // trying to create a second.
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b02-${adminId}@example.test`}, 'B02 Operator', 'ACTIVE')
    `);
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
    productName: FROZEN_PRODUCT_NAME,
    variantLabel: FROZEN_VARIANT_LABEL,
    // Null on both branches, exactly as `APP7-W01`'s projection writes it: the
    // Approval Snapshot has no size column and live `product_variants` is off
    // limits, so a column with no frozen source stays null.
    sizeLabel: undefined,
    quantity: 25,
    unitPriceAmount: '100000.00',
    lineTotalAmount: '2500000.00',
  });

  const seedOrder: AdminOrderTestContext['seedOrder'] = async (options = {}) => {
    const fixture = options.fixture ?? (await seedOrderChain({ disposable }, newId().slice(0, 8)));
    const orderId = newId() as OrderId;
    const code = `ORD-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await transactions.runInTransaction(() =>
      orders.createFromAcceptedQuotation({
        id: orderId,
        code,
        customRequestId: fixture.customRequestId,
        acceptedQuotationVersionId: fixture.quotationVersionId,
        approvalSnapshotId: fixture.approvalSnapshotId,
        items: options.items ?? [catalogItem(fixture)],
      }),
    );

    if (options.createdAt !== undefined) {
      await db.execute(sql`
        update orders set created_at = ${options.createdAt} where id = ${orderId}
      `);
    }
    if (options.status !== undefined) {
      await transactions.runInTransaction(() =>
        orders.transition({
          id: orderId,
          to: options.status as 'DEPOSIT_PAID',
          actor: { kind: 'SYSTEM', systemJobKey: 'app7-b02-fixture' },
          correlationId: newId(),
        }),
      );
    }

    return { orderId, code, fixture };
  };

  const seedCustomerOwnedSubject: AdminOrderTestContext['seedCustomerOwnedSubject'] = async (
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

    // The COP branch of `ck_design_versions__exactly_one_placement_branch`:
    // every Catalog placement column null, the customer-owned id set, and the
    // two placement labels present because the branch requires them.
    const [designCase] = (
      await db.execute<{ id: string }>(
        sql`select id from design_cases where custom_request_id = ${fixture.customRequestId} limit 1`,
      )
    ).rows;

    await db.execute(sql`
      insert into design_versions
        (id, design_case_id, version, status, design_document, document_schema_version,
         document_hash, customer_owned_product_id, placement_side_label, placement_area_label,
         physical_width_mm, physical_height_mm, sent_at, approved_at)
      values (${designVersionId}, ${designCase?.id ?? null}, 2, 'APPROVED', '{}'::jsonb, 1,
              ${DOC_HASH}, ${customerOwnedProductId}, 'Mặt trước', 'Ngực trái',
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
              ${fixture.customRequestId}, ${fixture.customerId}, ${DOC_HASH},
              ${customerOwnedProductId}, ${name}, null, 'Mặt trước', 'Ngực trái',
              120.00, 80.00, 25, ${fixture.grantId}, ${fixture.challengeId}, now())
    `);

    return { fixture, customerOwnedProductId, approvalSnapshotId, name };
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
    seedCustomerOwnedSubject,
    renameLiveProduct: async (fixture, name) => {
      await db.execute(sql`update products set name = ${name} where id = ${fixture.productId}`);
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

/**
 * The envelope's `data`, typed.
 *
 * Supertest types `response.body` as `any`, and letting that flow into an
 * assertion makes every member read unchecked. Narrowed here, at one boundary.
 */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The two canonical routes, under the global API prefix. */
export const ROUTES = {
  queue: () => `/${GLOBAL_ROUTE_PREFIX}/admin/orders`,
  detail: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}`,
} as const;
