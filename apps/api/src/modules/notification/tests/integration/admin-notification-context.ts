/**
 * Shared harness for the `APP4-B08` Admin notification suites.
 *
 * Boots a real HTTP application with the **real** `AuthenticatedAdminGuard` and
 * overrides no guard, exactly as `APP4-B07`'s harness does: B08's first claim is
 * that two routes are protected by APP1's guard, and a stubbed guard proves only
 * that something let the handler run.
 *
 * ### The terminal delivery fixture is built by the production path
 *
 * A hand-written envelope would prove that B08 can copy a JSON object this file
 * invented. So the fixture reaches its terminal state the way production does:
 * `RequestNotificationUseCase` seals a real AES-GCM envelope and appends a real
 * `PENDING` outbox event, the repository records real delivery attempts, and
 * `markFailed` / `markDeadLetter` — the same methods `APP4-W01` calls on
 * exhaustion — move both records to terminal. Nothing here writes a status
 * column directly.
 *
 * The one override is {@link FakeNotificationClock}, so a suite can prove "this
 * challenge expired one second ago refuses the replay" without waiting ten
 * minutes. Nothing else in the replay path reads a wall clock.
 *
 * The envelope key and both peppers are synthetic and generated per run. A
 * checked-in value would be a credential in the repository whether or not
 * anything real is sealed under it.
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
import { OutboxEventStore, TransactionManager } from '@embroidery/persistence';
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
import { NotificationAdminModule } from '../../notification-admin.module';
import { RequestNotificationUseCase } from '../../application/request-notification.use-case';
import { NotificationClock } from '../../infrastructure/clock/notification-clock';
import {
  NOTIFICATION_INTENT_REPOSITORY,
  type IntentId,
  type NotificationIntentRepository,
} from '../../domain/repositories/notification-intent.repository';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** Deterministic synthetic fixtures. Neither is a real address or number. */
export const FIXTURE_EMAIL = 'thu.pham@vidu-b08.test';
export const FIXTURE_EMAIL_MASK = 't***@vidu-b08.test';

/**
 * The deterministic plaintext secrets the fixtures seal.
 *
 * Obviously synthetic and never a real credential. They exist to be searched
 * *for*: a suite asserts they appear in no response, no audit row, no new intent
 * and no outbox column outside the copied ciphertext.
 */
export const FIXTURE_CODE = '424242';
export const FIXTURE_TOKEN = 'b08-fixture-token'.padEnd(43, 'x');

/** A clock a suite advances by hand. */
export class FakeNotificationClock extends NotificationClock {
  private current = new Date('2026-08-15T09:00:00.000Z');

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date): void {
    this.current = instant;
  }
}

export interface TerminalDeliveryFixture {
  readonly intentId: IntentId;
  readonly outboxEventId: bigint;
  /** The sealed payload as persisted, for byte-comparison against the replay. */
  readonly payload: Record<string, unknown>;
  readonly payloadSchemaVersion: number;
}

