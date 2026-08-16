'use client';

/**
 * Keeping the verified challenge id that `APP4` deliberately throws away.
 *
 * ## The situation
 *
 * `APP4`'s `verificationReducer` clears `challenge` on `VERIFIED`, with a stated
 * reason: nothing downstream may answer it again, and its id has no purpose on
 * the success frame. That is right for `APP4-S01`, which ends there.
 *
 * `APP5-S01` does not end there. `APP5-B02` scopes every upload by the challenge
 * and `APP5-B01` uses it as both the authorization and the idempotency scope of
 * the submission, so the id has to survive the transition — for **this** screen,
 * in **this** screen's state.
 *
 * ## Why this is an observer and not a change to APP4
 *
 * `APP5-S01` §1.3 forbids modifying `APP4` reducer semantics to make `APP5`
 * convenient, and there is no need to: the id is on screen-state for the whole
 * of code entry, so it can simply be **remembered while it is there** and read
 * once the status becomes `SUCCESS`. `APP4` is untouched — same reducer, same
 * actions, same moment of forgetting — and the retention is visibly `APP5`'s.
 *
 * The ref is the retention, not a second copy of live state: it is written only
 * while a challenge exists, read only at the success edge, and cleared whenever
 * the flow leaves success. Nothing is written to `localStorage`,
 * `sessionStorage`, a cookie or the URL — this is not a customer session, and
 * `APP5-S01` §1.3 requires it to die with the flow.
 */
import { useEffect, useRef } from 'react';

import type { ContactVerification } from '../../contact-verification';

export interface UseVerifiedChallengeInput {
  readonly verification: ContactVerification;
  /** The flow already holds a verified id, so a repeat must not re-dispatch. */
  readonly verifiedChallengeId: string | undefined;
  readonly onVerified: (challengeId: string) => void;
  /** The verification left success and the retained id must go with it. */
  readonly onVerificationReset: () => void;
}

export function useVerifiedChallenge(input: UseVerifiedChallengeInput): void {
  const { verification, verifiedChallengeId, onVerified, onVerificationReset } = input;
  const status = verification.state.status;
  const liveChallengeId = verification.state.challenge?.challengeId;

  /**
   * The id of the challenge currently being answered.
   *
   * A resend replaces the challenge outright (`RESEND_SUCCEEDED`), so this
   * follows the latest one rather than the first — the id that gets verified is
   * the id that was on screen at the moment the attempt succeeded.
   */
  const lastChallengeRef = useRef<string | undefined>(undefined);
  if (liveChallengeId !== undefined) lastChallengeRef.current = liveChallengeId;

  useEffect(() => {
    if (status === 'SUCCESS') {
      const challengeId = lastChallengeRef.current;
      // Nothing to retain if no challenge was ever on screen. Unreachable
      // through the flow — success is only ever reached by answering one — but
      // stated rather than asserted away.
      if (challengeId === undefined) return;
      if (verifiedChallengeId === challengeId) return;
      onVerified(challengeId);
      return;
    }

    // Left success: a restart, an expiry after the fact, or a reset from a spent
    // challenge. The retained id is no longer a verified one.
    if (verifiedChallengeId !== undefined) {
      lastChallengeRef.current = undefined;
      onVerificationReset();
    }
  }, [status, verifiedChallengeId, onVerified, onVerificationReset]);
}
