/**
 * Drizzle implementation of the AGG-03 Verification Challenge contract
 * (TBL-006 `contact_verification_challenges`, TBL-007
 * `contact_verification_attempts`).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { notFoundError, schema } from '@embroidery/database';
import type {
  ContactKind,
  VerificationAttemptOutcome,
  VerificationChallengeState,
  VerificationPurpose,
} from '@embroidery/database';
import { and, count, eq, gt, gte, lte, sql } from 'drizzle-orm';

import type {
  ChallengeId,
  OpenChallengeInput,
  VerificationChallenge,
  VerificationChallengeRepository,
} from '../../domain/repositories/verification-challenge.repository';

const { contactVerificationChallenges, contactVerificationAttempts } = schema;

type ChallengeRow = typeof contactVerificationChallenges.$inferSelect;

function toDomain(row: ChallengeRow): VerificationChallenge {
  return {
    id: row.id as ChallengeId,
    contactKind: row.contactKind as ContactKind,
    normalizedValue: row.normalizedValue,
    purpose: row.purpose as VerificationPurpose,
    status: row.status as VerificationChallengeState,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    verifiedAt: row.verifiedAt ?? undefined,
    sessionId: row.sessionId ?? undefined,
    contactPointId: row.contactPointId ?? undefined,
  };
}

/**
 * The advisory-lock namespace.
 *
 * An arbitrary but fixed 32-bit constant, so the two-key form of
 * `pg_advisory_xact_lock` cannot collide with a lock some other feature takes on
 * the same hashed value. `hashtext` gives the second key.
 */
const VERIFICATION_LOCK_NAMESPACE = 0x4b03;

