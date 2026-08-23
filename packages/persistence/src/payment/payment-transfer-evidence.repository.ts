/**
 * The `payment_transfer_evidence` association (TBL-079, `APP7-DB01`,
 * `APP7-B05`).
 *
 * One canonical writer, in the shared package rather than in the API, for the
 * reason `APP7-W01-C1` settled one aggregate over: `APP7-B06` will list the same
 * associations to serve an Admin preview, and two writers of one table drift on
 * the thing that is hardest to notice — here, on what "bound" means and on which
 * lock the five-per-attempt bound is decided under.
 *
 * ### It is not a general payment repository
 *
 * Four operations and no fifth. There is no update, no delete and no detach:
 * `APP7-G01` §7.2 makes customer evidence append-only, and the absence is the
 * enforcement. Nothing here can move an attempt, an obligation or an order — the
 * only table it writes is the association, and the only reason it reads
 * `payment_attempts` and `payment_obligations` is to hand a caller the chain it
 * must prove before binding anything.
 *
 * ### The attempt row is the quota lock
 *
 * A `CHECK` cannot count sibling rows and a unique index over the attempt alone
 * would forbid the second image, so `MAX_EVIDENCE_PER_ATTEMPT` is an application
 * bound — and an application bound is only sound under a lock that serializes
 * the competing inserts. {@link lockAttemptForEvidence} takes it; the count and
 * the insert that follow are the other half. `APP7-DB01` proved the database
 * accepts a sixth row precisely so this is never mistaken for belt and braces.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type {
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
} from '@embroidery/database';
import { and, asc, count, eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import type { AttemptId, ObligationId } from './payment-obligation.repository';

const { paymentAttempts, paymentObligations, paymentTransferEvidence } = schema;

export type TransferEvidenceId = string & { readonly __brand: 'TransferEvidenceId' };

/**
 * One attempt and the obligation it belongs to, read under the attempt's row
 * lock.
 *
 * `stepUpChallengeId` and `grantId` are the authorization evidence the attempt
 * was opened with (REL-085). They are handed back so the caller can **re-verify
 * the attempt's own** proof of presence rather than accept one from the request;
 * neither ever reaches a response.
 */
export interface LockedEvidenceAttempt {
  readonly id: AttemptId;
  readonly paymentObligationId: ObligationId;
  readonly status: PaymentAttemptState;
  readonly method: string;
  readonly grantId: string | undefined;
  readonly stepUpChallengeId: string | undefined;
  readonly obligationOrderId: string;
  readonly obligationKind: PaymentObligationKind;
  readonly obligationStatus: PaymentObligationState;
}

/** One association row. No asset facts: AGG-08 owns those and answers for them. */
export interface TransferEvidenceAssociation {
  readonly id: TransferEvidenceId;
  readonly paymentAttemptId: AttemptId;
  readonly assetId: string;
  readonly createdAt: Date;
}

export interface BindTransferEvidenceInput {
  readonly id: TransferEvidenceId;
  readonly paymentAttemptId: AttemptId;
  readonly assetId: string;
}

/** `created: false` means the pair was already bound — a replay, not a failure. */
export interface BoundTransferEvidence {
  readonly association: TransferEvidenceAssociation;
  readonly created: boolean;
}

