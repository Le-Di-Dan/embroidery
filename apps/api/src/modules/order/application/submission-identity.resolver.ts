/**
 * GRD-001 for `TR-LC11-01`: who is submitting, and may they
 * (`APP5-G01` §3.2, §4.1, `G01-D01`).
 *
 * The rule itself is `VerifiedChallengeIdentityResolver` in the Customer
 * module, where `APP12-B02` moved it once Ready-Made order creation became the
 * second public write that has to answer the same question. This file is what
 * remains and all that ever belonged to Ordering: the **purpose** a submission
 * requires, and the refusal a submission gives when identity does not resolve.
 *
 * ### One refusal for five causes
 *
 * Unknown id, wrong purpose, not `VERIFIED`, never answered and expired all
 * answer `CUSTOMER_NOT_VERIFIED`. Distinguishing them would confirm that a
 * guessed challenge id exists, which is precisely what
 * `GET /api/public/verification/challenges/{id}`'s deliberately minimal
 * disclosure avoids. The resolver returns one `undefined` for all five, so this
 * file cannot accidentally publish a distinction it was never given.
 */
import { Injectable } from '@nestjs/common';

import { VerifiedChallengeIdentityResolver } from '../../customer/application/verified-challenge-identity.resolver';
import type { ChallengeId } from '../../customer/domain/repositories/verification-challenge.repository';
import { RequestSubmissionError } from '../domain/submission/request-submission.errors';

/** The one purpose that authorizes a submission (`VERIFICATION_PURPOSES`). */
const SUBMISSION_PURPOSE = 'SUBMISSION';

@Injectable()
export class SubmissionIdentityResolver {
  constructor(private readonly identities: VerifiedChallengeIdentityResolver) {}

  /**
   * The customer behind a live, verified `SUBMISSION` challenge.
   *
   * @requiresTransaction — the re-read and every write it authorizes must see
   * one consistent state, and the identity resolution joins the caller's
   * transaction rather than opening its own.
   */
  async resolve(challengeId: ChallengeId, now: Date): Promise<string> {
    const customerId = await this.identities.resolve(challengeId, SUBMISSION_PURPOSE, now);
    if (customerId === undefined) {
      throw new RequestSubmissionError('CUSTOMER_NOT_VERIFIED');
    }
    return customerId;
  }
}