export interface AdminNotificationTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly clock: FakeNotificationClock;
  readonly adminCookie: () => string;
  readonly adminId: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<{ readonly adminId: string; readonly cookie: string }>;
  /** A verified customer and its primary EMAIL contact. */
  seedCustomer(): Promise<{ readonly customerId: string; readonly contactPointId: string }>;
  /** A challenge in the given state. Defaults to a live `ISSUED` one. */
  seedChallenge(options?: { readonly status?: string; readonly expiresAt?: Date }): Promise<string>;
  /** A grant in the given state, with its scaffolding request. */
  seedGrant(options?: { readonly status?: string; readonly expiresAt?: Date }): Promise<string>;
  /**
   * A notification that reached terminal transport failure, through the real
   * intake, attempt-recording and settle path.
   */
  seedTerminalDelivery(input: {
    readonly reference:
      | { readonly kind: 'VERIFICATION_CHALLENGE'; readonly challengeId: string }
      | { readonly kind: 'SECURE_ACCESS_GRANT'; readonly grantId: string };
    readonly secret: string;
    readonly secretKind: 'VERIFICATION_CODE' | 'SECURE_LINK_TOKEN';
    readonly templateKey?: string;
    /**
     * The owning contact point, passed through the **real** intake
     * (`APP4-A01-C1`) rather than written to the column afterwards.
     *
     * B05 supplies this in production; here it lets a replay suite start from a
     * genuinely bound origin without reaching into `notification_intents`.
     */
    readonly recipientContactPointId?: string;
    /** Omit to leave the intent PENDING and the event PENDING. */
    readonly terminal?: boolean;
    /** Marks the intent SATISFIED instead of FAILED. */
    readonly satisfied?: boolean;
  }): Promise<TerminalDeliveryFixture>;
  get<T>(token: unknown): T;
  inRequest<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createAdminNotificationContext(
  label: string,
): Promise<AdminNotificationTestContext> {
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

  const clock = new FakeNotificationClock();

  let moduleRef: TestingModule;
  let app: INestApplication;
  try {
    moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        NotificationAdminModule,
      ],
    })
      .overrideProvider(NotificationClock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  const intake = moduleRef.get(RequestNotificationUseCase);
  const intents = moduleRef.get<NotificationIntentRepository>(NOTIFICATION_INTENT_REPOSITORY);
  const outbox = moduleRef.get(OutboxEventStore);
  const transactions = moduleRef.get(TransactionManager);
  const requestContext = moduleRef.get(RequestContextService);
  let currentAdmin = { adminId: '', cookie: '' };

  const inRequest = <T>(work: () => Promise<T>): Promise<T> =>
    requestContext.run({ requestId: `b08-${newId()}` }, work);

  const seedAdminSession = async (): Promise<{ adminId: string; cookie: string }> => {
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b08-${adminId}@example.test`}, 'B08 Operator', 'ACTIVE')
    `);
    // A real 256-bit token hashed exactly as `SessionTokenService` does, so the
    // guard's lookup is the production one. The raw value never leaves this
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

  const seedCustomer = async (): Promise<{ customerId: string; contactPointId: string }> => {
    const customerId = newId();
    const contactPointId = newId();
    // Its own address per customer: a *verified* contact is unique on
    // `(kind, normalized_value)` across all customers, so two fixtures cannot
    // share one. This address is unrelated to the notification recipient —
    // `seedTerminalDelivery` supplies that independently — so nothing asserts on
    // it.
    const email = `cus-${customerId}@vidu-b08.test`;
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'B08 Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
         verified_at, verified_source)
      values (${contactPointId}, ${customerId}, 'EMAIL', ${email}, ${email}, true,
              now(), 'OTP')
    `);
    return { customerId, contactPointId };
  };

  return {
    app,
    disposable,
    clock,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => currentAdmin.cookie,
    adminId: () => currentAdmin.adminId,
    reset: async () => {
      await truncateAllTables(db);
      currentAdmin = { adminId: '', cookie: '' };
      clock.set(new Date('2026-08-15T09:00:00.000Z'));
    },
    seedAdminSession,
    seedCustomer,
    seedChallenge: (options) => seedChallenge(db, options),
    seedGrant: (options) => seedGrant(db, seedCustomer, options),
    seedTerminalDelivery: (input) =>
      seedTerminalDelivery({ db, intake, intents, outbox, transactions, inRequest }, input),
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    inRequest,
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
 * A verification challenge in a chosen state.
 *
 * Raw SQL: this is the *referenced* object, not the system under test, and
 * driving it through the B03/B04 use cases would make every B08 case depend on
 * the verification flow's own preconditions. `code_hash` is an obviously
 * synthetic marker — B08 never reads it, and a suite asserts it never appears.
 *
 * Each challenge gets its **own** target address. CST-007 is a partial unique
 * index over `(kind, value, purpose)` for `ISSUED` rows, so one target may hold
 * exactly one live challenge — a suite needing three of them needs three
 * targets. The address is unrelated to the notification's recipient: B08
 * resolves a challenge by id and reads only its state and deadline.
 */
async function seedChallenge(
  db: Db,
  options?: { readonly status?: string; readonly expiresAt?: Date },
): Promise<string> {
  const challengeId = newId();
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at)
    values (${challengeId}, 'EMAIL', ${`ch-${challengeId}@vidu-b08.test`}, 'SUBMISSION',
            ${`fixture-code-digest-${challengeId}`}, ${options?.status ?? 'ISSUED'},
            ${options?.expiresAt ?? new Date('2099-01-01T00:00:00.000Z')})
  `);
  return challengeId;
}

/** A secure grant in a chosen state, with its scaffolding customer and request. */
async function seedGrant(
  db: Db,
  seedCustomer: () => Promise<{ customerId: string; contactPointId: string }>,
  options?: { readonly status?: string; readonly expiresAt?: Date },
): Promise<string> {
  const { customerId } = await seedCustomer();
  const customRequestId = newId();
  const grantId = newId();
  // Fixture scaffolding, not an APP5 submission: `custom_request_id` is NOT NULL
  // with an FK RESTRICT and APP5 does not exist.
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'NEW')
  `);
  const status = options?.status ?? 'ACTIVE';
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at,
       revoked_at, revoke_reason)
    values (${grantId}, ${customerId}, ${customRequestId},
            ${`fixture-token-digest-${grantId}`}, 'REQUEST_ACCESS', ${status},
            ${options?.expiresAt ?? new Date('2099-01-01T00:00:00.000Z')},
            ${status === 'REVOKED' ? new Date() : null},
            ${status === 'REVOKED' ? 'fixture' : null})
  `);
  return grantId;
}

