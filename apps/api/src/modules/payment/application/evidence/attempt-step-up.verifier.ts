/**
 * Re-verifying **the attempt's own** step-up (`APP7-G01` §7.5, `APP7-B05` §6).
 *
 * G01 locks the rule in one clause: evidence is reachable through the grant
 * *"plus the step-up challenge that authorized the attempt — already recorded on
 * `payment_attempts.step_up_challenge_id` and **re-verified, not re-issued**"*.
 * So this reads the challenge the attempt names and proves it is genuine and is
 * this customer's. It issues nothing, and it accepts nothing from the request:
 * there is no `challengeId` field on either evidence body, so a caller cannot
 * present someone else's proof of presence — the same absence
 * `step-up-evidence.resolver.ts` records for initiation.
 *
 * ### Why this is not `StepUpEvidenceResolver`
 *
 * That one answers *"is a fresh step-up standing for this customer right now?"*
 * and returns whichever challenge is most recent. It is the right question for
 * `APP7-B03`, which is **creating** the authorization it records. It is the
 * wrong question here: this operation must check the specific proof the attempt
 * was opened under, and the freshest challenge could easily be a different one.
 *
 * ### Why no freshness window is applied
 *
 * A deliberate reading of two clauses, recorded here rather than left implicit.
 *
 * `APP7-G01` §7.2 states the temporal bound on evidence exactly once, and it is
 * about the attempt: *"once the attempt reaches a terminal state (`SUCCEEDED`,
 * `FAILED`, `EXPIRED`), that attempt accepts no further evidence"*. No accepted
 * document states an evidence-freshness window, and GRD-003's sensitive set
 * names "pay" — the act that moves money's authorization forward — which
 * initiation is and evidence explicitly is not (§7.6: uploading evidence changes
 * no payment state at all).
 *
 * Re-using the initiation window here would also make the capability
 * unreachable in its own normal flow: a customer opens the attempt, leaves for
 * their banking application, transfers, and comes back with a screenshot — a
 * round trip that routinely outlasts a step-up window. The evidence would be
 * refused in exactly the case it exists for, and G01 §7.2's attempt-state rule
 * would almost never be the operative bound.
 *
 * So "re-verified" is read as its own sentence says: the recorded challenge is
 * re-checked — it exists, it is a `STEP_UP`, it completed, and it belongs to
 * this customer — rather than a new one being demanded or minted. The bound on
 * *when* evidence may arrive is the attempt state, enforced by the authorizer.
 */
import { Inject, Injectable } from '@nestjs/common';

import { depositError } from '../../domain/deposit/deposit.errors';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../../../customer/domain/repositories/customer.repository';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../../../customer/domain/repositories/verification-challenge.repository';

/** Pinned exactly as every other step-up consumer pins it. */
const STEP_UP = 'STEP_UP';

/** LC-02's completed state. */
const VERIFIED = 'VERIFIED';

@Injectable()
export class AttemptStepUpVerifier {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
  ) {}

  /**
   * Proves the attempt's recorded step-up, or refuses with
   * `REVERIFICATION_REQUIRED`.
   *
   * The refusal is `APP7-B03`'s published code, reused rather than restated: it
   * is the same rule and the customer's next move is the same one — verify the
   * contact again, which opens a new attempt and a new evidence set.
   *
   * Joins the caller's transaction, so the proof checked is the proof that was
   * live at the instant the association committed.
   */
  async verify(customerId: CustomerId, challengeId: string | undefined): Promise<void> {
    if (challengeId === undefined) {
      // REL-085 is nullable, so an attempt with no recorded proof is
      // representable. It is refused rather than waved through: an attempt this
      // surface cannot tie to a proof of presence is one it cannot authorize.
      throw depositError('REVERIFICATION_REQUIRED');
    }

    const challenge = await this.challenges.findById(challengeId as ChallengeId);
    if (
      challenge === undefined ||
      challenge.purpose !== STEP_UP ||
      challenge.status !== VERIFIED ||
      challenge.verifiedAt === undefined
    ) {
      throw depositError('REVERIFICATION_REQUIRED');
    }

    // The proof has to be *this customer's*. Without this an attempt row whose
    // challenge column had been written from anywhere else would authorize a
    // stranger; with it, the contact the code was answered on must still be one
    // this customer holds.
    const contacts = await this.customers.listContactPoints(customerId);
    const owned = contacts
      .filter(isUsable)
      .some(
        (contact) =>
          contact.contactKind === challenge.contactKind &&
          contact.normalizedValue === challenge.normalizedValue,
      );
    if (!owned) {
      throw depositError('REVERIFICATION_REQUIRED');
    }
  }
}

/**
 * Verified, because an unverified contact has proved nothing; and not
 * deactivated, because a contact the customer removed must stop authorizing
 * anything the moment it is removed.
 */
function isUsable(contact: ContactPoint): boolean {
  return contact.verifiedAt !== undefined && contact.deactivatedAt === undefined;
}
