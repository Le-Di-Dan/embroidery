/**
 * TBL-074 `idempotency_records` — claim/replay persistence (GRD-012, GRD-030).
 *
 * A narrow infrastructure port, not a CRUD API: the only operations are claim,
 * complete and fail, because those are the only three things the idempotency
 * protocol does.
 *
 * The claim runs inside the caller's transaction, so the record and the domain
 * work it guards commit or roll back together. That is what makes a replay
 * safe: a record can never be `COMPLETED` for work that rolled back.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, isPersistenceError, schema } from '@embroidery/database';
import type { IdempotencyRecordState } from '@embroidery/database';
import { and, eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import type { DatabaseExecutorHandle } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';

const { idempotencyRecords } = schema;

export interface IdempotencyKey {
  /** The operation family, e.g. `payment.callback`. */
  readonly namespace: string;
  /** The caller-supplied key, scoped to the namespace. */
  readonly scopeKey: string;
  /**
   * A hash of the request's meaningful inputs.
   *
   * Same key + different fingerprint means the caller reused a key for
   * different work, which is a conflict rather than a replay (GRD-030).
   */
  readonly fingerprint: string;
}

export interface IdempotencyRecordSummary {
  readonly status: IdempotencyRecordState;
  readonly fingerprint: string;
  readonly result: unknown;
}

export type IdempotencyClaim =
  /** This caller owns the operation and must now perform it. */
  | { readonly outcome: 'claimed' }
  /** Another attempt is mid-flight. Not yet replayable. */
  | { readonly outcome: 'in_progress' }
  /** Already done — replay this result instead of repeating the work. */
  | { readonly outcome: 'replay'; readonly result: unknown };

@Injectable()
export class IdempotencyStore extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Claims the key, or reports what a previous attempt did with it.
   *
   * @requiresTransaction — the claim must share the domain work's transaction.
   */
  async claim(key: IdempotencyKey, expiresAt: Date): Promise<IdempotencyClaim> {
    return this.run('claim', async () => {
      const tx = this.requireTransaction('claim');
      const now = new Date();

      // `onConflictDoNothing` rather than catching 23505: a caught unique
      // violation would abort the enclosing transaction in PostgreSQL, taking
      // the domain work with it. Returning zero rows leaves it usable.
      const inserted = await tx
        .insert(idempotencyRecords)
        .values({
          operationNamespace: key.namespace,
          scopeKey: key.scopeKey,
          fingerprint: key.fingerprint,
          status: 'IN_PROGRESS',
          expiresAt,
          claimedAt: now,
        })
        .onConflictDoNothing({
          target: [idempotencyRecords.operationNamespace, idempotencyRecords.scopeKey],
        })
        .returning({ id: idempotencyRecords.id });

      if (inserted.length > 0) {
        return { outcome: 'claimed' as const };
      }

      const existing = await this.load(tx, key);
      if (existing === undefined) {
        // The row vanished between the conflict and this read — only possible
        // if a cleanup job removed an expired record in the gap. Treating it as
        // retryable is honest; claiming it is not.
        throw guardViolationError(
          'IdempotencyStore.claim',
          'IDEMPOTENCY_RECORD_VANISHED',
          'The idempotency record could not be read; please retry.',
        );
      }

      if (existing.fingerprint !== key.fingerprint) {
        throw guardViolationError(
          'IdempotencyStore.claim',
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }

      return existing.status === 'COMPLETED'
        ? { outcome: 'replay' as const, result: existing.result }
        : { outcome: 'in_progress' as const };
    });
  }

  /**
   * Records the operation's result so a later duplicate replays it.
   *
   * @requiresTransaction — must commit with the work it describes.
   */
  async complete(key: IdempotencyKey, result: unknown): Promise<void> {
    return this.run('complete', async () => {
      const tx = this.requireTransaction('complete');
      const now = new Date();

      const updated = await tx
        .update(idempotencyRecords)
        .set({
          status: 'COMPLETED',
          result: result === undefined ? null : result,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(idempotencyRecords.operationNamespace, key.namespace),
            eq(idempotencyRecords.scopeKey, key.scopeKey),
            // Only the in-progress claim may complete: without this, a late
            // retry could overwrite a result another attempt already published.
            eq(idempotencyRecords.status, 'IN_PROGRESS'),
          ),
        )
        .returning({ id: idempotencyRecords.id });

      if (updated.length === 0) {
        throw guardViolationError(
          'IdempotencyStore.complete',
          'IDEMPOTENCY_CLAIM_NOT_HELD',
          'This operation no longer holds its idempotency claim.',
        );
      }
    });
  }

  /**
   * Releases a claim whose work failed, so a retry can claim it again.
   *
   * Deliberately a **delete**, not a status: the schema has no FAILED state
   * (IDEMPOTENCY_RECORD_STATES is `IN_PROGRESS | COMPLETED`), and leaving the
   * row `IN_PROGRESS` would block every retry until it expired.
   *
   * The caller must run this *outside* the failed transaction — a rolled-back
   * transaction removes the claim anyway, so this is for the case where the
   * work failed after its own commit boundary.
   */
  async release(key: IdempotencyKey): Promise<void> {
    return this.run('release', async () => {
      await this.db
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.operationNamespace, key.namespace),
            eq(idempotencyRecords.scopeKey, key.scopeKey),
            eq(idempotencyRecords.status, 'IN_PROGRESS'),
          ),
        );
    });
  }

  /** Reads a record without claiming. Diagnostic and test use. */
  async find(
    key: Pick<IdempotencyKey, 'namespace' | 'scopeKey'>,
  ): Promise<IdempotencyRecordSummary | undefined> {
    return this.run('find', () => this.load(this.db, key));
  }

  private async load(
    executor: DatabaseExecutorHandle,
    key: Pick<IdempotencyKey, 'namespace' | 'scopeKey'>,
  ): Promise<IdempotencyRecordSummary | undefined> {
    const [row] = await executor
      .select({
        status: idempotencyRecords.status,
        fingerprint: idempotencyRecords.fingerprint,
        result: idempotencyRecords.result,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.operationNamespace, key.namespace),
          eq(idempotencyRecords.scopeKey, key.scopeKey),
        ),
      )
      .limit(1);

    return row === undefined
      ? undefined
      : {
          status: row.status as IdempotencyRecordState,
          fingerprint: row.fingerprint,
          result: row.result,
        };
  }
}

/** True when a failure is the idempotency conflict of GRD-030. */
export function isIdempotencyConflict(error: unknown): boolean {
  return isPersistenceError(error) && error.code === 'IDEMPOTENCY_CONFLICT';
}
