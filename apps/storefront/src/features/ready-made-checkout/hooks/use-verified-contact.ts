'use client';

/**
 * Holding the verified challenge that authorizes the order — and dropping it the
 * instant the contact it was earned for changes (`APP12-S02` §15–§17).
 *
 * ## Why this is not `APP5`'s hook
 *
 * `APP5-S01`'s `use-verified-challenge` retains the id `APP4`'s reducer throws
 * away on success, which is the half this needs too. But it binds the retention
 * to the **flow's status** alone, and `APP12-S02` §16 requires something
 * stronger: the retained authorization must also be bound to the *contact value*
 * it was issued against, so that
 *
 * ```text
 * contact A verified → contact edited to B → submit
 * ```
 *
 * cannot post A's challenge as if it were B's. `APP4`'s `CONTACT_CHANGED` action
 * deliberately changes only `contact` — it is an input event, not a lifecycle
 * one — so the flow can sit at `SUCCESS` while the field beneath it says
 * something else. That is correct for `APP4`, which ends at success; it is a
 * defect here, where success is a credential the next screen spends.
 *
 * So the binding is recorded, not inferred: at the moment the flow reports
 * `SUCCESS` this captures `{ challengeId, contactKind, contact }` together, and
 * any later divergence in *either* half drops the whole thing. `APP4` is
 * untouched — same reducer, same actions, same moment of forgetting — and the
 * additional rule is visibly this checkpoint's.
 *
 * ## What is never retained
 *
 * The verification code. It lives in `APP4`'s own ref and in the code input, and
 * nothing on this path can reach it. The contact value is held in React state
 * for the lifetime of the screen and is never written to the URL, to storage or
 * to a log (`APP12-S02` §19).
 *
 * ## Expiry and revocation stay the server's decision
 *
 * A challenge that lapses between verification and submission still looks
 * verified here, and it should: `APP12-B02` re-reads it inside its own
 * transaction and answers `VERIFIED_CONTACT_REQUIRED`, which the screen renders
 * as the approved refusal and which lets the customer verify again
 * (`APP12-S02` §17). Second-guessing that with a client-side clock would only
 * add a *second*, wrong answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContactVerification } from '../../contact-verification';

/** The verified contact, as one indivisible fact. */
export interface VerifiedContact {
  readonly challengeId: string;
  readonly contactKind: string;
  readonly contact: string;
}

export interface UseVerifiedContact {
  /** Present only while the flow's contact still matches what was verified. */
  readonly verified: VerifiedContact | undefined;
  /** Return to contact entry, discarding the retained authorization. */
  readonly restart: () => void;
}

export function useVerifiedContact(verification: ContactVerification): UseVerifiedContact {
  const { state, restart: restartVerification } = verification;
  const [verified, setVerified] = useState<VerifiedContact | undefined>(undefined);

  /**
   * The id of the challenge currently on screen.
   *
   * A ref because it must survive the reducer clearing `challenge` on `VERIFIED`
   * — the one frame where the id is needed and no longer present. A resend
   * replaces the challenge outright, so this follows the latest one: the id that
   * gets verified is the id that was on screen when the attempt succeeded.
   */
  const liveChallengeRef = useRef<string | undefined>(undefined);
  const challengeId = state.challenge?.challengeId;
  if (challengeId !== undefined) liveChallengeRef.current = challengeId;

  const { status, contact, contactKind } = state;

  /**
   * The contact as it stands right now, read at the capture edge only.
   *
   * A ref, not a dependency, and that is the whole mechanism: an effect that
   * *depended* on the contact would re-run on every keystroke, and because
   * `CONTACT_CHANGED` leaves the status at `SUCCESS` it would happily re-capture
   * the new contact against the old challenge — laundering a stale binding into
   * a fresh-looking one. The capture reads through here so it can only ever
   * happen at the transition into success, and the comparison below is what
   * notices a later edit.
   */
  const liveContactRef = useRef({ contact, contactKind });
  liveContactRef.current = { contact, contactKind };

  useEffect(() => {
    if (status === 'SUCCESS') {
      const challengeId = liveChallengeRef.current;
      // Unreachable through the flow — success is only ever reached by
      // answering a challenge — but stated rather than asserted away.
      if (challengeId === undefined) return;
      setVerified((current) =>
        current === undefined ? { challengeId, ...liveContactRef.current } : current,
      );
      return;
    }

    // Not at success: either the flow left it (restart, expiry after the fact)
    // or it never got there. Either way there is no live authorization.
    liveChallengeRef.current = challengeId;
    setVerified((current) => (current === undefined ? current : undefined));
  }, [status, challengeId]);

  /**
   * The §16 rule, applied on every render rather than only on an event.
   *
   * `CONTACT_CHANGED` keeps the status at `SUCCESS`, so the effect above would
   * happily re-capture the *new* contact against the *old* challenge. Comparing
   * the retained binding with what is on screen right now closes that: a
   * divergence in the value or the kind means the retained authorization is no
   * longer the one this form would be submitting.
   */
  const bound =
    verified !== undefined && verified.contact === contact && verified.contactKind === contactKind
      ? verified
      : undefined;

  const restart = useCallback(() => {
    setVerified(undefined);
    liveChallengeRef.current = undefined;
    restartVerification();
  }, [restartVerification]);

  return { verified: bound, restart };
}
