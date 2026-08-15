/**
 * Shared harness for the `APP4-B07` Admin support suites.
 *
 * Different in one deliberate way from every other APP4 integration context: it
 * boots a **real HTTP application with the real `AuthenticatedAdminGuard`**, and
 * overrides no guard at all.
 *
 * The delivered APP4 suites resolve use cases from a container, which is right
 * for capabilities with no HTTP surface. B07's defining claim is that three
 * routes are protected by APP1's existing guard, and a stubbed guard cannot
 * prove that — it proves the handler runs once something lets it. So these
 * suites present a real session cookie against a real `admin_sessions` row, and
 * the unauthenticated cases send no cookie and are refused by the same code path
 * production uses.
 *
 * `StaffOriginGuard` and `StaffJsonBodyGuard` are real too. Supertest sends no
 * `Origin`, which the APP1 policy treats as a non-browser caller and permits, so
 * the origin guard is genuinely exercised rather than bypassed.
 *
 * ### The fixtures are raw SQL, and why
 *
 * A grant needs a `custom_requests` row (NOT NULL, FK RESTRICT) and APP5 does
 * not exist, so the request half has no production creator — the same reason
 * `secure-grant-context.ts` records. The grants themselves are inserted directly
 * rather than minted through `SecureGrantIssuer`, because these suites need
 * states the issuer will not produce on demand: a physically `ACTIVE` row whose
 * `expires_at` has passed, an `EXPIRED` row, and a superseded pair. Issuing and
 * then mutating them would be the same SQL with more steps.
 *
 * `token_hash` is a synthetic, obviously-fake marker per grant — never a real
 * digest and never a token-shaped value. Its purpose is to be searched *for* in
 * responses and logs: a suite asserts it appears nowhere.
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
import { CustomerAdminSupportModule } from '../../customer-admin-support.module';
import {
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from '../../config/app4-secret-pepper.config';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** Deterministic synthetic contacts. Neither is a real address or number. */
export const FIXTURE_EMAIL = 'bay.nguyen@vidu-b07.test';
export const FIXTURE_PHONE = '+84912345678';
/**
 * The second customer's contacts.
 *
 * Both differ from the first's, and they have to: a *verified* contact is unique
 * on `(kind, normalized_value)` across all customers, so two customers cannot
 * share an address or a number. The constraint is the identity model — one
 * verified contact resolves to one customer (ADR-DB2-001 r5) — and a fixture
 * that violated it would be asserting cross-customer isolation on a pair of rows
 * production could never hold.
 */
export const SECOND_FIXTURE_EMAIL = 'chi.tran@vidu-b07.test';
export const SECOND_FIXTURE_PHONE = '+84987654321';

/** The masks `APP4-P01` produces for the two contacts above. */
export const FIXTURE_EMAIL_MASK = 'b***@vidu-b07.test';
export const FIXTURE_PHONE_MASK = '+84 ***** 5678';

export interface SeededGrant {
  readonly grantId: string;
  readonly customRequestId: string;
  readonly tokenHash: string;
}

export interface SeededCustomer {
  readonly customerId: string;
  readonly emailContactId: string;
  readonly phoneContactId: string;
}

export interface AdminSupportTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  /** The `Cookie` header value for a live Admin session. */
  readonly adminCookie: () => string;
  readonly adminId: () => string;
  reset(): Promise<void>;
  /** A verified customer with one primary EMAIL and one non-primary PHONE. */
  seedCustomer(options?: {
    readonly email?: string;
    readonly phone?: string;
  }): Promise<SeededCustomer>;
  /** One `custom_requests` row a grant may bind to. Fixture scaffolding. */
  seedRequest(customerId: string): Promise<string>;
  seedGrant(input: {
    readonly customerId: string;
    readonly customRequestId: string;
    readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    readonly expiresAt: Date;
    readonly marker: string;
    readonly revokeReason?: string;
  }): Promise<SeededGrant>;
  /** Creates a live Admin account and session; returns the cookie header. */
  seedAdminSession(): Promise<{ readonly adminId: string; readonly cookie: string }>;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

