/**
 * Allocation-aware idempotency operations (`ADR-APP2-001` §4.2f-3/§4.2f-4).
 *
 * These are the four operations `APP2-B01-G01` recorded as missing from
 * `IdempotencyStore`: the base store can claim, complete, release and find, but
 * it cannot **write a result at claim time**, cannot see that an `IN_PROGRESS`
 * row has **expired**, cannot take a **row lock**, and cannot update a result on
 * a claim it still holds. Every one of those is required by the pre-stream
 * durable-allocation model, and none of them needs a schema change: `result`,
 * `expires_at` and `claimed_at` are mutable by design (DB5-A10).
 *
 * They live beside the store rather than inside it because the base store is a
 * general platform primitive used by payments and notifications, while these
 * carry the upload protocol's ownership semantics. Mixing the two would put a
 * claim-token concept into a class that has no business knowing about one.
 *
 * Every method here requires the caller's transaction. Expiry is decided by
 * **database time** (`now()`), never by a Node clock: two API processes with a
 * few seconds of drift must not disagree about who owns an allocation.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { IdempotencyRecordState } from '@embroidery/database';
import { and, eq, lte, sql } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import type { IdempotencyKey } from './idempotency-store';

const { idempotencyRecords } = schema;

/** What a claim attempt found, from the claimant's point of view. */
export type AllocationClaim =
  /** Nothing existed; this caller owns the allocation it just wrote. */
  | { readonly outcome: 'claimed' }
  /** Another attempt holds an unexpired claim. Not replayable, not reclaimable. */
  | { readonly outcome: 'in_progress' }
  /** The operation finished earlier; the stored result is the receipt. */
  | { readonly outcome: 'completed'; readonly result: unknown }
  /** A claim exists but its lease elapsed; the caller may try to reclaim it. */
  | { readonly outcome: 'expired'; readonly result: unknown };

/** A locked row, read for a decision that must not race another claimant. */
export interface LockedIdempotencyRecord {
  readonly status: IdempotencyRecordState;
  readonly fingerprint: string;
  readonly result: unknown;
  /** Decided by the database clock at read time. */
  readonly expired: boolean;
}

export interface AllocationClaimInput {
  readonly key: IdempotencyKey;
  /** Written in the same statement as the claim — this is the whole point. */
  readonly result: unknown;
  /** Lease length in milliseconds, applied as `now() + interval`. */
  readonly ttlMs: number;
}

/** Rendered as an interval so the value is computed by PostgreSQL, not Node. */
function interval(ttlMs: number) {
  return sql`make_interval(secs => ${ttlMs / 1000}::double precision)`;
}

