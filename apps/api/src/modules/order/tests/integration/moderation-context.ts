/**
 * Shared harness for the `APP5-B05` Admin moderation suites.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`**, the
 * real moderation module, the real `APP5-B04` read module and the real
 * `APP5-B03` grant-scoped reader, all against one disposable database. Nothing
 * is overridden and no guard is stubbed: B05's defining claims are that the
 * operator is derived from an Admin session and that a moderation decision is
 * one transaction, and both are only observable through the code path production
 * uses.
 *
 * The three modules are booted together on purpose. `APP5-B05` §11 and §12 ask
 * for one read-after-write proof against B04 and one against B03, and a suite
 * that seeded those reads by hand would prove the fixture rather than the write.
 * They are separate module graphs sharing one database, exactly as the running
 * API composes them.
 *
 * Unlike the B04 harness, moderation evidence is **never** seeded by raw SQL:
 * the transitions and notes under test are produced by the routes under test.
 * Raw SQL here only builds the world a request needs to exist in — a customer, a
 * catalog product, an Admin session, an `ACTIVE` grant.
 *
 * The peppers and the envelope key are synthetic values generated per run and
 * set on `process.env` for the duration of the suite. No `.env` file is read,
 * written or consulted (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import {
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from '../../../customer/config/app4-secret-pepper.config';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import { ReadGrantScopedRequest } from '../../application/status/read-grant-scoped-request.query';
import { CustomRequestAdminModule } from '../../custom-request-admin.module';
import { CustomRequestModerationModule } from '../../custom-request-moderation.module';
import { CustomRequestStatusModule } from '../../custom-request-status.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/**
 * Synthetic peppers, 32+ characters and distinct from each other. Generated per
 * run so no value is ever committed, read from disk or shared between suites.
 */
const CODE_PEPPER = `app5-b05-code-${randomBytes(16).toString('hex')}`;
const LINK_PEPPER = `app5-b05-link-${randomBytes(16).toString('hex')}`;

export interface SeededModerationRequest {
  readonly requestId: string;
  readonly code: string;
  readonly customerId: string;
  /** The raw token of this request's `ACTIVE` `REQUEST_ACCESS` grant. */
  readonly grantToken: string;
}

export interface SeedModerationRequestOptions {
  readonly status?: string;
  readonly customerId?: string;
}

export interface ModerationTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  readonly adminId: () => string;
  get<T>(token: unknown): T;
  /** Runs `work` inside an async-local request context, for a direct B03 read. */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
  count(query: ReturnType<typeof sql>): Promise<number>;
  reset(): Promise<void>;
  seedAdminSession(): Promise<{ readonly adminId: string; readonly cookie: string }>;
  /** Publishes `secure_link.resolve` so the fail-closed policy read succeeds. */
  publishSecureLinkPolicy(): Promise<void>;
  seedRequest(options?: SeedModerationRequestOptions): Promise<SeededModerationRequest>;
  close(): Promise<void>;
}

