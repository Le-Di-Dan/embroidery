/**
 * Harness for the `APP6-B08` design-version authoring suite.
 *
 * Boots a **real HTTP application with the real guards** and the real
 * `DesignVersionAuthoringModule` against one disposable database. Nothing is
 * overridden and no guard is stubbed: B08's claims are about what the composed
 * injector can and cannot do, and that is only observable through the code path
 * production uses.
 *
 * Only that one module is booted, which is what lets the suite say the authoring
 * route cannot move a request: no route exists here that could, so a test
 * asserting the request's status is unchanged is testing the injector rather
 * than its own restraint.
 *
 * Raw SQL builds the world — an Admin session, a customer, a catalog placement
 * chain, a submitted Design Session, a request and its design case. The design
 * case is seeded directly rather than created through `APP5-B01`: what B08 owns
 * is authoring onto a case that already exists, not how it came to, and driving
 * another checkpoint's route would make this suite fail for its reasons.
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
import { DesignVersionAuthoringModule } from '../../design-version-authoring.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/**
 * The seeded Product Side geometry, mirrored here so a fixture document can
 * declare a placement snapshot that actually reconciles.
 *
 * `validatePlacementSnapshot` compares the document's five numbers against the
 * Side's, quantized-exact. Hard-coding them in one place is what keeps a
 * "placement matches" fixture from silently becoming a "placement mismatches"
 * one when the seed changes.
 */
export const SIDE_GEOMETRY = {
  canvasWidthPx: 1000,
  canvasHeightPx: 1200,
  physicalWidthMm: 400,
  physicalHeightMm: 480,
  pxPerMm: 2.5,
  /** The Embroidery Area rectangle, in document pixels. */
  areaXPx: 100,
  areaYPx: 150,
  areaWidthPx: 300,
  areaHeightPx: 200,
} as const;

export interface SeededPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface SeedSessionOptions {
  readonly placement: SeededPlacement;
  readonly status?: string;
  readonly submittedRequestId?: string;
}

export interface SeedRequestOptions {
  readonly customerId: string;
  readonly status?: string;
  /** Present on the catalog branch only. */
  readonly placement?: SeededPlacement;
  /** Omit the variant to reproduce an incomplete catalog subject. */
  readonly omitVariant?: boolean;
  readonly submittedSessionId?: string;
  /** Seeds a `customer_owned_products` row, making this the COP branch. */
  readonly customerOwnedProductName?: string;
  /** The item's own nullable dimensions — evidence, never the envelope. */
  readonly customerOwnedItemWidthMm?: string;
  readonly customerOwnedItemHeightMm?: string;
  /** Whether to create the design case and point the request at it. */
  readonly withDesignCase?: boolean;
}

export interface SeededRequest {
  readonly requestId: string;
  readonly designCaseId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
}

export interface DesignVersionTestContext {
  readonly app: INestApplication;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  seedCustomer(): Promise<string>;
  seedPlacement(): Promise<SeededPlacement>;
  seedSession(options: SeedSessionOptions): Promise<string>;
  seedRequest(options: SeedRequestOptions): Promise<SeededRequest>;
  rows<T>(query: SQL): Promise<T[]>;
  count(query: SQL): Promise<number>;
  close(): Promise<void>;
}