@Injectable()
export class IdempotencyAllocationStore extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Claims the key **with** its allocation result, or reports what is there.
   *
   * `onConflictDoNothing` for the same reason the base store uses it: a caught
   * 23505 would abort the enclosing transaction, and this claim shares a
   * transaction with nothing else only by convention — a future caller must not
   * be punished for composing it.
   *
   * A fingerprint mismatch is reported as a distinct outcome rather than a
   * throw, because the caller has to decide the HTTP category and must not have
   * to unwrap a persistence error to do it.
   *
   * @requiresTransaction
   */
  async claimWithAllocation(input: AllocationClaimInput): Promise<AllocationClaim | 'conflict'> {
    return this.run('claimWithAllocation', async () => {
      const tx = this.requireTransaction('claimWithAllocation');
      const { key } = input;

      const inserted = await tx
        .insert(idempotencyRecords)
        .values({
          operationNamespace: key.namespace,
          scopeKey: key.scopeKey,
          fingerprint: key.fingerprint,
          status: 'IN_PROGRESS',
          result: input.result,
          expiresAt: sql`now() + ${interval(input.ttlMs)}`,
          claimedAt: sql`now()`,
        })
        .onConflictDoNothing({
          target: [idempotencyRecords.operationNamespace, idempotencyRecords.scopeKey],
        })
        .returning({ id: idempotencyRecords.id });

      if (inserted.length > 0) {
        return { outcome: 'claimed' as const };
      }

      const existing = await this.lock(key);
      if (existing === undefined) {
        // Only reachable if a sweep deleted the row between the conflict and
        // this read. Reporting it as expired would be a lie; the caller retries.
        return 'conflict' as const;
      }
      if (existing.fingerprint !== key.fingerprint) {
        return 'conflict' as const;
      }
      if (existing.status === 'COMPLETED') {
        return { outcome: 'completed' as const, result: existing.result };
      }
      return existing.expired
        ? { outcome: 'expired' as const, result: existing.result }
        : { outcome: 'in_progress' as const };
    });
  }

  /**
   * Takes the row lock that serialises concurrent reclaimers.
   *
   * `FOR UPDATE` rather than an optimistic compare-and-set: two reclaimers that
   * both read "expired" and both rotate would each believe they own the
   * allocation, and the loser would then delete the winner's object.
   *
   * @requiresTransaction
   */
  async lockForUpdate(key: IdempotencyKey): Promise<LockedIdempotencyRecord | undefined> {
    return this.run('lockForUpdate', async () => {
      this.requireTransaction('lockForUpdate');
      return this.lock(key);
    });
  }

  /**
   * Rotates the claim token and renews the lease on an **expired** claim.
   *
   * Guarded on the previous claim token as well as expiry: a second reclaimer
   * that somehow read the same pre-rotation state cannot rotate again, so the
   * winner's token stays the only live one. Returns false when the row moved on.
   *
   * @requiresTransaction
   */
  async renewExpiredClaim(input: {
    readonly key: IdempotencyKey;
    readonly previousClaimToken: string;
    readonly result: unknown;
    readonly ttlMs: number;
  }): Promise<boolean> {
    return this.run('renewExpiredClaim', async () => {
      const tx = this.requireTransaction('renewExpiredClaim');
      const updated = await tx
        .update(idempotencyRecords)
        .set({
          result: input.result,
          claimedAt: sql`now()`,
          expiresAt: sql`now() + ${interval(input.ttlMs)}`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            this.identity(input.key),
            eq(idempotencyRecords.fingerprint, input.key.fingerprint),
            eq(idempotencyRecords.status, 'IN_PROGRESS'),
            lte(idempotencyRecords.expiresAt, sql`now()`),
            sql`${idempotencyRecords.result}->>'claimToken' = ${input.previousClaimToken}`,
          ),
        )
        .returning({ id: idempotencyRecords.id });
      return updated.length > 0;
    });
  }

  /**
   * Completes a claim this caller still owns, replacing the stored result.
   *
   * The claim-token predicate is what makes a stale attempt harmless: a request
   * whose allocation was reclaimed matches zero rows here and mutates nothing,
   * instead of overwriting the receipt of the attempt that actually finished.
   *
   * @requiresTransaction
   */
  async completeHeldClaim(input: {
    readonly key: IdempotencyKey;
    readonly claimToken: string;
    readonly result: unknown;
  }): Promise<boolean> {
    return this.run('completeHeldClaim', async () => {
      const tx = this.requireTransaction('completeHeldClaim');
      const updated = await tx
        .update(idempotencyRecords)
        .set({
          status: 'COMPLETED',
          result: input.result,
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            this.identity(input.key),
            eq(idempotencyRecords.fingerprint, input.key.fingerprint),
            eq(idempotencyRecords.status, 'IN_PROGRESS'),
            sql`${idempotencyRecords.result}->>'claimToken' = ${input.claimToken}`,
          ),
        )
        .returning({ id: idempotencyRecords.id });
      return updated.length > 0;
    });
  }

  private identity(key: IdempotencyKey) {
    return and(
      eq(idempotencyRecords.operationNamespace, key.namespace),
      eq(idempotencyRecords.scopeKey, key.scopeKey),
    );
  }

  private async lock(
    key: Pick<IdempotencyKey, 'namespace' | 'scopeKey'>,
  ): Promise<LockedIdempotencyRecord | undefined> {
    const [row] = await this.db
      .select({
        status: idempotencyRecords.status,
        fingerprint: idempotencyRecords.fingerprint,
        result: idempotencyRecords.result,
        expired: sql<boolean>`${idempotencyRecords.expiresAt} <= now()`,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.operationNamespace, key.namespace),
          eq(idempotencyRecords.scopeKey, key.scopeKey),
        ),
      )
      .limit(1)
      .for('update');

    return row === undefined
      ? undefined
      : {
          status: row.status as IdempotencyRecordState,
          fingerprint: row.fingerprint,
          result: row.result,
          expired: row.expired,
        };
  }
}
