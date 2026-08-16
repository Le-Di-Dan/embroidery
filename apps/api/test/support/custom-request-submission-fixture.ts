/**
 * Fixture for the `APP5-B01` submission suites.
 *
 * Everything a `TR-LC11-01` transaction needs and nothing it produces: a
 * verified customer with a primary contact, a live `SUBMISSION` challenge, a
 * published catalog chain, an `ACTIVE` design session whose cookie this fixture
 * can present, and accepted `CUSTOMER_UPLOAD` assets.
 *
 * Raw SQL, on the `design-fixture.ts` / `secure-link-fixture.ts` precedent: this
 * is **setup**, and routing it through five modules' APIs would make a failure
 * in any of them look like a submission failure. The rows under test — the
 * request, its COP child, its quantity lines, its bindings, the design case, the
 * grant and the outbox event — are created only by the endpoint.
 *
 * The design-session secret digest is stated **independently** here rather than
 * imported from `DesignSessionSecretVerifier`: a fixture that computes the
 * expected value with the function under test proves only that the function
 * equals itself.
 *
 * Test-only.
 */
import { createHmac, randomBytes } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import {
  buildDesignSessionCookieName,
  DESIGN_SESSION_COOKIE_PREFIX,
} from '../../src/modules/design/infrastructure/http/design-session-cookie.policy';
import { SECURE_GRANT_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-grant-policy';
import {
  DESIGN_SESSION_TEST_ORIGIN,
  type ApiIntegrationTestContext,
} from './api-integration-context';

export { DESIGN_SESSION_COOKIE_PREFIX };

/** The value `applyDesignSessionTestEnv` installs, restated so the digest matches. */
const DESIGN_SESSION_TEST_PEPPER = 'test-design-session-pepper-0123456789abcdef';

/** `APP4-G01`, as published. Restated by no production file. */
export const GRANT_POLICY = { standardTtlSeconds: 604_800, stepUpWindowSeconds: 900 };

/**
 * The APP4 secret environment a booted API needs before it can digest or seal.
 *
 * All three, because `loadApp4SecretPepperConfig` validates the pair *and* its
 * distinctness from the AEAD envelope key, and grant issuance seals an envelope.
 * Synthetic per-run values, never a checked-in literal: a fixed pepper in the
 * repository is credential material whether or not anything real is peppered
 * with it.
 */
export function applyApp5SubmissionSecretEnv(): () => void {
  const values = [
    ['SECURE_LINK_TOKEN_SECRET_PEPPER', `b01-link-${newId()}`],
    ['VERIFICATION_CODE_SECRET_PEPPER', `b01-code-${newId()}`],
    ['NOTIFICATION_DELIVERY_ENVELOPE_KEY', randomBytes(32).toString('base64')],
  ] as const;
  const previous = values.map(([name]) => [name, process.env[name]] as const);
  for (const [name, value] of values) process.env[name] = value;

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** The headers a browser sends on a same-origin mutating POST (`IMP-D043` PO-05). */
export const SAME_ORIGIN_HEADERS: Readonly<Record<string, string>> = {
  origin: DESIGN_SESSION_TEST_ORIGIN,
  'sec-fetch-site': 'same-origin',
};

export interface SubmissionFixture {
  readonly customerId: string;
  readonly contactPointId: string;
  readonly challengeId: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly designSessionId: string;
  /** The raw session secret, for the cookie. Never persisted. */
  readonly sessionSecret: string;
  readonly sessionCookie: string;
}

export interface SeedSubmissionOptions {
  readonly label: string;
  /** LC-02 state of the challenge. Defaults to a usable one. */
  readonly challengeStatus?: 'VERIFIED' | 'ISSUED' | 'EXPIRED';
  readonly challengePurpose?: 'SUBMISSION' | 'STEP_UP';
  /** Negative to seed an already-expired challenge. */
  readonly challengeExpiresInHours?: number;
  /** LC-07 state of the session. Defaults to a submittable one. */
  readonly sessionStatus?: 'ACTIVE' | 'SUBMITTED' | 'EXPIRED';
}

/** 43 base64url characters, exactly the form `isWellFormedSessionSecret` accepts. */
function mintSessionSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** `HMAC-SHA-256(pepper, secret)`, base64 — stated independently of production. */
export function expectedSessionDigest(secret: string): string {
  return createHmac('sha256', DESIGN_SESSION_TEST_PEPPER).update(secret, 'utf8').digest('base64');
}

/**
 * Seeds one complete submission context.
 *
 * Each call creates its own customer, challenge, catalog chain and session, so a
 * suite can hold several at once without CST-005 (one verified owner per
 * contact) or CST-007 (one open challenge per target) refusing the second.
 */
export async function seedSubmissionContext(
  database: DisposableDatabase,
  options: SeedSubmissionOptions,
): Promise<SubmissionFixture> {
  const db = database.client.db;
  const customerId = newId();
  const contactPointId = newId();
  const challengeId = newId();
  const categoryId = newId();
  const productId = newId();
  const productVariantId = newId();
  const productSideId = newId();
  const embroideryAreaId = newId();
  const backgroundAssetId = newId();
  const designSessionId = newId();
  const sessionSecret = mintSessionSecret();
  const contact = `b01-${options.label}-${customerId}@example.com`;

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${`B01 ${options.label}`}, now())
  `);
  // Primary and verified: `SecureGrantNotifier` refuses to deliver to any other
  // contact, so a non-primary one would fail issuance rather than the rule under
  // test.
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactPointId}, ${customerId}, 'EMAIL', ${contact}, ${contact}, true,
            now(), 'VERIFICATION_SUBMISSION')
  `);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status,
       expires_at, verified_at)
    values (${challengeId}, ${contactPointId}, 'EMAIL', ${contact},
            ${options.challengePurpose ?? 'SUBMISSION'}, 'code-hash',
            ${options.challengeStatus ?? 'VERIFIED'},
            now() + make_interval(hours => ${options.challengeExpiresInHours ?? 1}),
            ${(options.challengeStatus ?? 'VERIFIED') === 'VERIFIED' ? sql`now()` : sql`null`})
  `);

  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${backgroundAssetId}, 'CATALOG_MEDIA', 'PUBLIC',
            ${`catalog/${backgroundAssetId}.png`}, 'image/png', 1024, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${categoryId}, 'B01 Fixture', ${`b01-${categoryId}`}, 'PUBLISHED', 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, 'B01 Tee', ${`b01-tee-${productId}`}, 150000, 'VND',
            'PUBLISHED', false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${productVariantId}, ${productId}, 'Black', 'M', 1, true)
  `);
  await db.execute(sql`
    insert into product_sides
      (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
       physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values (${productSideId}, ${productId}, 'front', 'Front', ${backgroundAssetId},
            1000, 1200, 400, 480, 2.5, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px, bound_height_px,
       display_order)
    values (${embroideryAreaId}, ${productSideId}, 'chest', 'Chest', 100, 150, 300, 200, 1)
  `);
  await db.execute(sql`
    insert into design_sessions
      (id, session_secret_hash, product_id, product_variant_id, product_side_id,
       embroidery_area_id, design_document, document_schema_version, autosave_revision,
       status, expires_at, last_activity_at)
    values (${designSessionId}, ${expectedSessionDigest(sessionSecret)}, ${productId},
            ${productVariantId}, ${productSideId}, ${embroideryAreaId},
            ${JSON.stringify({ schemaVersion: 1, layers: [] })}, 1, 0,
            ${options.sessionStatus ?? 'ACTIVE'}, now() + interval '2 hours', now())
  `);

  return {
    customerId,
    contactPointId,
    challengeId,
    productId,
    productVariantId,
    productSideId,
    embroideryAreaId,
    designSessionId,
    sessionSecret,
    sessionCookie: `${buildDesignSessionCookieName(designSessionId)}=${sessionSecret}`,
  };
}

