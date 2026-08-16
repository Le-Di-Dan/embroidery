/**
 * GRD-001 for `TR-LC11-01`: who is submitting, and may they
 * (`APP5-G01` §3.2, §4.1, `G01-D01`).
 *
 * The client presents a **challenge id and never a customer id**. A
 * client-supplied `customerId` would be a direct impersonation vector, and
 * `custom_requests.customer_id` is therefore never client-derived; the public
 * verification responses deliberately omit it for the same reason.
 *
 * So this resolver re-reads the persisted challenge inside the submission
 * transaction and resolves the customer through **APP4's own path** — the same
 * `verifiedContactEvidenceOf` → `ResolveOrCreateVerifiedCustomer` pair
 * `APP4-B04` uses when it completes a `SUBMISSION` challenge. There is no second
 * customer-resolution algorithm here, and there must not be: two answers to
 * "who is this contact" is how one of them starts creating duplicate identities.
 *
 * ### One refusal for five causes
 *
 * Unknown id, wrong purpose, not `VERIFIED`, never answered and expired all
 * answer `CUSTOMER_NOT_VERIFIED`. Distinguishing them would confirm that a
 * guessed challenge id exists, which is precisely what
 * `GET /api/public/verification/challenges/{id}`'s deliberately minimal
 * disclosure avoids.
 */
import { Inject, Injectable } from '@nestjs/common';

import { ResolveOrCreateVerifiedCustomer } from '../../customer/application/resolve-or-create-verified-customer.service';
import { verifiedContactEvidenceOf } from '../../customer/domain/verification/challenge-verified-evidence';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../../customer/domain/repositories/verification-challenge.repository';
import { RequestSubmissionError } from '../domain/submission/request-submission.errors';

/** The one purpose that authorizes a submission (`VERIFICATION_PURPOSES`). */
const SUBMISSION_PURPOSE = 'SUBMISSION';

@Injectable()
export class SubmissionIdentityResolver {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly identities: ResolveOrCreateVerifiedCustomer,
  ) {}

  /**
   * The customer behind a live, verified `SUBMISSION` challenge.
   *
   * @requiresTransaction — the re-read and every write it authorizes must see
   * one consistent state, and the identity resolution joins the caller's
   * transaction rather than opening its own.
   */
  async resolve(challengeId: ChallengeId, now: Date): Promise<string> {
    const challenge = await this.challenges.findById(challengeId);

    if (
      challenge === undefined ||
      challenge.purpose !== SUBMISSION_PURPOSE ||
      challenge.status !== 'VERIFIED' ||
      challenge.verifiedAt === undefined ||
      now >= challenge.expiresAt
    ) {
      throw new RequestSubmissionError('CUSTOMER_NOT_VERIFIED');
    }

    const evidence = verifiedContactEvidenceOf(challenge, challenge.verifiedAt);
    if (evidence === undefined) {
      // The stored target is not its own canonical form, so no honest evidence
      // can be built from it — the same refusal `APP4-B04` makes rather than
      // registering an identity under a value the CST-005 arbiter reads
      // differently. Not a distinguishable outcome for the caller.
      throw new RequestSubmissionError('CUSTOMER_NOT_VERIFIED');
    }

    // Case A in practice: `APP4-B04` already created or resolved this identity
    // when the challenge was answered, so this reads the existing owner and
    // writes nothing. It is still routed through B02 rather than short-cut to a
    // contact lookup, because B02 is the only place that knows the rule.
    const resolution = await this.identities.resolve(evidence);
    return resolution.customerId;
  }
}
