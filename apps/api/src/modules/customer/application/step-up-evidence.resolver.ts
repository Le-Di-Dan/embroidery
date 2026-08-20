/**
 * GRD-003's evidence, resolved server-side (`APP6-B05` §11).
 *
 * {@link StepUpWindow} answers *whether* a fresh `STEP_UP` stands for one
 * contact. A sensitive write that has to **record** its authorization needs one
 * thing more: the challenge row itself. TBL-053 `quotation_acceptances` carries
 * `step_up_challenge_id` under a real foreign key, so acceptance evidence names
 * the proof of presence it was authorized by rather than asserting one existed.
 *
 * ### Why the challenge id is derived and not accepted from the caller
 *
 * A client could supply it — the APP4 verification flow puts the challenge id in
 * the attempt's path, so the browser holds one — and a fully revalidating server
 * would be no less safe. It would be less *correct*, in two ways:
 *
 * - the client's id is a **locator for a fact the server can already reach**.
 *   Everything that would have to be proved about it (that it is a `STEP_UP`,
 *   that it is `VERIFIED`, that it is inside the window, that its contact
 *   belongs to this customer) is exactly the query below, so the field buys
 *   nothing and adds a way for a correct request to be refused: a customer who
 *   verified twice, or verified on their second contact, would send an id that
 *   is real, theirs and fresh — and stale;
 * - it would put a customer-identity input on a public body whose entire design
 *   is that it carries no identifier. `APP6-B04` §5 lists `challengeId` among
 *   the fields that surface deliberately refuses.
 *
 * So the customer comes from the grant, the contacts come from the customer, and
 * the proof comes from the contacts. Nothing on that chain is caller-supplied.
 *
 * ### Which contact
 *
 * Any of the customer's **verified, active** ones. A customer may hold an email
 * and a phone (TBL-005), the step-up can legitimately have been answered on
 * either, and requiring the primary would refuse a customer who genuinely just
 * proved possession. Deactivated and unverified contacts are excluded: a contact
 * that was removed must not keep authorizing money, and an unverified one never
 * could.
 *
 * When more than one contact carries a fresh proof, the **most recent** wins, so
 * the evidence names the step-up that is actually current.
 *
 * ### Fail closed
 *
 * The window comes from the published `secure_grant` policy through
 * {@link SecureGrantPolicyReader}, which raises rather than defaulting. There is
 * no constant here, and adding one would be a second, unversioned source of the
 * period in which one OTP can authorize money.
 *
 * ### It authorizes nothing
 *
 * Same rule {@link StepUpWindow} states: this returns evidence, not a decision.
 * The caller that owns the sensitive action decides, inside its own transaction,
 * and a `undefined` here is that caller's `REVERIFICATION_REQUIRED` to publish.
 */
import { Inject, Injectable } from '@nestjs/common';

import { stepUpNotBefore } from '../domain/grant/secure-grant-policy';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import { SecureGrantPolicyReader } from '../infrastructure/policy/secure-grant-policy.reader';

/**
 * The purpose a step-up is proved by — pinned exactly as {@link StepUpWindow}
 * pins it. `SUBMISSION` is the verification that *creates* an identity and is
 * not evidence that the person is present now.
 */
const STEP_UP = 'STEP_UP' as const;

/** The proof a sensitive write records, and the instant it was given. */
export interface StepUpEvidence {
  readonly challengeId: ChallengeId;
  readonly verifiedAt: Date;
}

@Injectable()
export class StepUpEvidenceResolver {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly policies: SecureGrantPolicyReader,
  ) {}

  /**
   * The freshest `STEP_UP` standing for this customer right now, if any.
   *
   * Joins the caller's transaction when there is one — which is the point: a
   * sensitive write asks this *inside* its transaction, so the proof it records
   * is the proof that was live at the instant it committed.
   */
  async resolve(customerId: CustomerId, now: Date): Promise<StepUpEvidence | undefined> {
    const policy = await this.policies.require();
    const notBefore = stepUpNotBefore(policy, now);

    const contacts = (await this.customers.listContactPoints(customerId)).filter(isUsable);

    let best: StepUpEvidence | undefined;
    for (const contact of contacts) {
      const challenge = await this.challenges.findRecentCompleted(
        contact.contactKind,
        contact.normalizedValue,
        STEP_UP,
        notBefore,
      );
      // `verifiedAt` is `NOT NULL` for a VERIFIED row by CST-115, but the domain
      // type states it optional because an ISSUED challenge has none. Checked
      // rather than asserted: a `!` here would be the one place a malformed row
      // became a `RangeError` inside an acceptance transaction.
      if (challenge?.verifiedAt === undefined) {
        continue;
      }
      if (best === undefined || challenge.verifiedAt.getTime() > best.verifiedAt.getTime()) {
        best = { challengeId: challenge.id, verifiedAt: challenge.verifiedAt };
      }
    }
    return best;
  }
}

/**
 * A contact that may carry a step-up.
 *
 * Verified, because an unverified contact has proved nothing; and not
 * deactivated, because a contact the customer removed must stop authorizing
 * money at the moment it is removed rather than at the end of the window.
 */
function isUsable(contact: ContactPoint): boolean {
  return contact.verifiedAt !== undefined && contact.deactivatedAt === undefined;
}
