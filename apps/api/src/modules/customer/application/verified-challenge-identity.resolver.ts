/**
 * "Who is behind this verification challenge, and may they act on it?" — the
 * APP4 answer, implemented once (`APP4-B02`/`B04`, `APP5-G01` §3.2 `G01-D01`,
 * `APP12-B02` §7).
 *
 * A client presents a **challenge id and never a customer id**. A
 * client-supplied `customerId` would be a direct impersonation vector, which is
 * why the public verification responses deliberately omit it and why no public
 * write contract accepts one.
 *
 * So this resolver re-reads the persisted challenge inside the caller's
 * transaction and resolves the customer through APP4's own path — the
 * `verifiedContactEvidenceOf` → {@link ResolveOrCreateVerifiedCustomer} pair
 * `APP4-B04` uses when it completes a challenge. There is no second
 * customer-resolution algorithm and there must not be: two answers to "who is
 * this contact" is how one of them starts creating duplicate identities.
 *
 * ## Why it lives in the Customer module (`APP12-B02`)
 *
 * `APP5-B01` delivered exactly this logic as `SubmissionIdentityResolver` in
 * the Ordering module, because a custom-request submission was the only public
 * write that needed it. `APP12-B02` makes Ready-Made order creation the second,
 * and the two commands must agree about identity down to the last predicate —
 * a challenge good enough to place an order and not good enough to submit a
 * request, or the reverse, would be a security question with two answers.
 *
 * The rule therefore moved to the module that owns identity, and
 * `SubmissionIdentityResolver` now delegates to it and keeps only its own
 * refusal type. Moved, not copied — the same treatment `IMP-D054` gave the
 * reservation-requirement rule when it acquired a second runtime.
 *
 * ## One absence for five causes
 *
 * Unknown id, wrong purpose, not `VERIFIED`, never answered, and expired all
 * return `undefined`. Distinguishing them would confirm that a guessed
 * challenge id exists, which is precisely what
 * `GET /api/public/verification/challenges/{id}`'s deliberately minimal
 * disclosure avoids. Each caller turns the absence into its own bounded
 * refusal, so no caller learns more than it should and none has to invent a
 * reason.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { VerificationPurpose } from '@embroidery/database';

import { ResolveOrCreateVerifiedCustomer } from './resolve-or-create-verified-customer.service';
import { verifiedContactEvidenceOf } from '../domain/verification/challenge-verified-evidence';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';

@Injectable()
export class VerifiedChallengeIdentityResolver {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly identities: ResolveOrCreateVerifiedCustomer,
  ) {}

  /**
   * The customer behind a live, verified challenge of the given purpose.
   *
   * @requiresTransaction — the re-read and every write it authorizes must see
   * one consistent state, and the identity resolution joins the caller's
   * transaction rather than opening its own.
   */
  async resolve(
    challengeId: ChallengeId,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<string | undefined> {
    const challenge = await this.challenges.findById(challengeId);

    if (
      challenge === undefined ||
      challenge.purpose !== purpose ||
      challenge.status !== 'VERIFIED' ||
      challenge.verifiedAt === undefined ||
      now >= challenge.expiresAt
    ) {
      return undefined;
    }

    const evidence = verifiedContactEvidenceOf(challenge, challenge.verifiedAt);
    if (evidence === undefined) {
      // The stored target is not its own canonical form, so no honest evidence
      // can be built from it — the same refusal `APP4-B04` makes rather than
      // registering an identity under a value the CST-005 arbiter reads
      // differently. Not a distinguishable outcome for the caller.
      return undefined;
    }

    // The ordinary case is that `APP4-B04` already created or resolved this
    // identity when the challenge was answered, so this reads the existing
    // owner and writes nothing. It is still routed through `APP4-B02` rather
    // than short-cut to a contact lookup, because B02 is the only place that
    // knows the rule.
    const resolution = await this.identities.resolve(evidence);
    return resolution.customerId;
  }
}
