/**
 * Who may upload, and whether they still have room (`APP5-G01` §7, `APP5-B02`
 * §5/§6/§9).
 *
 * One collaborator, because the two questions cannot honestly be answered
 * apart on the write path. The challenge must be live *at the moment the
 * reservation is made*, and the quota must be counted *while nothing else can
 * insert* — so both run under the same `FOR UPDATE` lock on the challenge row,
 * which is also the row whose lifetime bounds the whole intake window.
 *
 * There are deliberately two entry points. {@link authorize} is the read path
 * and takes no lock: a poll for "is my photo accepted yet" changes nothing, so
 * there is nothing for a lock to protect, and locking would make status reads
 * serialize behind every concurrent upload on the same challenge.
 * {@link authorizeAndReserve} is the write path and takes the lock.
 *
 * ### Why the challenge row is the lock
 *
 * The quota is a count, and a count is read-then-write: two uploads both see
 * nineteen and both insert a twentieth. There is no row to lock on the asset
 * side — the row that would breach the limit is the one being created — and a
 * counter column would be a second source of truth for something the assets
 * already say. The challenge is the natural arbiter: it is what the bound is
 * *scoped to*, it already exists, and locking it serializes exactly the
 * requests that compete for the same twenty slots and no others.
 *
 * ### Consumption is not a flag
 *
 * "Already submitted" is read from the record `APP5-B01` already writes: its
 * submission claims `(request.submit, <challenge id>)` in `idempotency_records`
 * and completes it inside the submission transaction. A `COMPLETED` row for
 * that key therefore *is* the fact that this challenge produced a request, and
 * it became true atomically with the request itself. A second `consumed`
 * column would be a copy of that fact which could disagree with it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { IdempotencyStore } from '@embroidery/persistence';

import { ResolveOrCreateVerifiedCustomer } from '../../../customer/application/resolve-or-create-verified-customer.service';
import { verifiedContactEvidenceOf } from '../../../customer/domain/verification/challenge-verified-evidence';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallenge,
  type VerificationChallengeRepository,
} from '../../../customer/domain/repositories/verification-challenge.repository';
import {
  ASSET_REPOSITORY,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import { requestIntakeError } from '../../domain/intake/request-intake.errors';
import {
  MAX_ACCEPTED_UPLOADS_PER_CHALLENGE,
  REQUEST_INTAKE_CHALLENGE_PURPOSE,
} from '../../domain/intake/request-intake.policy';
import { REQUEST_SUBMIT_NAMESPACE } from '../../domain/submission/request-submit-idempotency';

/** Everything a reservation needs, all of it server-derived. */
export interface AuthorizedIntake {
  readonly challengeId: ChallengeId;
  readonly customerId: string;
  /** The challenge's own expiry, which becomes the asset's `intake_expires_at`. */
  readonly intakeExpiresAt: Date;
}

/**
 * A challenge that passed the single-row checks.
 *
 * `verifiedAt` is carried out separately because narrowing it inside the guard
 * does not survive the return: the evidence builder needs the non-optional
 * instant, and re-checking it at the call site would be the same guard written
 * twice.
 */
interface LiveChallenge {
  readonly row: VerificationChallenge;
  readonly verifiedAt: Date;
}

@Injectable()
export class ChallengeIntakeAuthorizer {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    private readonly identities: ResolveOrCreateVerifiedCustomer,
    private readonly idempotency: IdempotencyStore,
  ) {}

  /** The read path: proves the challenge still authorizes intake. No lock. */
  async authorize(challengeId: ChallengeId, now: Date): Promise<AuthorizedIntake> {
    const live = this.assertLive(await this.challenges.findById(challengeId), now);
    return this.resolveIdentity(live, challengeId);
  }

  /**
   * The write path: re-authorizes under a row lock and takes one of the twenty
   * slots, or refuses.
   *
   * The lock, the count and the insert the caller performs afterwards are one
   * decision — this method's `FOR UPDATE` is what makes them so, and it is held
   * until the caller's transaction ends. Splitting the check into its own
   * transaction would make the lock decorative, which is exactly the failure
   * the bound exists to prevent.
   *
   * The count is taken **before** identity resolution, while the lock is the
   * only thing that has happened: resolution opens its own reads, and putting
   * them between the lock and the count would widen the window for no reason.
   *
   * @requiresTransaction
   */
  async authorizeAndReserve(challengeId: ChallengeId, now: Date): Promise<AuthorizedIntake> {
    const live = this.assertLive(await this.challenges.lockById(challengeId), now);

    const reserved = await this.assets.countChallengeReservedSlots(challengeId);
    if (reserved >= MAX_ACCEPTED_UPLOADS_PER_CHALLENGE) {
      throw requestIntakeError('REQUEST_INTAKE_QUOTA_REACHED');
    }
    return this.resolveIdentity(live, challengeId);
  }

  /** Every refusal a single challenge row can justify, as one answer. */
  private assertLive(challenge: VerificationChallenge | undefined, now: Date): LiveChallenge {
    if (
      challenge === undefined ||
      challenge.purpose !== REQUEST_INTAKE_CHALLENGE_PURPOSE ||
      challenge.status !== 'VERIFIED' ||
      challenge.verifiedAt === undefined ||
      now >= challenge.expiresAt
    ) {
      // Five causes, one answer. See the module comment.
      throw requestIntakeError('REQUEST_INTAKE_NOT_AUTHORIZED');
    }
    return { row: challenge, verifiedAt: challenge.verifiedAt };
  }

  /** The two checks that have to read beyond the challenge row. */
  private async resolveIdentity(
    live: LiveChallenge,
    challengeId: ChallengeId,
  ): Promise<AuthorizedIntake> {
    if (await this.alreadySubmitted(challengeId)) {
      // The intake window closes when the request exists: further uploads could
      // never be bound to it, so accepting them would store private binaries
      // nothing will ever read.
      throw requestIntakeError('REQUEST_INTAKE_NOT_AUTHORIZED');
    }

    const evidence = verifiedContactEvidenceOf(live.row, live.verifiedAt);
    if (evidence === undefined) {
      // The stored target is not its own canonical form, so no honest evidence
      // can be built from it — the same refusal `APP4-B04` and `APP5-B01` make,
      // and not a distinguishable outcome for the caller.
      throw requestIntakeError('REQUEST_INTAKE_NOT_AUTHORIZED');
    }

    // APP4's own path, exactly as `APP5-B01` uses it. A second customer
    // resolution algorithm is how duplicate identities start.
    const resolution = await this.identities.resolve(evidence);

    return {
      challengeId,
      customerId: resolution.customerId,
      intakeExpiresAt: live.row.expiresAt,
    };
  }

  /**
   * Whether `APP5-B01` has already turned this challenge into a request.
   *
   * `IN_PROGRESS` deliberately does not count: a submission that is mid-flight
   * may still roll back, and refusing an upload because of an attempt that
   * never committed would lose a file for no reason. Only `COMPLETED` is a
   * request that exists.
   */
  private async alreadySubmitted(challengeId: ChallengeId): Promise<boolean> {
    const record = await this.idempotency.find({
      namespace: REQUEST_SUBMIT_NAMESPACE,
      scopeKey: challengeId,
    });
    return record?.status === 'COMPLETED';
  }
}