@Injectable()
export class PaymentTransferEvidenceRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Locks one attempt and reads it with its obligation, or reports absence.
   *
   * `FOR UPDATE` on the attempt alone, in its own statement: it is the row the
   * quota is decided under, and locking the obligation as well would make an
   * evidence upload queue behind an unrelated attempt on the same deposit for no
   * gain. The obligation is then read inside the same transaction, so the chain
   * the caller proves is the chain that held when the association committed.
   *
   * @requiresTransaction
   */
  async lockAttemptForEvidence(id: AttemptId): Promise<LockedEvidenceAttempt | undefined> {
    return this.run('lockAttemptForEvidence', async () => {
      const tx = this.requireTransaction('lockAttemptForEvidence');

      const [attempt] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, id))
        .limit(1)
        .for('update');

      if (attempt === undefined) {
        return undefined;
      }

      const [obligation] = await tx
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, attempt.paymentObligationId))
        .limit(1);

      if (obligation === undefined) {
        // Unreachable through `fk_payment_attempts__payment_obligation_id`, and
        // reported as absence rather than asserted away: a caller that cannot
        // see the obligation cannot prove the chain, so it must refuse.
        return undefined;
      }

      return {
        id: attempt.id as AttemptId,
        paymentObligationId: attempt.paymentObligationId as ObligationId,
        status: attempt.status as PaymentAttemptState,
        method: attempt.method,
        grantId: attempt.grantId ?? undefined,
        stepUpChallengeId: attempt.stepUpChallengeId ?? undefined,
        obligationOrderId: obligation.orderId,
        obligationKind: obligation.kind as PaymentObligationKind,
        obligationStatus: obligation.status as PaymentObligationState,
      };
    });
  }

  /**
   * How many evidence images one attempt already holds.
   *
   * Every association counts, whatever its asset's inspection outcome. That is
   * deliberate and differs from `countChallengeReservedSlots`: a `REJECTED`
   * screenshot is still a submission the Admin record must keep and the customer
   * already made, so releasing its slot would let a caller retry past the bound
   * by uploading files it knows will fail.
   *
   * @requiresTransaction — one half of a check-then-insert whose caller must
   * already hold the attempt row lock.
   */
  async countForAttempt(id: AttemptId): Promise<number> {
    return this.run('countForAttempt', async () => {
      this.requireTransaction('countForAttempt');
      const [row] = await this.db
        .select({ total: count() })
        .from(paymentTransferEvidence)
        .where(eq(paymentTransferEvidence.paymentAttemptId, id));
      return row?.total ?? 0;
    });
  }

  /**
   * Binds one asset to one attempt, or confirms the binding that already exists.
   *
   * `onConflictDoNothing` against `uq_payment_transfer_evidence__attempt_asset`
   * rather than a caught `23505`: a caught unique violation aborts the enclosing
   * transaction, which would take the inspection handoff and the completed
   * idempotency record down with it. A repeated pair is a replay by
   * construction, so it is answered with the row that is already there.
   *
   * Only that one constraint is treated as a replay. Any other violation — a
   * dead attempt id, a dead asset id — is left to the mapper, because
   * interpreting it here would turn a broken chain into a silent success.
   *
   * @requiresTransaction
   */
  async bind(input: BindTransferEvidenceInput): Promise<BoundTransferEvidence> {
    return this.run('bind', async () => {
      const tx = this.requireTransaction('bind');

      const [inserted] = await tx
        .insert(paymentTransferEvidence)
        .values({
          id: input.id,
          paymentAttemptId: input.paymentAttemptId,
          assetId: input.assetId,
        })
        .onConflictDoNothing({
          target: [paymentTransferEvidence.paymentAttemptId, paymentTransferEvidence.assetId],
        })
        .returning();

      if (inserted !== undefined) {
        return { association: toAssociation(inserted), created: true };
      }

      const [existing] = await tx
        .select()
        .from(paymentTransferEvidence)
        .where(
          and(
            eq(paymentTransferEvidence.paymentAttemptId, input.paymentAttemptId),
            eq(paymentTransferEvidence.assetId, input.assetId),
          ),
        )
        .limit(1);

      if (existing === undefined) {
        // The insert was skipped, so the pair exists; not finding it means the
        // row was removed by something that has no authority to — reported, not
        // papered over with a fabricated association id.
        throw new Error('A conflicting transfer-evidence association could not be read back.');
      }
      return { association: toAssociation(existing), created: false };
    });
  }

  /**
   * Every association on one attempt, oldest first.
   *
   * Bounded by the five-per-attempt rule rather than by a page size, so there is
   * no cursor and no limit parameter to get wrong. `id` breaks a `created_at`
   * tie so two identical calls cannot order differently.
   */
  async listForAttempt(id: AttemptId): Promise<TransferEvidenceAssociation[]> {
    return this.run('listForAttempt', async () => {
      const rows = await this.db
        .select()
        .from(paymentTransferEvidence)
        .where(eq(paymentTransferEvidence.paymentAttemptId, id))
        .orderBy(asc(paymentTransferEvidence.createdAt), asc(paymentTransferEvidence.id));
      return rows.map(toAssociation);
    });
  }
}

type EvidenceRow = typeof schema.paymentTransferEvidence.$inferSelect;

function toAssociation(row: EvidenceRow): TransferEvidenceAssociation {
  return {
    id: row.id as TransferEvidenceId,
    paymentAttemptId: row.paymentAttemptId as AttemptId,
    assetId: row.assetId,
    createdAt: row.createdAt,
  };
}
