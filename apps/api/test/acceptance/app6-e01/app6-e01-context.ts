/**
 * The one `APP6-E01` acceptance harness — composition and boot.
 *
 * ### What it boots
 *
 * A single real HTTP application carrying **every delivered APP6 slice at once**
 * — quotation drafting, read and send; the customer quotation read and its
 * accept/reject decisions; the Ordering moderation transition that commands
 * `DIGITIZING`; the Admin submitted-design read; design-version authoring, its
 * detail read and its send-for-review; the customer design review read and its
 * approve/revision decisions — against one disposable PostgreSQL database with
 * every migration applied.
 *
 * That composition is the point of the checkpoint. Each `B0n` suite booted the
 * one module it owned, which is what let it say "no route in this injector could
 * have done that". `E01` asks the opposite question — whether the eleven slices
 * *compose* — and the only honest way to ask it is to put them in one injector
 * and drive them over HTTP, through the real guards, in the order a real
 * commission runs.
 *
 * ### Nothing under test is overridden
 *
 * No guard is stubbed, no repository doubled, no clock replaced and no use case
 * reconstructed from loose collaborators. The peppered digest is the real one:
 * the harness mints a token, digests it with the same `digestSecret` the
 * resolvers use, and stores only the digest.
 *
 * **The policy values are the delivered ones.** `PublishApp4PolicyUseCase`,
 * `PublishApp6PolicyUseCase` and `PublishApp6AgreementsUseCase` are the three
 * publishers `staff-bootstrap` itself runs, called here with a real resolved
 * Admin id and reading the committed seed datasets. So the validity window, the
 * deposit split, the required agreement types and the agreement text this run
 * proves against are production's, not a fixture's opinion of them.
 *
 * ### What is seeded
 *
 * Only prerequisite state that APP6 consumes and no APP6 operation produces —
 * the Admin and its session here, and the customer's world in
 * [`app6-e01-world.ts`](./app6-e01-world.ts), which states the full list.
 *
 * Every state after `UNDER_REVIEW` is reached by an owning APP6 operation over
 * HTTP. `QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` are never
 * written, updated or commanded by this harness — §7.1 of the phase plan makes
 * all four system projections, and a fixture that set one would erase the only
 * thing this checkpoint exists to prove.
 *
 * ### Step-up evidence
 *
 * `GRD-003` runs for real on every sensitive transaction. What the harness
 * supplies is a **committed `VERIFIED` `STEP_UP` challenge row** — the same
 * fixture `APP6-B05` and `APP6-B11` established — so the production resolver
 * reads production evidence through the production window policy. No code is
 * minted, no digest is a real one, no guard is bypassed and no plaintext
 * verification code exists anywhere in this process.
 *
 * ### Secrets
 *
 * The peppers and the envelope key are synthetic values generated per run and
 * set on `process.env` for the duration of the harness. No `.env` file is read,
 * written or consulted (`CLAUDE.md` §8a), and no credential is rotated. Tokens
 * live only in this process's memory and are never printed.
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
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import { sql, type SQL } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../src/bootstrap/api-application';
import { AuditContextModule } from '../../../src/platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../src/platform/http-response/http-response.module';
import { PolicyModule } from '../../../src/platform/policy/policy.module';
import { PublishApp4PolicyUseCase } from '../../../src/platform/policy/publish-app4-policy.use-case';
import { PublishApp6PolicyUseCase } from '../../../src/platform/policy/publish-app6-policy.use-case';
import { RequestContextModule } from '../../../src/platform/request-context/request-context.module';
import { ValidationModule } from '../../../src/platform/validation/validation.module';
import { ContentModule } from '../../../src/modules/content/content.module';
import { PublishApp6AgreementsUseCase } from '../../../src/modules/content/application/publish-app6-agreements.use-case';
import {
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from '../../../src/modules/customer/config/app4-secret-pepper.config';
import { digestSecret } from '../../../src/modules/customer/domain/secret/app4-secret-digest';
import { hashToken } from '../../../src/modules/identity/infrastructure/crypto/session-token.service';
import { CustomerDesignDecisionModule } from '../../../src/modules/design/customer-design-decision.module';
import { CustomerDesignReviewModule } from '../../../src/modules/design/customer-design-review.module';
import { DesignVersionAuthoringModule } from '../../../src/modules/design/design-version-authoring.module';
import { DesignVersionDetailReadModule } from '../../../src/modules/design/design-version-detail-read.module';
import { DesignVersionSendModule } from '../../../src/modules/design/design-version-send.module';
import { CustomRequestModerationModule } from '../../../src/modules/order/custom-request-moderation.module';
import { CustomRequestSubmittedDesignModule } from '../../../src/modules/order/custom-request-submitted-design.module';
import { CustomerQuotationDecisionModule } from '../../../src/modules/quotation/customer-quotation-decision.module';
import { CustomerQuotationModule } from '../../../src/modules/quotation/customer-quotation.module';
import { QuotationDraftingModule } from '../../../src/modules/quotation/quotation-drafting.module';
import { QuotationReadModule } from '../../../src/modules/quotation/quotation-read.module';
import { QuotationSendModule } from '../../../src/modules/quotation/quotation-send.module';
import { seedCommissionWorld } from './app6-e01-world';
import type { SeedCommissionOptions, SeededCommission } from './app6-e01-world';

export {
  COP_AREA_LABEL,
  COP_SIDE_LABEL,
  SIDE_GEOMETRY,
  catalogDocument,
  customerOwnedDocument,
  shapeAt,
} from './app6-e01-world';
export type { SeedCommissionOptions, SeededCommission, SeededPlacement } from './app6-e01-world';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

export interface App6AcceptanceContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  server(): Server;
  adminId(): string;
  adminCookie(): string;
  /** The three delivered bootstrap publishers, on a real resolved Admin. */
  publishDeliveredPolicies(): Promise<void>;
  seedCommission(options?: SeedCommissionOptions): Promise<SeededCommission>;
  /** A committed `VERIFIED` `STEP_UP` challenge; production `GRD-003` still runs. */
  addStepUp(commission: SeededCommission, verifiedSecondsAgo?: number): Promise<string>;
  revokeGrant(grantId: string): Promise<void>;
  rows<T>(query: SQL): Promise<T[]>;
  count(query: SQL): Promise<number>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createApp6AcceptanceContext(label: string): Promise<App6AcceptanceContext> {
  const previous = {
    url: process.env['DATABASE_URL'],
    env: process.env['NODE_ENV'],
    envelope: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    codePepper: process.env[VERIFICATION_CODE_PEPPER_ENV],
    linkPepper: process.env[SECURE_LINK_TOKEN_PEPPER_ENV],
  };

  const linkPepper = `link-${randomBytes(24).toString('hex')}`;
  const disposable = await createDisposableDatabase(label);
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = randomBytes(32).toString('base64');
  process.env[VERIFICATION_CODE_PEPPER_ENV] = `code-${randomBytes(24).toString('hex')}`;
  process.env[SECURE_LINK_TOKEN_PEPPER_ENV] = linkPepper;

  let app: INestApplication;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        PolicyModule,
        ContentModule,
        // The commercial lane.
        QuotationDraftingModule,
        QuotationReadModule,
        QuotationSendModule,
        CustomerQuotationModule,
        CustomerQuotationDecisionModule,
        // The one directly commanded APP6 transition, and the digitizing source.
        CustomRequestModerationModule,
        CustomRequestSubmittedDesignModule,
        // The design lane.
        DesignVersionAuthoringModule,
        DesignVersionDetailReadModule,
        DesignVersionSendModule,
        CustomerDesignReviewModule,
        CustomerDesignDecisionModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  } catch (error: unknown) {
    // Never leave a database behind when composition fails: the next run would
    // inherit it and the failure would look like a different problem.
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  let adminId = '';
  let adminCookie = '';

  /**
   * The run's one Admin and its live session.
   *
   * `uq_admin_accounts__status__active` permits a single `ACTIVE` account, so
   * this is created once per reset and reused: two ACTIVE admins is not a bigger
   * fixture, it is an invalid database.
   */
  async function seedAdmin(): Promise<void> {
    adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`app6-e01-${adminId}@example.test`}, 'APP6 E01 Operator', 'ACTIVE')
    `);
    const rawToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
              ${new Date(Date.now() + 60 * 60 * 1_000)})
    `);
    adminCookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
  }

  async function insertStepUp(
    commission: SeededCommission,
    verifiedSecondsAgo: number,
  ): Promise<string> {
    const challengeId = newId();
    const verifiedAt = new Date(Date.now() - verifiedSecondsAgo * 1_000);
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
         status, expires_at, verified_at)
      values (${challengeId}, ${commission.contactPointId}, 'EMAIL',
              ${commission.contactValue}, 'STEP_UP',
              -- A synthetic digest. No code is minted, hashed or stored: the
              -- sensitive paths never read it, and a test must not put a
              -- credential-shaped value anywhere durable.
              ${`test-step-up-digest-${challengeId}`},
              'VERIFIED', ${new Date(verifiedAt.getTime() + 600_000)}, ${verifiedAt})
    `);
    return challengeId;
  }

  return {
    app,
    disposable,
    server: () => app.getHttpServer() as Server,
    adminId: () => adminId,
    adminCookie: () => adminCookie,

    publishDeliveredPolicies: async (): Promise<void> => {
      await app.get(PublishApp4PolicyUseCase).publish(adminId);
      await app.get(PublishApp6PolicyUseCase).publish(adminId);
      await app.get(PublishApp6AgreementsUseCase).publish(adminId);
    },

    seedCommission: (options = {}): Promise<SeededCommission> =>
      seedCommissionWorld(db, (token) => digestSecret(linkPepper, token), mintToken, options),

    addStepUp: (commission, verifiedSecondsAgo = 30): Promise<string> =>
      insertStepUp(commission, verifiedSecondsAgo),

    revokeGrant: async (grantId): Promise<void> => {
      await db.execute(sql`
        update secure_access_grants
           set status = 'REVOKED', revoked_at = now(), revoke_reason = 'APP6-E01 acceptance.'
         where id = ${grantId}
      `);
    },

    rows: async <T>(query: SQL): Promise<T[]> => (await db.execute(query)).rows as T[],

    count: async (query: SQL): Promise<number> => {
      const [row] = (await db.execute(query)).rows as { readonly count: string }[];
      return Number(row?.count ?? '-1');
    },

    reset: async (): Promise<void> => {
      await truncateAllTables(db);
      await seedAdmin();
    },

    close: async (): Promise<void> => {
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