@Injectable()
export class DrizzleVerificationChallengeRepository
  extends DrizzleRepository
  implements VerificationChallengeRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async openChallenge(input: OpenChallengeInput): Promise<VerificationChallenge> {
    return this.run('openChallenge', async () => {
      const [row] = await this.db
        .insert(contactVerificationChallenges)
        .values({
          id: input.id,
          contactPointId: input.contactPointId ?? null,
          contactKind: input.contactKind,
          normalizedValue: input.normalizedValue,
          purpose: input.purpose,
          codeHash: input.codeHash,
          status: 'ISSUED',
          expiresAt: input.expiresAt,
          sessionId: input.sessionId ?? null,
          // Explicit, not `defaultNow()`: one clock owns issuance, expiry, the
          // resend cooldown and the rate window.
          createdAt: input.issuedAt,
          updatedAt: input.issuedAt,
        })
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'VerificationChallengeRepository.openChallenge',
          'Could not open the challenge.',
        );
      }
      return toDomain(row);
    });
  }

  async recordAttempt(
    challengeId: ChallengeId,
    outcome: VerificationAttemptOutcome,
    at: Date,
  ): Promise<void> {
    return this.run('recordAttempt', async () => {
      const tx = this.requireTransaction('recordAttempt');
      await tx.insert(contactVerificationAttempts).values({
        challengeId,
        outcome,
        attemptedAt: at,
      });
    });
  }

  async completeChallenge(id: ChallengeId, verifiedAt: Date): Promise<VerificationChallenge> {
    return this.run('completeChallenge', async () => {
      const [row] = await this.db
        .update(contactVerificationChallenges)
        .set({ status: 'VERIFIED', verifiedAt, updatedAt: verifiedAt })
        .where(
          and(
            eq(contactVerificationChallenges.id, id),
            // Only an issued challenge may complete: re-verifying a failed or
            // expired one would launder it into a valid credential.
            eq(contactVerificationChallenges.status, 'ISSUED'),
            gt(contactVerificationChallenges.expiresAt, verifiedAt),
          ),
        )
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'VerificationChallengeRepository.completeChallenge',
          'That verification challenge is no longer open.',
        );
      }
      return toDomain(row);
    });
  }

  async failChallenge(id: ChallengeId): Promise<void> {
    return this.run('failChallenge', async () => {
      await this.db
        .update(contactVerificationChallenges)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(
          and(
            eq(contactVerificationChallenges.id, id),
            eq(contactVerificationChallenges.status, 'ISSUED'),
          ),
        );
    });
  }

  async resolveOpen(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<VerificationChallenge | undefined> {
    return this.run('resolveOpen', async () => {
      const [row] = await this.db
        .select()
        .from(contactVerificationChallenges)
        .where(
          and(
            eq(contactVerificationChallenges.contactKind, contactKind),
            eq(contactVerificationChallenges.normalizedValue, normalizedValue),
            eq(contactVerificationChallenges.purpose, purpose),
            // Matches `uq_verification_challenges__kind_value_purpose__issued`,
            // so at most one row can qualify.
            eq(contactVerificationChallenges.status, 'ISSUED'),
            gt(contactVerificationChallenges.expiresAt, now),
          ),
        )
        .limit(1);

      return row === undefined ? undefined : toDomain(row);
    });
  }

  async countAttempts(challengeId: ChallengeId): Promise<number> {
    return this.run('countAttempts', async () => {
      const [row] = await this.db
        .select({ total: count() })
        .from(contactVerificationAttempts)
        .where(eq(contactVerificationAttempts.challengeId, challengeId));
      return row?.total ?? 0;
    });
  }

  async hasRecentCompleted(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    notBefore: Date,
  ): Promise<boolean> {
    return this.run('hasRecentCompleted', async () => {
      const [row] = await this.db
        .select({ id: contactVerificationChallenges.id })
        .from(contactVerificationChallenges)
        .where(
          and(
            eq(contactVerificationChallenges.contactKind, contactKind),
            eq(contactVerificationChallenges.normalizedValue, normalizedValue),
            eq(contactVerificationChallenges.purpose, purpose),
            eq(contactVerificationChallenges.status, 'VERIFIED'),
            gte(contactVerificationChallenges.verifiedAt, notBefore),
          ),
        )
        .limit(1);

      return row !== undefined;
    });
  }

  async findById(id: ChallengeId): Promise<VerificationChallenge | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(contactVerificationChallenges)
        .where(eq(contactVerificationChallenges.id, id))
        .limit(1);
      return row === undefined ? undefined : toDomain(row);
    });
  }

  async findCodeDigest(id: ChallengeId): Promise<string | undefined> {
    return this.run('findCodeDigest', async () => {
      // Selects the one column, so a digest never rides along inside a row this
      // method's caller did not ask for.
      const [row] = await this.db
        .select({ codeHash: contactVerificationChallenges.codeHash })
        .from(contactVerificationChallenges)
        .where(eq(contactVerificationChallenges.id, id))
        .limit(1);
      return row?.codeHash;
    });
  }

  async lockTarget(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    return this.run('lockTarget', async () => {
      const tx = this.requireTransaction('lockTarget');
      // The lock key is a hash of the target, never the target itself: advisory
      // locks are visible in `pg_locks`, and a normalized email as a lock key
      // would put contact values in an operational view.
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          ${VERIFICATION_LOCK_NAMESPACE},
          hashtext(${`${contactKind}:${normalizedValue}:${purpose}`})
        )
      `);
    });
  }

  async expireStale(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<number> {
    return this.run('expireStale', async () => {
      const rows = await this.db
        .update(contactVerificationChallenges)
        .set({ status: 'EXPIRED', updatedAt: now })
        .where(
          and(
            eq(contactVerificationChallenges.contactKind, contactKind),
            eq(contactVerificationChallenges.normalizedValue, normalizedValue),
            eq(contactVerificationChallenges.purpose, purpose),
            eq(contactVerificationChallenges.status, 'ISSUED'),
            // `<=` rather than `<`: `resolveOpen` treats a challenge as live
            // only while `expires_at > now`, so the two must agree about the
            // instant of expiry or a row could be neither live nor sweepable.
            lte(contactVerificationChallenges.expiresAt, now),
          ),
        )
        .returning({ id: contactVerificationChallenges.id });
      return rows.length;
    });
  }

  async cancelChallenge(id: ChallengeId): Promise<boolean> {
    return this.run('cancelChallenge', async () => {
      const rows = await this.db
        .update(contactVerificationChallenges)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(
          and(
            eq(contactVerificationChallenges.id, id),
            // Only an open challenge may be cancelled: cancelling a VERIFIED one
            // would retract evidence, and cancelling an EXPIRED or FAILED one
            // would rewrite why it ended.
            eq(contactVerificationChallenges.status, 'ISSUED'),
          ),
        )
        .returning({ id: contactVerificationChallenges.id });
      return rows.length > 0;
    });
  }

  async countIssuedSince(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number> {
    return this.run('countIssuedSince', async () => {
      const [row] = await this.db
        .select({ total: count() })
        .from(contactVerificationChallenges)
        .where(
          and(
            eq(contactVerificationChallenges.contactKind, contactKind),
            eq(contactVerificationChallenges.normalizedValue, normalizedValue),
            eq(contactVerificationChallenges.purpose, purpose),
            gte(contactVerificationChallenges.createdAt, since),
          ),
        );
      return row?.total ?? 0;
    });
  }
}