/** The one route `APP5-B01` publishes. */
export const SUBMIT_PATH = '/api/public/custom-requests';

export interface SubmissionEnvelope {
  readonly code?: string;
  readonly data?: { readonly requestId?: string; readonly code?: string; readonly status?: string };
}

export const submitted = (body: unknown): SubmissionEnvelope => body as SubmissionEnvelope;

/**
 * The request builders and row counters both B01 API suites use.
 *
 * Shared rather than copied because the two suites — what a submission *writes*,
 * and what it *refuses* — assert against the same route, the same envelope and
 * the same tables. Two copies of `post` is how one of them starts sending a
 * subtly different body and proving something else.
 */
/**
 * Declared as arrow-typed **properties**, not methods: a suite destructures this
 * object, and a method signature would make that an unbound-method error even
 * though nothing here touches `this`.
 */
export interface SubmissionHarness {
  readonly post: (
    fixture: SubmissionFixture,
    body: Record<string, unknown>,
    withCookie?: boolean,
  ) => ReturnType<ApiIntegrationTestContext['http']['post']>;
  readonly catalogBody: (
    fixture: SubmissionFixture,
    overrides?: Record<string, unknown>,
  ) => Record<string, unknown>;
  readonly countOf: (statement: ReturnType<typeof sql>) => Promise<number>;
  readonly requestCount: (customerId: string) => Promise<number>;
}

