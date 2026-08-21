/**
 * Harness for the `APP6-B07` Admin submitted-design suite.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * the real `CustomRequestSubmittedDesignModule`, against one disposable
 * database. Nothing is overridden and no guard is stubbed: B07's defining claim
 * is that an operator reaches customer-private design evidence through APP1's
 * existing authentication and the request's own server-owned pointer, and that
 * is only observable through the code path production uses.
 *
 * Only that one module is booted. The suite must be able to say that the read
 * cannot mutate a request or a session, and a harness that also composed the
 * write modules would leave that claim resting on which route the test happened
 * to call rather than on what the injector holds.
 *
 * Raw SQL builds the world a request needs to exist in — an Admin session, a
 * customer, a catalog placement chain, a Design Session, a request. The Design
 * Session is seeded directly rather than opened through `APP3-B07` and submitted
 * through `APP5-B01`: what B07 owns is the read of a session already in the
 * `SUBMITTED` state, not how it reached it, and driving two other checkpoints'
 * routes would make this suite fail for their reasons.
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
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import { sql, type SQL } from 'drizzle-orm';

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
import { CustomRequestSubmittedDesignModule } from '../../custom-request-submitted-design.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/**
 * An obviously synthetic marker written into every seeded secret-bearing column
 * and storage key, so a test can search a whole response for it and prove it
 * never crossed.
 */
export const SECRET_MARKER = 'app6-b07-secret-marker';

/** A placement chain, seeded once per reset. Design Sessions need a real one. */
export interface SeededPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface SeedSessionOptions {
  readonly placement: SeededPlacement;
  /** LC-07 state. `SUBMITTED` is the only one that is submitted evidence. */
  readonly status?: string;
  /** The handover pointer the row carries back. */
  readonly submittedRequestId?: string;
  readonly document?: unknown;
  readonly documentSchemaVersion?: number;
  readonly revision?: number;
}

export interface SeedRequestOptions {
  readonly customerId: string;
  readonly status?: string;
  /** Present on the catalog branch only. */
  readonly placement?: SeededPlacement;
  /** The server-owned provenance pointer. Absent on every COP request. */
  readonly submittedSessionId?: string;
  readonly customerOwnedProductName?: string;
}

export interface SubmittedDesignTestContext {
  readonly app: INestApplication;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  seedCustomer(): Promise<string>;
  seedPlacement(): Promise<SeededPlacement>;
  seedSession(options: SeedSessionOptions): Promise<string>;
  seedRequest(options: SeedRequestOptions): Promise<string>;
  rows<T>(query: SQL): Promise<T[]>;
  count(query: SQL): Promise<number>;
  close(): Promise<void>;
}

export async function createSubmittedDesignContext(
  label: string,
): Promise<SubmittedDesignTestContext> {
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

  let app: INestApplication;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        CustomRequestSubmittedDesignModule,
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
  let adminCookie = '';

  const seedAdminSession = async (): Promise<string> => {
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b07-${adminId}@example.test`}, 'B07 Operator', 'ACTIVE')
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
    adminCookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
    return adminId;
  };

  const seedCustomer = async (): Promise<string> => {
    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Nguyễn Bảy', '2026-08-14T09:00:00.000Z')
    `);
    return customerId;
  };

  const seedPlacement = async (): Promise<SeededPlacement> => {
    const categoryId = newId();
    const productId = newId();
    const productVariantId = newId();
    const assetId = newId();
    const productSideId = newId();
    const embroideryAreaId = newId();

    await db.execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Áo', ${`ao-${categoryId.slice(0, 8)}`}, 1, 'PUBLISHED', true)
    `);
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Áo thun cotton',
              ${`ao-thun-${productId.slice(0, 8)}`}, '150000', 'VND',
              'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Trắng', 'L', 1, true)
    `);
    // The storage key carries the marker: a test asserts no response ever
    // contains it, and the placement's background asset is the nearest storage
    // key to the document being read.
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC',
              ${`catalog/${SECRET_MARKER}/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
    `);
    await db.execute(sql`
      insert into product_sides
        (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
         physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${productSideId}, ${productId}, 'front', 'Front', ${assetId},
              1000, 1200, 400, 480, 2.5, 1)
    `);
    await db.execute(sql`
      insert into embroidery_areas
        (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
         bound_height_px, display_order)
      values (${embroideryAreaId}, ${productSideId}, 'chest', 'Chest', 100, 150, 300, 200, 1)
    `);

    return { productId, productVariantId, productSideId, embroideryAreaId };
  };

  const seedSession = async (options: SeedSessionOptions): Promise<string> => {
    const sessionId = newId();
    const document = options.document ?? { schemaVersion: 1, elements: [] };
    await db.execute(sql`
      insert into design_sessions
        (id, session_secret_hash, product_id, product_variant_id, product_side_id,
         embroidery_area_id, design_document, document_schema_version, autosave_revision,
         status, expires_at, last_activity_at, submitted_request_id)
      values (${sessionId}, ${`${SECRET_MARKER}-${sessionId}`}, ${options.placement.productId},
              ${options.placement.productVariantId}, ${options.placement.productSideId},
              ${options.placement.embroideryAreaId}, ${JSON.stringify(document)}::jsonb,
              ${options.documentSchemaVersion ?? 1}, ${options.revision ?? 0},
              ${options.status ?? 'SUBMITTED'}, now() + interval '30 days', now(),
              ${options.submittedRequestId ?? null})
    `);
    return sessionId;
  };

  const seedRequest = async (options: SeedRequestOptions): Promise<string> => {
    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters and a
    // derived code collides on `uq_custom_requests__code`.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                   submitted_session_id)
      values (${requestId}, ${code}, ${options.customerId}, ${options.status ?? 'NEW'},
              ${options.placement?.productId ?? null},
              ${options.placement?.productVariantId ?? null},
              ${options.submittedSessionId ?? null})
    `);

    if (options.customerOwnedProductName !== undefined) {
      await db.execute(sql`
        insert into customer_owned_products (id, custom_request_id, name)
        values (${newId()}, ${requestId}, ${options.customerOwnedProductName})
      `);
    }
    return requestId;
  };

  return {
    app,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => adminCookie,
    reset: async () => {
      await truncateAllTables(db);
      adminCookie = '';
    },
    seedAdminSession,
    seedCustomer,
    seedPlacement,
    seedSession,
    seedRequest,
    rows: async <T>(query: SQL): Promise<T[]> => {
      const result = await db.execute(query);
      return result.rows as T[];
    },
    count: async (query: SQL): Promise<number> => {
      const result = await db.execute(query);
      const [row] = result.rows as { count: string }[];
      return Number(row?.count ?? '0');
    },
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

/** The envelope's `data`, typed. Supertest types `response.body` as `any`. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`. */
export function codeOf(response: { readonly body: unknown }): string | undefined {
  return (response.body as { readonly code?: string }).code;
}

/** The one canonical route, under the global API prefix. */
export const ROUTE = {
  submittedDesign: (requestId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/submitted-design`,
} as const;
