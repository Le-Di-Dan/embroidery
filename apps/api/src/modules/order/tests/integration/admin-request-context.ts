/**
 * Shared harness for the `APP5-B04` Admin request suites.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason `admin-support-context.ts` records: B04's
 * defining claim is that two routes are protected by APP1's existing guard, and
 * a stubbed guard would only prove the handler runs once something lets it. The
 * authenticated cases present a real session cookie against a real
 * `admin_sessions` row; the refused ones send no cookie, or a token no session
 * was ever minted for, and are refused by the code path production uses.
 *
 * The fixtures are raw SQL because the states B04 reports on are written by
 * checkpoints that do not exist yet: `APP5-B05` owns transitions and moderation
 * notes, so a suite that insisted on producing them through a use case could not
 * test the read at all. Every seeded row satisfies the real constraints — a
 * revoked-style state is never faked by writing a status without its evidence.
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
import type { TestingModule } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import {
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from '../../../customer/config/app4-secret-pepper.config';
import { CustomRequestAdminModule } from '../../custom-request-admin.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** Deterministic synthetic contacts. Neither is a real address or number. */
export const FIXTURE_EMAIL = 'bay.nguyen@vidu-b04.test';
export const FIXTURE_PHONE = '+84912345678';
/** `APP4-P01`'s masks for the two values above. */
export const FIXTURE_EMAIL_MASK = 'b***@vidu-b04.test';
export const FIXTURE_PHONE_MASK = '+84 ***** 5678';

/**
 * An obviously synthetic marker written into every seeded secret-bearing
 * column, so a suite can search a response for it and prove it never crossed.
 */
export const SECRET_MARKER = 'app5-b04-secret-marker';

export interface SeededCatalogSubject {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productName: string;
  readonly productSlug: string;
}

export interface SeedRequestOptions {
  readonly customerId: string;
  readonly status?: string;
  readonly createdAt?: string;
  readonly catalog?: { readonly productId: string; readonly productVariantId: string };
  readonly designSessionId?: string;
  readonly customerNote?: string;
  readonly customerOwnedProduct?: {
    readonly name: string;
    readonly description?: string;
    readonly physicalWidthMm?: string;
    readonly physicalHeightMm?: string;
  };
  readonly quantities?: readonly {
    readonly productVariantId?: string;
    readonly sizeLabel?: string;
    readonly quantity: number;
  }[];
  readonly assets?: readonly { readonly role: string }[];
  readonly cancelledReason?: string;
  readonly cancelledCustomerReason?: string;
}

export interface SeededRequest {
  readonly requestId: string;
  readonly code: string;
  readonly customerId: string;
  readonly assetIds: readonly string[];
}

export interface AdminRequestTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  readonly adminId: () => string;
  reset(): Promise<void>;
  /** Creates the suite's single ACTIVE Admin account and a live session. */
  seedAdminSession(): Promise<{ readonly adminId: string; readonly cookie: string }>;
  seedCustomer(options?: {
    readonly email?: string;
    readonly phone?: string;
    readonly displayName?: string;
  }): Promise<string>;
  seedCatalogSubject(): Promise<SeededCatalogSubject>;
  seedRequest(options: SeedRequestOptions): Promise<SeededRequest>;
  /** Appends one TBL-042 row and moves the request, as `APP5-B05` will. */
  recordTransition(input: {
    readonly requestId: string;
    readonly from: string;
    readonly to: string;
    readonly reason?: string;
    readonly customerVisibleReason?: string;
  }): Promise<void>;
  /** Appends one TBL-041 note, as `APP5-B05` will. */
  recordModerationNote(input: {
    readonly requestId: string;
    readonly kind: string;
    readonly note: string;
  }): Promise<void>;
  /** One `secure_access_grants` row whose digest carries {@link SECRET_MARKER}. */
  seedGrant(input: { readonly customerId: string; readonly requestId: string }): Promise<string>;
  close(): Promise<void>;
}

