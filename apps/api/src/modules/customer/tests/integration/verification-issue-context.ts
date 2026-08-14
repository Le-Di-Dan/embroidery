/**
 * Shared harness for the `APP4-B03` verification suites.
 *
 * Boots the real `CustomerModule` — real controller wiring, real repository,
 * real `TransactionManager`, real `RequestNotificationUseCase` sealing real
 * envelopes — against a disposable database with every migration applied, and
 * publishes the `verification.challenge` policy through its canonical versioned
 * path.
 *
 * Two providers are overridden, and only two:
 *
 * - **`VerificationClock`**, so a 60-second cooldown, a 600-second expiry and a
 *   900-second rate window are provable in milliseconds. Nothing else in the
 *   flow reads the wall clock, which is why one seam is enough.
 * - **`VerificationCodeMinter`**, so a suite knows the exact plaintext that
 *   should end up inside the sealed envelope and nowhere else. Reading the code
 *   out of the ciphertext to check it would prove the ciphertext round-trips,
 *   not that the *issued* code is the one delivered.
 *
 * The envelope key and both peppers are synthetic and generated per run. A
 * checked-in value would be a credential in the repository whether or not
 * anything real is sealed under it.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import {
  NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV,
  parseEnvelopeKey,
  type EnvelopeKey,
} from '@embroidery/notification-delivery';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { CustomerModule } from '../../customer.module';
import { IssueVerificationChallengeUseCase } from '../../application/issue-verification-challenge.use-case';
import { ResendVerificationChallengeUseCase } from '../../application/resend-verification-challenge.use-case';
import {
  VERIFICATION_CODE_PEPPER_ENV,
  SECURE_LINK_TOKEN_PEPPER_ENV,
} from '../../config/app4-secret-pepper.config';
import { VERIFICATION_CHALLENGE_POLICY_KEY } from '../../domain/verification/verification-challenge-policy';
import { VerificationClock } from '../../infrastructure/clock/verification-clock';
import { VerificationCodeMinter } from '../../infrastructure/crypto/verification-code.minter';

/** The `APP4-G01` values, as published. Restated by no production file. */
export const CHALLENGE_POLICY = {
  ttlSeconds: 600,
  codeLength: 6,
  codeAlphabet: 'DECIMAL_DIGITS',
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  rateWindowSeconds: 900,
  maxIssuesPerTargetPerWindow: 5,
};

/** A clock a suite advances by hand. */
export class FakeVerificationClock extends VerificationClock {
  private current = new Date('2026-08-14T09:00:00.000Z');

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date): void {
    this.current = instant;
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

/**
 * A minter that hands out a known sequence.
 *
 * Six decimal digits, like the real one, so nothing downstream behaves
 * differently — but predictable, so a suite can assert which plaintext was
 * sealed and then prove that same string appears in no persisted column.
 */
export class ScriptedCodeMinter extends VerificationCodeMinter {
  private issued = 0;
  readonly minted: string[] = [];

  override mint(): string {
    this.issued += 1;
    const code = String(100_000 + this.issued);
    this.minted.push(code);
    return code;
  }

  reset(): void {
    this.issued = 0;
    this.minted.length = 0;
  }

  get last(): string {
    return this.minted[this.minted.length - 1] ?? '';
  }
}

export interface VerificationTestContext extends PersistenceTestContext {
  readonly issuance: IssueVerificationChallengeUseCase;
  readonly resending: ResendVerificationChallengeUseCase;
  readonly clock: FakeVerificationClock;
  readonly minter: ScriptedCodeMinter;
  readonly envelopeKey: EnvelopeKey;
  readonly requestId: string;
  /** Runs `work` with a request context bound, as an HTTP request would. */
  inRequest<T>(work: () => Promise<T>): Promise<T>;
  /** Publishes a policy value, replacing whatever is current. */
  publishPolicy(value: Record<string, unknown>): Promise<void>;
}

export interface StartOptions {
  readonly label: string;
  /** Omit to exercise the unpublished-policy path. */
  readonly policy?: Record<string, unknown> | undefined;
}

export async function createVerificationContext(
  options: StartOptions,
): Promise<VerificationTestContext> {
  const previous = {
    envelope: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    codePepper: process.env[VERIFICATION_CODE_PEPPER_ENV],
    linkPepper: process.env[SECURE_LINK_TOKEN_PEPPER_ENV],
  };
  const rawEnvelopeKey = randomBytes(32).toString('base64');
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = rawEnvelopeKey;
  process.env[VERIFICATION_CODE_PEPPER_ENV] = `code-${randomBytes(24).toString('hex')}`;
  process.env[SECURE_LINK_TOKEN_PEPPER_ENV] = `link-${randomBytes(24).toString('hex')}`;

  const clock = new FakeVerificationClock();
  const minter = new ScriptedCodeMinter();

  const base = await createPersistenceTestContext(
    options.label,
    [RequestContextModule, AuditContextModule, CustomerModule],
    (builder) =>
      builder
        .overrideProvider(VerificationClock)
        .useValue(clock)
        .overrideProvider(VerificationCodeMinter)
        .useValue(minter),
  );

  const requestContext = base.get<RequestContextService>(RequestContextService);
  const requestId = `b03-${newId()}`;

  const publishPolicy = async (value: Record<string, unknown>): Promise<void> => {
    const adminId = await ensureAdmin(base);
    const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    await base.get<TransactionManager>(TransactionManager).runInTransaction(async () => {
      await policies.ensureKey(
        VERIFICATION_CHALLENGE_POLICY_KEY,
        'Verification challenge policy (APP4-G01).',
      );
      await policies.publishVersion({
        configKey: VERIFICATION_CHALLENGE_POLICY_KEY,
        value,
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP4-B03 integration fixture.',
      });
    });
  };

  if (options.policy !== undefined) {
    await publishPolicy(options.policy);
  }

  return {
    ...base,
    issuance: base.get<IssueVerificationChallengeUseCase>(IssueVerificationChallengeUseCase),
    resending: base.get<ResendVerificationChallengeUseCase>(ResendVerificationChallengeUseCase),
    clock,
    minter,
    envelopeKey: parseEnvelopeKey(rawEnvelopeKey, NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV),
    requestId,
    inRequest: <T>(work: () => Promise<T>): Promise<T> => requestContext.run({ requestId }, work),
    publishPolicy,
    close: async (): Promise<void> => {
      await base.close();
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

/** `policy_configuration_versions.created_by_admin_id` is NOT NULL. */
async function ensureAdmin(context: PersistenceTestContext): Promise<string> {
  const existing = await context.disposable.client.db.execute<{ id: string }>(
    sql`select id from admin_accounts limit 1`,
  );
  const found = existing.rows[0]?.id;
  if (found !== undefined) {
    return found;
  }
  const adminId = newId();
  await context.disposable.client.db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`b03-${adminId}@example.com`}, 'B03 Fixture', 'ACTIVE')
  `);
  return adminId;
}