export async function createAdminSupportContext(label: string): Promise<AdminSupportTestContext> {
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
  // Synthetic, generated per run. A checked-in value would be a credential in
  // the repository whether or not anything real is sealed under it. B07 seals
  // nothing, but `CustomerModule` composes the notification seam either way.
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
        CustomerAdminSupportModule,
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
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b07-${adminId}@example.test`}, 'B07 Operator', 'ACTIVE')
    `);
    // A real 256-bit token, hashed exactly as `SessionTokenService` does, so the
    // guard's lookup is the production one. The raw value never leaves this
    // process and is not written anywhere but the request header.
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE', ${expiresAt})
    `);
    currentAdmin = { adminId, cookie: `${ADMIN_COOKIE_NAME}=${rawToken}` };
    return currentAdmin;
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
    seedCustomer: (options) =>
      seedCustomer(db, options?.email ?? FIXTURE_EMAIL, options?.phone ?? FIXTURE_PHONE),
    seedRequest: (customerId) => seedRequest(db, customerId),
    seedGrant: (input) => seedGrant(db, input),
    seedAdminSession,
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
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

type Db = DisposableDatabase['client']['db'];

/**
 * One verified customer with two contacts: a primary, verified EMAIL and a
 * non-primary, verified PHONE.
 *
 * Two kinds on one customer because the masking assertion needs both, and the
 * primary flag is only meaningful when something else could have carried it.
 */
async function seedCustomer(db: Db, email: string, phone: string): Promise<SeededCustomer> {
  const customerId = newId();
  const emailContactId = newId();
  const phoneContactId = newId();

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'B07 Customer', '2026-08-14T09:00:00.000Z')
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${emailContactId}, ${customerId}, 'EMAIL', ${email}, ${email}, true,
            '2026-08-14T09:00:00.000Z', 'OTP')
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${phoneContactId}, ${customerId}, 'PHONE', ${phone}, ${phone}, false,
            '2026-08-14T09:05:00.000Z', 'OTP')
  `);

  return { customerId, emailContactId, phoneContactId };
}

/** Fixture scaffolding — not an APP5 submission. See the file header. */
async function seedRequest(db: Db, customerId: string): Promise<string> {
  const customRequestId = newId();
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'NEW')
  `);
  return customRequestId;
}

async function seedGrant(
  db: Db,
  input: {
    readonly customerId: string;
    readonly customRequestId: string;
    readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    readonly expiresAt: Date;
    readonly marker: string;
    readonly revokeReason?: string;
  },
): Promise<SeededGrant> {
  const grantId = newId();
  // Obviously synthetic: not 43 base64url characters, not base64, not a digest
  // of anything. It exists to be searched for in responses and logs.
  const tokenHash = `fixture-digest-marker-${input.marker}`;
  const revokedAt = input.status === 'REVOKED' ? new Date().toISOString() : null;
  const revokeReason = input.status === 'REVOKED' ? (input.revokeReason ?? 'fixture') : null;

  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at,
       revoked_at, revoke_reason)
    values (${grantId}, ${input.customerId}, ${input.customRequestId}, ${tokenHash},
            'REQUEST_ACCESS', ${input.status}, ${input.expiresAt}, ${revokedAt}, ${revokeReason})
  `);

  return { grantId, customRequestId: input.customRequestId, tokenHash };
}

/**
 * The envelope's `data`, typed.
 *
 * Supertest types `response.body` as `any`, and letting that flow into an
 * assertion makes every member read unchecked — the assertions would still run,
 * but nothing would notice if the shape stopped being what it claims. Named here
 * so all three suites narrow at one boundary.
 */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The four canonical routes, under the global API prefix. */
export const ROUTES = {
  resolve: () => `/${GLOBAL_ROUTE_PREFIX}/admin/customers/resolve`,
  detail: (customerId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/customers/${customerId}`,
  grants: (customerId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/customers/${customerId}/grants`,
  revoke: (grantId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/secure-grants/${grantId}/revoke`,
} as const;