export async function createAdminRequestContext(label: string): Promise<AdminRequestTestContext> {
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
  process.env[VERIFICATION_CODE_PEPPER_ENV] = `code-${randomBytes(24).toString('hex')}`;
  process.env[SECURE_LINK_TOKEN_PEPPER_ENV] = `link-${randomBytes(24).toString('hex')}`;

  let moduleRef: TestingModule;
  let app: INestApplication;
  try {
    moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        CustomRequestAdminModule,
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
  let currentAdmin = { adminId: '', cookie: '' };

  const seedAdminSession = async (): Promise<{ adminId: string; cookie: string }> => {
    const adminId = newId();
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so the
    // suite mints exactly one per reset. Two would not be a bigger fixture; it
    // would be an invalid database.
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b04-${adminId}@example.test`}, 'B04 Operator', 'ACTIVE')
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

  const seedCustomer: AdminRequestTestContext['seedCustomer'] = async (options = {}) => {
    const customerId = newId();
    const email = options.email ?? FIXTURE_EMAIL;
    const phone = options.phone ?? FIXTURE_PHONE;
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, ${options.displayName ?? 'Nguyễn Bảy'}, '2026-08-14T09:00:00.000Z')
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
         verified_at, verified_source)
      values (${newId()}, ${customerId}, 'EMAIL', ${email}, ${email}, true,
              '2026-08-14T09:00:00.000Z', 'OTP')
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
         verified_at, verified_source)
      values (${newId()}, ${customerId}, 'PHONE', ${phone}, ${phone}, false,
              '2026-08-14T09:05:00.000Z', 'OTP')
    `);
    return customerId;
  };

  const seedCatalogSubject: AdminRequestTestContext['seedCatalogSubject'] = async () => {
    const categoryId = newId();
    const productId = newId();
    const productVariantId = newId();
    const slug = `ao-thun-${productId.slice(0, 8)}`;

    await db.execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Áo', ${`ao-${categoryId.slice(0, 8)}`}, 1, 'DRAFT', true)
    `);
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Áo thun cotton', ${slug}, '150000', 'VND',
              'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Trắng', 'L', 1, true)
    `);

    return { productId, productVariantId, productName: 'Áo thun cotton', productSlug: slug };
  };

  const seedRequest: AdminRequestTestContext['seedRequest'] = async (options) => {
    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters and a
    // derived code collides on `uq_custom_requests__code`.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                   customer_note, submitted_session_id,
                                   cancelled_reason, cancelled_customer_reason, created_at)
      values (${requestId}, ${code}, ${options.customerId}, ${options.status ?? 'NEW'},
              ${options.catalog?.productId ?? null}, ${options.catalog?.productVariantId ?? null},
              ${options.customerNote ?? null}, ${options.designSessionId ?? null},
              ${options.cancelledReason ?? null}, ${options.cancelledCustomerReason ?? null},
              ${options.createdAt ?? new Date().toISOString()})
    `);

    if (options.customerOwnedProduct !== undefined) {
      const cop = options.customerOwnedProduct;
      await db.execute(sql`
        insert into customer_owned_products (id, custom_request_id, name, description,
                                             physical_width_mm, physical_height_mm)
        values (${newId()}, ${requestId}, ${cop.name}, ${cop.description ?? null},
                ${cop.physicalWidthMm ?? null}, ${cop.physicalHeightMm ?? null})
      `);
    }

    for (const line of options.quantities ?? []) {
      await db.execute(sql`
        insert into custom_request_quantity_breakdowns
               (id, custom_request_id, product_variant_id, size_label, quantity)
        values (${newId()}, ${requestId}, ${line.productVariantId ?? null},
                ${line.sizeLabel ?? null}, ${line.quantity})
      `);
    }

    const assetIds: string[] = [];
    for (const asset of options.assets ?? []) {
      const assetId = newId();
      // The storage key carries the marker: a suite asserts no response and no
      // schema ever contains it.
      await db.execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                            checksum, status, uploaded_by_customer_id)
        values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
                ${`private/${SECRET_MARKER}/${assetId}.png`}, 'image/png', 2048,
                ${`sha256:${'a'.repeat(64)}`}, 'ACCEPTED', ${options.customerId})
      `);
      await db.execute(sql`
        insert into custom_request_assets (id, custom_request_id, asset_id, role)
        values (${newId()}, ${requestId}, ${assetId}, ${asset.role})
      `);
      assetIds.push(assetId);
    }

    return { requestId, code, customerId: options.customerId, assetIds };
  };

  const recordTransition: AdminRequestTestContext['recordTransition'] = async (input) => {
    await db.execute(sql`
      insert into custom_request_transitions
             (custom_request_id, from_status, to_status, actor_kind, admin_id, reason,
              customer_visible_reason, correlation_id)
      values (${input.requestId}, ${input.from}, ${input.to}, 'ADMIN', ${currentAdmin.adminId},
              ${input.reason ?? null}, ${input.customerVisibleReason ?? null},
              ${`corr-${SECRET_MARKER}-${newId()}`})
    `);
    await db.execute(sql`
      update custom_requests set status = ${input.to} where id = ${input.requestId}
    `);
  };

  const recordModerationNote: AdminRequestTestContext['recordModerationNote'] = async (input) => {
    await db.execute(sql`
      insert into request_moderation_notes (custom_request_id, kind, note, admin_id)
      values (${input.requestId}, ${input.kind}, ${input.note}, ${currentAdmin.adminId})
    `);
  };

  const seedGrant: AdminRequestTestContext['seedGrant'] = async (input) => {
    const grantId = newId();
    await db.execute(sql`
      insert into secure_access_grants
        (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
      values (${grantId}, ${input.customerId}, ${input.requestId},
              ${`digest-${SECRET_MARKER}-${grantId}`}, 'REQUEST_ACCESS', 'ACTIVE',
              ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)})
    `);
    return grantId;
  };

  return {
    app,
    disposable,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => currentAdmin.cookie,
    adminId: () => currentAdmin.adminId,
    reset: async () => {
      await truncateAllTables(db);
      currentAdmin = { adminId: '', cookie: '' };
    },
    seedAdminSession,
    seedCustomer,
    seedCatalogSubject,
    seedRequest,
    recordTransition,
    recordModerationNote,
    seedGrant,
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

/** The two canonical routes, under the global API prefix. */
export const ROUTES = {
  queue: () => `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests`,
  detail: (requestId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}`,
} as const;