interface FixtureDeps {
  readonly db: Db;
  readonly intake: RequestNotificationUseCase;
  readonly intents: NotificationIntentRepository;
  readonly outbox: OutboxEventStore;
  readonly transactions: TransactionManager;
  readonly inRequest: <T>(work: () => Promise<T>) => Promise<T>;
}

/**
 * One notification driven to terminal transport failure by the production path.
 *
 * Intake seals a real envelope and appends a real `PENDING` event; three
 * attempts are recorded; then `markFailed` and `markDeadLetter` — the two calls
 * `APP4-W01` makes when the retry budget is spent — move both records to
 * terminal. No status column is written directly anywhere in this function.
 */
async function seedTerminalDelivery(
  deps: FixtureDeps,
  input: {
    readonly reference:
      | { readonly kind: 'VERIFICATION_CHALLENGE'; readonly challengeId: string }
      | { readonly kind: 'SECURE_ACCESS_GRANT'; readonly grantId: string };
    readonly secret: string;
    readonly secretKind: 'VERIFICATION_CODE' | 'SECURE_LINK_TOKEN';
    readonly templateKey?: string;
    readonly recipientContactPointId?: string;
    readonly terminal?: boolean;
    readonly satisfied?: boolean;
  },
): Promise<TerminalDeliveryFixture> {
  const requested = await deps.inRequest(() =>
    deps.transactions.runInTransaction(() =>
      deps.intake.request({
        sourceEventId: newId(),
        channel: 'EMAIL',
        contactKind: 'EMAIL',
        normalizedRecipient: FIXTURE_EMAIL,
        ...(input.recipientContactPointId === undefined
          ? {}
          : { recipientContactPointId: input.recipientContactPointId }),
        templateKey: input.templateKey ?? 'verification.code',
        templateVersion: 1,
        reference: input.reference,
        secretKind: input.secretKind,
        // `APP12-S03-C1`. A secure link must name a landing or the codec refuses
        // to seal it. These suites are about replay, binding and refusal rather
        // than about routing, so the scope APP4 delivered is the right default —
        // and stating it here keeps every replay fixture byte-comparable.
        ...(input.secretKind === 'SECURE_LINK_TOKEN'
          ? { secureLinkLanding: 'REQUEST_ACCESS' as const }
          : {}),
        secret: input.secret,
        issuedAt: new Date('2026-08-15T08:00:00.000Z'),
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    ),
  );

  if (requested.outcome !== 'created') {
    throw new Error('The fixture intake found an existing intent; each fixture must be unique.');
  }
  const { intentId, outboxEventId } = requested;

  if (input.terminal !== false) {
    await deps.transactions.runInTransaction(async () => {
      for (const [index, outcome] of (
        ['FAILED_RETRYABLE', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'] as const
      ).entries()) {
        await deps.intents.recordAttempt({
          intentId,
          channel: 'EMAIL',
          outcome,
          errorClass: 'CHANNEL_UNAVAILABLE',
          attemptedAt: new Date(Date.parse('2026-08-15T08:10:00.000Z') + index * 60_000),
        });
      }
      if (input.satisfied === true) {
        await deps.intents.markDelivered(intentId);
      } else {
        await deps.intents.markFailed(intentId);
      }
      await deps.outbox.markDeadLetter(outboxEventId, 'CHANNEL_UNAVAILABLE');
    });
  }

  const stored = await deps.db.execute<{
    payload: Record<string, unknown>;
    payload_schema_version: number;
  }>(
    sql`select payload, payload_schema_version from outbox_events where id = ${outboxEventId.toString()}`,
  );
  const row = stored.rows[0];
  if (row === undefined) {
    throw new Error('The fixture outbox event is missing.');
  }

  return {
    intentId,
    outboxEventId,
    payload: row.payload,
    payloadSchemaVersion: row.payload_schema_version,
  };
}

/** The two canonical routes, under the global API prefix. */
export const ROUTES = {
  list: () => `/${GLOBAL_ROUTE_PREFIX}/admin/notification-intents`,
  replay: (intentId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/notification-intents/${intentId}/replay`,
} as const;

/** The envelope's `data`, typed — supertest types `response.body` as `any`. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}
