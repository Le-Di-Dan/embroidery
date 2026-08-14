/**
 * The step-up re-verification window (`APP4-B05` §15, ADR-DB3-004 r4, G-DB7-43).
 *
 * One question, one boolean: *has this contact completed a `STEP_UP`
 * verification recently enough to count right now?*
 *
 * ### What this deliberately is not
 *
 * It does not issue a challenge, does not issue a grant, and **authorizes
 * nothing**. The sensitive actions ADR-DB3-004 r4 lists — quotation acceptance,
 * design approval, payment initiation, contact change — belong to APP6 and APP7,
 * and none of them exists yet. A service that answered "may this customer accept
 * a quotation" would be writing that authorization here, one phase early and
 * without the aggregate it is supposed to serialize on (r8).
 *
 * So the answer is an *input* to a decision, never the decision. The caller that
 * eventually owns a sensitive action asks this, and then does its own work
 * inside its own transaction.
 *
 * ### Why freshness is a query, not a stored flag
 *
 * There is no `step_up_verified_until` column and there must not be one. The
 * window is `stepUpWindowSeconds` measured backwards from *now* over
 * `contact_verification_challenges.verified_at` — durable history that cannot
 * drift from the rows it describes and needs no expiry sweep. A cached flag
 * would stay true after the window closed until something moved it, which is the
 * exact defect `expireStale` exists to work around one table over.
 *
 * ### Fail closed
 *
 * A missing or malformed `secure_grant` policy raises rather than defaulting.
 * There is no safe guess for this window: too long silently widens the period in
 * which a leaked link can authorize money, and the whole point of r4 is that
 * possession of the verified contact is proven *now*.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind } from '@embroidery/database';

import { stepUpNotBefore } from '../domain/grant/secure-grant-policy';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import { SecureGrantPolicyReader } from '../infrastructure/policy/secure-grant-policy.reader';

/**
 * The purpose a step-up is proved by.
 *
 * Pinned as a constant and passed on every query, so the discriminator cannot be
 * dropped by a future edit. `SUBMISSION` is the verification that *creates* an
 * identity; it is not evidence that the person is present now, and letting one
 * satisfy this window would mean the OTP a customer answered when they first
 * submitted a request kept authorizing payments for as long as it was recent.
 */
const STEP_UP = 'STEP_UP' as const;

export interface StepUpQuery {
  readonly contactKind: ContactKind;
  /**
   * The normalized contact, in exactly the form `hasRecentCompleted` matches on.
   *
   * Normalization is P01's and happens at the boundary that accepted the raw
   * input; re-normalizing here would be a second rule, and a second rule is how
   * `A@Example.com` and `a@example.com` stop being one target.
   */
  readonly normalizedValue: string;
  readonly now: Date;
}

@Injectable()
export class StepUpWindow {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly policies: SecureGrantPolicyReader,
  ) {}

  /**
   * Whether a fresh `STEP_UP` verification stands for this contact.
   *
   * Opens no transaction: it reads committed history and writes nothing, so a
   * boundary of its own would add a snapshot without adding a guarantee. A
   * caller that needs the answer to hold while it acts asks inside *its* own
   * transaction, which is what ADR-DB3-004 r9 means by checking the grant inside
   * the action's transaction.
   */
  async isSatisfied(query: StepUpQuery): Promise<boolean> {
    const policy = await this.policies.require();
    return await this.challenges.hasRecentCompleted(
      query.contactKind,
      query.normalizedValue,
      STEP_UP,
      stepUpNotBefore(policy, query.now),
    );
  }
}