export async function createDesignVersionContext(label: string): Promise<DesignVersionTestContext> {
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
        DesignVersionAuthoringModule,
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
      values (${adminId}, ${`b08-${adminId}@example.test`}, 'B08 Operator', 'ACTIVE')
    `);
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
      values (${customerId}, 'Nguyễn Tám', '2026-08-14T09:00:00.000Z')
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
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC',
              ${`catalog/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
    `);
    await db.execute(sql`
      insert into product_sides
        (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
         physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${productSideId}, ${productId}, 'front', 'Front', ${assetId},
              ${SIDE_GEOMETRY.canvasWidthPx}, ${SIDE_GEOMETRY.canvasHeightPx},
              ${SIDE_GEOMETRY.physicalWidthMm}, ${SIDE_GEOMETRY.physicalHeightMm},
              ${SIDE_GEOMETRY.pxPerMm}, 1)
    `);
    await db.execute(sql`
      insert into embroidery_areas
        (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
         bound_height_px, display_order)
      values (${embroideryAreaId}, ${productSideId}, 'chest', 'Chest',
              ${SIDE_GEOMETRY.areaXPx}, ${SIDE_GEOMETRY.areaYPx},
              ${SIDE_GEOMETRY.areaWidthPx}, ${SIDE_GEOMETRY.areaHeightPx}, 1)
    `);

    return { productId, productVariantId, productSideId, embroideryAreaId };
  };

  const seedSession = async (options: SeedSessionOptions): Promise<string> => {
    const sessionId = newId();
    await db.execute(sql`
      insert into design_sessions
        (id, session_secret_hash, product_id, product_variant_id, product_side_id,
         embroidery_area_id, design_document, document_schema_version, autosave_revision,
         status, expires_at, last_activity_at, submitted_request_id)
      values (${sessionId}, ${`hash-${sessionId}`}, ${options.placement.productId},
              ${options.placement.productVariantId}, ${options.placement.productSideId},
              ${options.placement.embroideryAreaId}, ${JSON.stringify({ schemaVersion: 1, elements: [] })}::jsonb,
              1, 0, ${options.status ?? 'SUBMITTED'}, now() + interval '30 days', now(),
              ${options.submittedRequestId ?? null})
    `);
    return sessionId;
  };

  const seedRequest = async (options: SeedRequestOptions): Promise<SeededRequest> => {
    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters and a
    // derived code collides on `uq_custom_requests__code`.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                   submitted_session_id)
      values (${requestId}, ${code}, ${options.customerId}, ${options.status ?? 'DIGITIZING'},
              ${options.placement?.productId ?? null},
              ${options.omitVariant === true ? null : (options.placement?.productVariantId ?? null)},
              ${options.submittedSessionId ?? null})
    `);

    let customerOwnedProductId: string | undefined;
    if (options.customerOwnedProductName !== undefined) {
      customerOwnedProductId = newId();
      await db.execute(sql`
        insert into customer_owned_products
          (id, custom_request_id, name, physical_width_mm, physical_height_mm)
        values (${customerOwnedProductId}, ${requestId}, ${options.customerOwnedProductName},
                ${options.customerOwnedItemWidthMm ?? null},
                ${options.customerOwnedItemHeightMm ?? null})
      `);
    }

    let designCaseId: string | undefined;
    if (options.withDesignCase !== false) {
      designCaseId = newId();
      await db.execute(sql`
        insert into design_cases (id, custom_request_id) values (${designCaseId}, ${requestId})
      `);
      await db.execute(sql`
        update custom_requests set current_design_case_id = ${designCaseId} where id = ${requestId}
      `);
    }

    return { requestId, designCaseId, customerOwnedProductId };
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

/** A v1 Catalog document whose placement snapshot reconciles with the seed. */
export function catalogDocument(placement: SeededPlacement, elements: unknown[] = []): unknown {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: placement.productSideId,
      embroideryAreaId: placement.embroideryAreaId,
      canvasWidthPx: SIDE_GEOMETRY.canvasWidthPx,
      canvasHeightPx: SIDE_GEOMETRY.canvasHeightPx,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
      pxPerMm: SIDE_GEOMETRY.pxPerMm,
    },
    elements,
  };
}

/**
 * A v2 customer-owned document whose canvas *is* the envelope.
 *
 * `pxPerMm` is 1 so the millimetre envelope and the pixel canvas are the same
 * numbers — the arithmetic is not what these tests are about, and a scale factor
 * would only make an assertion failure harder to read.
 */
export function customerOwnedDocument(
  widthMm: number,
  heightMm: number,
  elements: unknown[] = [],
): unknown {
  return {
    schemaVersion: 2,
    placement: {
      productSideId: null,
      embroideryAreaId: null,
      canvasWidthPx: widthMm,
      canvasHeightPx: heightMm,
      physicalWidthMm: widthMm,
      physicalHeightMm: heightMm,
      pxPerMm: 1,
    },
    elements,
  };
}

/**
 * A minimal shape element at an explicit position.
 *
 * The field names are P01's own (`visible`, `fill`, `stroke`), not a paraphrase:
 * the root validator rejects unknown keys, so a fixture that guessed them would
 * fail as "malformed document" and prove nothing about the branch under test.
 */
export function shapeAt(id: string, x: number, y: number, width: number, height: number): unknown {
  return {
    id,
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x, y, width, height, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    shape: 'rectangle',
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidthPx: 2,
  };
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
  designVersions: (requestId: string): string =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/design-versions`,
} as const;
