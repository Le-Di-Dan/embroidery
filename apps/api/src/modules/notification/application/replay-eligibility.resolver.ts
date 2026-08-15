/**
 * Whether the secret behind a terminal delivery can still be re-sent
 * (`APP4-B08` §18–§19, `APP4_PHASE_ENTRY_AUDIT` §C.8.6).
 *
 * Manual replay copies an **existing** sealed secret. It does not mint one, and
 * it cannot: only a peppered digest is persisted and nothing in APP4 inverts one
 * (`ADR-APP4-001` §10). So replay is permitted exactly while that secret is
 * still usable, and refused the moment it is not.
 *
 * The refusal is the point, not a limitation. Delivering a code that can no
 * longer be entered wastes the customer's time and an SMS; re-delivering a
 * revoked link teaches an attacker that the link existed and helps the customer
 * not at all. `REISSUE_REQUIRED` routes the operator to the business path —
 * `APP4-B03` resend for a new code, `APP4-B05` reissue for a new token — which
 * is the only path that can produce a working secret.
 *
 * ### It reads a reference, never a secret
 *
 * The challenge or grant id comes from the intent's secret-free `params`. This
 * class never touches the envelope, never sees a code or token, and never reads
 * `code_hash` or `token_hash` — it asks each aggregate's own repository for the
 * two facts that decide the question: the lifecycle state, and the deadline.
 *
 * ### Why this class is not in `NotificationModule`
 *
 * It imports the customer module's challenge and grant **ports**, which
 * `RequestNotificationUseCase` deliberately does not — B01's whole design is
 * that intake needs no business repository. Nothing here changes that: this
 * class is wired only by `NotificationAdminModule`, the Admin surface that
 * already composes both contexts, so the delivery path's dependency closure is
 * untouched.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../../customer/domain/repositories/verification-challenge.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type GrantId,
  type SecureAccessGrantRepository,
} from '../../customer/domain/repositories/secure-access-grant.repository';
import type { NotificationReference } from '../domain/notification-request';
import { NotificationClock } from '../infrastructure/clock/notification-clock';

/**
 * The one challenge state whose code can still be entered.
 *
 * `VERIFIED`, `FAILED`, `EXPIRED` and `CANCELLED` are all terminal or closed:
 * LC-02 offers no way back to `ISSUED`, so a code behind any of them is dead
 * whatever its `expires_at` says.
 */
const ANSWERABLE_CHALLENGE_STATE = 'ISSUED';

/**
 * The one grant state whose link still opens anything.
 *
 * A superseded grant needs no separate check: `APP4-B05` revokes the source row
 * before pointing it at its replacement, so supersession is already `REVOKED`.
 */
const LIVE_GRANT_STATE = 'ACTIVE';

@Injectable()
export class ReplayEligibilityResolver {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    private readonly clock: NotificationClock,
  ) {}

  /**
   * `true` when the referenced secret can still be used.
   *
   * A missing aggregate is `false`, not an error: an id that resolves to nothing
   * is as unusable as one that expired, and distinguishing them would make this
   * an existence oracle over two aggregates for no operational gain.
   *
   * Expiry is compared **strictly**, matching every other read in this phase:
   * `resolveActive` uses `expires_at > now`, so an instant exactly on the
   * deadline is already past it. A replay that squeaked through here and was
   * then refused by the resolver would deliver a link that opens nothing.
   */
  async isReplayable(reference: NotificationReference): Promise<boolean> {
    const now = this.clock.now();

    if (reference.kind === 'VERIFICATION_CHALLENGE') {
      const challenge = await this.challenges.findById(reference.challengeId as ChallengeId);
      return (
        challenge !== undefined &&
        challenge.status === ANSWERABLE_CHALLENGE_STATE &&
        challenge.expiresAt.getTime() > now.getTime()
      );
    }

    const grant = await this.grants.findSummaryById(reference.grantId as GrantId);
    return (
      grant !== undefined &&
      grant.status === LIVE_GRANT_STATE &&
      grant.expiresAt.getTime() > now.getTime()
    );
  }
}