export function submissionHarness(read: () => ApiIntegrationTestContext): SubmissionHarness {
  const countOf = async (statement: ReturnType<typeof sql>): Promise<number> => {
    const rows = await read().database.client.db.execute<{ count: string }>(statement);
    return Number(rows.rows[0]?.count ?? 0);
  };

  return {
    post: (fixture, body, withCookie = true) => {
      const request = read().http.post(SUBMIT_PATH).set(SAME_ORIGIN_HEADERS);
      if (withCookie) {
        request.set('cookie', fixture.sessionCookie);
      }
      return request.send({ challengeId: fixture.challengeId, ...body });
    },
    catalogBody: (fixture, overrides = {}) => ({
      catalog: {
        productId: fixture.productId,
        productVariantId: fixture.productVariantId,
        designSessionId: fixture.designSessionId,
      },
      breakdown: [{ sizeLabel: 'M', quantity: 10 }],
      ...overrides,
    }),
    countOf,
    requestCount: (customerId) =>
      countOf(sql`select count(*) as count from custom_requests where customer_id = ${customerId}`),
  };
}

export interface SeedAssetOptions {
  readonly customerId: string;
  readonly kind?: string;
  readonly classification?: string;
  readonly status?: string;
  /** Omit to seed an asset with no customer provenance at all. */
  readonly withOwner?: boolean;
}

/** One customer upload in whichever eligibility state the case needs. */
export async function seedCustomerAsset(
  database: DisposableDatabase,
  options: SeedAssetOptions,
): Promise<string> {
  const assetId = newId();
  await database.client.db.execute(sql`
    insert into assets
      (id, kind, classification, storage_key, mime_type, size_bytes, status,
       uploaded_by_customer_id)
    values (${assetId}, ${options.kind ?? 'CUSTOMER_UPLOAD'},
            ${options.classification ?? 'CUSTOMER_PRIVATE'},
            ${`customer-private/${assetId}/original.jpg`}, 'image/jpeg', 20480,
            ${options.status ?? 'ACCEPTED'},
            ${options.withOwner === false ? null : options.customerId})
  `);
  return assetId;
}

/**
 * Publishes a policy value through its canonical versioned path — no shortcut.
 *
 * The two-table shape (`policy_configurations` plus an immutable version row
 * linked by `current_version_id`) is exactly what a hand-written insert gets
 * subtly wrong, and `SecureGrantPolicyReader` resolves through that link.
 */
export async function publishGrantPolicy(
  app: INestApplication,
  database: DisposableDatabase,
): Promise<void> {
  const adminId = await ensureAdmin(database);
  const policies = app.get(PolicyConfigurationRepository);
  await app.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP5-B01 integration fixture.');
    await policies.publishVersion({
      configKey: SECURE_GRANT_POLICY_KEY,
      value: GRANT_POLICY,
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP5-B01 integration fixture.',
    });
  });
}

/** `policy_configuration_versions.created_by_admin_id` is NOT NULL. */
async function ensureAdmin(database: DisposableDatabase): Promise<string> {
  const db = database.client.db;
  const existing = await db.execute<{ id: string }>(sql`select id from admin_accounts limit 1`);
  const found = existing.rows[0]?.id;
  if (found !== undefined) return found;

  const adminId = newId();
  await db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`b01-${adminId}@example.com`}, 'B01 Fixture', 'ACTIVE')
  `);
  return adminId;
}