export async function createModerationContext(label: string): Promise<ModerationTestContext> {
  const previous = {
    url: process.env['DATABASE_URL'],
    env: process.env['NODE_ENV'],
    envelope: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    codePepper: process.env[VERIFICATION_CODE_PEPPER_ENV],
    linkPepper: process.env[SECURE_LINK_TOKEN_PEPPER_ENV],
  };

  const disposable = await createDisposableDatabase(label);
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = randomBytes(32).toString('base64');
  process.env[VERIFICATION_CODE_PEPPER_ENV] = CODE_PEPPER;
  process.env[SECURE_LINK_TOKEN_PEPPER_ENV] = LINK_PEPPER;

  let app: INestApplication;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        CustomRequestModerationModule,
        CustomRequestAdminModule,
        CustomRequestStatusModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  const requestContext = app.get(RequestContextService);
  const transactions = app.get(TransactionManager);
  let currentAdmin = { adminId: '', cookie: '' };

  const seedAdminSession: ModerationTestContext['seedAdminSession'] = async () => {
    const adminId = newId();
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so the
    // suite mints exactly one per reset. Two would not be a bigger fixture; it
    // would be an invalid database.
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b05-${adminId}@example.test`}, 'B05 Operator', 'ACTIVE')
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
    currentAdmin = { adminId, cookie: `${ADMIN_COOKIE_NAME}=${rawToken}` };
    return currentAdmin;
  };

  /**
   * Publishes the abuse limit through the repository the reader reads it with,
   * rather than by hand-writing three rows and a pointer. A fixture that built
   * the pointer itself could publish a shape `currentValue` would not return.
   */
  const publishSecureLinkPolicy: ModerationTestContext['publishSecureLinkPolicy'] = async () => {
    const policies = app.get(PolicyConfigurationRepository);
    await requestContext.run({ requestId: `app5-b05-policy-${newId()}` }, () =>
      transactions.runInTransaction(async () => {
        await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP5-B05 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
          value: { maxRequestsPerIpPerMinute: 600 },
          valueSchemaVersion: 1,
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          createdByAdminId: currentAdmin.adminId,
          reason: 'APP5-B05 suite fixture.',
        });
      }),
    );
  };

  const seedRequest: ModerationTestContext['seedRequest'] = async (options = {}) => {
    let customerId = options.customerId;
    if (customerId === undefined) {
      customerId = newId();
      await db.execute(sql`
        insert into customers (id, display_name, verified_at)
        values (${customerId}, 'Nguyễn Bảy', '2026-08-14T09:00:00.000Z')
      `);
      const email = `bay.nguyen.${customerId.slice(0, 8)}@vidu-b05.test`;
      await db.execute(sql`
        insert into customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
           verified_at, verified_source)
        values (${newId()}, ${customerId}, 'EMAIL', ${email}, ${email}, true,
                '2026-08-14T09:00:00.000Z', 'OTP')
      `);
    }

    const categoryId = newId();
    const productId = newId();
    const productVariantId = newId();
    await db.execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Áo', ${`ao-${categoryId.slice(0, 8)}`}, 1, 'DRAFT', true)
    `);
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Áo thun cotton', ${`ao-thun-${productId.slice(0, 8)}`},
              '150000', 'VND', 'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Trắng', 'L', 1, true)
    `);

    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters and a
    // derived code collides on `uq_custom_requests__code`.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                   customer_note)
      values (${requestId}, ${code}, ${customerId}, ${options.status ?? 'NEW'},
              ${productId}, ${productVariantId}, 'Thêu tên lên ngực áo.')
    `);
    await db.execute(sql`
      insert into custom_request_quantity_breakdowns
             (id, custom_request_id, product_variant_id, size_label, quantity)
      values (${newId()}, ${requestId}, ${productVariantId}, 'L', 12)
    `);

    // A real `REQUEST_ACCESS` grant whose digest is computed with the same
    // peppered HMAC the resolver uses, so the B03 read below exercises the
    // production path rather than a stubbed comparison.
    const grantToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into secure_access_grants
        (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
      values (${newId()}, ${customerId}, ${requestId}, ${digestSecret(LINK_PEPPER, grantToken)},
              'REQUEST_ACCESS', 'ACTIVE', ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)})
    `);

    return { requestId, code, customerId, grantToken };
  };

  return {
    app,
    disposable,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => currentAdmin.cookie,
    adminId: () => currentAdmin.adminId,
    get: <T>(token: unknown): T => app.get<T>(token as never),
    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app5-b05-${newId()}` }, work),
    rows: async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> =>
      (await db.execute(query)).rows as T[],
    count: async (query: ReturnType<typeof sql>): Promise<number> => {
      const [row] = (await db.execute<{ count: string }>(query)).rows;
      return Number(row?.count ?? 0);
    },
    reset: async () => {
      await truncateAllTables(db);
      currentAdmin = { adminId: '', cookie: '' };
    },
    seedAdminSession,
    publishSecureLinkPolicy,
    seedRequest,
    close: async () => {
      await app.close();
      await disposable.drop();
      restore('DATABASE_URL', previous.url);
      restore('NODE_ENV', previous.env);
      restore(NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV, previous.envelope);
      restore(VERIFICATION_CODE_PEPPER_ENV, previous.codePepper);
      restore(SECURE_LINK_TOKEN_PEPPER_ENV, previous.linkPepper);
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

/** The envelope's stable business `code`. Top-level, per `APP0-B03`. */
export function codeOf(response: { readonly body: unknown }): string | undefined {
  return (response.body as { readonly code?: string }).code;
}

/** The B03 reader, resolved from the same application the mutations ran in. */
export function grantScopedReader(context: ModerationTestContext): ReadGrantScopedRequest {
  return context.get<ReadGrantScopedRequest>(ReadGrantScopedRequest);
}

/** The four routes this checkpoint touches, under the global API prefix. */
export const ROUTES = {
  notes: (requestId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/moderation-notes`,
  transitions: (requestId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/transitions`,
  detail: (requestId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}`,
} as const;
