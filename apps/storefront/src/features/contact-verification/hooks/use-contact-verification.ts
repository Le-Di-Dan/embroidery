'use client';

/**
 * The `APP4-S01` flow controller: the reducer, the three writes, and the one
 * narrow read that resolves an ambiguous refusal.
 *
 * **Where the verification code lives, and why.** It lives in a ref owned by
 * this hook and in the input's own DOM value, and nowhere else. Every mutation
 * here is declared with **no variables** — `mutate()` is called with no
 * argument and the code is read from the ref inside `mutationFn` — so
 * TanStack's retained `mutation.variables` is permanently `undefined` rather
 * than a copy of the secret sitting in the mutation cache until the next call.
 * `reset()` on settlement clears the mutation entry as well, and the ref is
 * cleared on every exit from code entry: success, resend, expiry, lockout,
 * restart and unmount.
 *
 * That is three independent mechanisms for one secret, which is deliberate: the
 * approved security annotation `634:57` puts the transport-level secret under
 * the same rule, and a single mechanism is one refactor away from being removed
 * by someone who does not know why it was there.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { normalizeApiClientError } from '@embroidery/api-client';
import type { VerificationChallengeStatusResponse } from '@embroidery/api-client';

import {
  issueVerificationChallenge,
  readVerificationChallengeStatus,
  resendVerificationChallenge,
  submitVerificationAttempt,
} from '../api/verification.client';
import { isPlausibleContact, type ContactKind } from '../model/contact-draft';
import {
  DEFAULT_VERIFICATION_PURPOSE,
  type VerificationPurpose,
} from '../model/verification-purpose';
import {
  attemptOutcomeOf,
  deadChallengeOutcome,
  issueOutcomeOf,
  resendOutcomeOf,
} from '../model/verification-outcome';
import {
  initialVerificationState,
  verificationReducer,
  type VerificationChallenge,
} from '../model/verification-state';

/** The challenge facts, copied out of the response and nothing else with them. */
function toChallenge(response: {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  recipientMasked: string;
}): VerificationChallenge {
  return {
    challengeId: response.challengeId,
    expiresAt: response.expiresAt,
    resendAvailableAt: response.resendAvailableAt,
    recipientMasked: response.recipientMasked,
  };
}

export interface ContactVerification {
  readonly state: ReturnType<typeof verificationReducer>;
  readonly setContactKind: (kind: ContactKind) => void;
  readonly setContact: (contact: string) => void;
  readonly requestCode: () => void;
  readonly submitCode: (code: string) => void;
  readonly resendCode: () => void;
  readonly restart: () => void;
  readonly isResending: boolean;
}

/**
 * What the mounting surface fixes about the flow.
 *
 * One field, and it is the only thing that differs between `/xac-minh-lien-he`
 * and the step-up embedded in `/truy-cap/bao-gia`: everything else — the
 * reducer, the three writes, the ambiguity-resolving read, the code's whole
 * lifetime — is identical and is not re-implemented anywhere.
 */
export interface ContactVerificationOptions {
  /** Defaults to `SUBMISSION`, which is what `APP4-S01` has always issued. */
  readonly purpose?: VerificationPurpose;
}

export function useContactVerification(options?: ContactVerificationOptions): ContactVerification {
  const purpose = options?.purpose ?? DEFAULT_VERIFICATION_PURPOSE;
  const [state, dispatch] = useReducer(verificationReducer, initialVerificationState);
  const queryClient = useQueryClient();

  /**
   * The code, for exactly as long as one request needs it.
   *
   * A ref rather than reducer state: reducer state is a value React keeps,
   * snapshots and passes to devtools, and this must not be any of those.
   */
  const codeRef = useRef('');
  const clearCode = useCallback(() => {
    codeRef.current = '';
  }, []);

  // Unmount is an exit from code entry like any other.
  useEffect(() => clearCode, [clearCode]);

  /**
   * Reads the challenge's own state to resolve a refusal the status code cannot.
   *
   * Never throws: this runs inside an error path, and a failed read must not
   * replace one honest outcome with an unhandled rejection. It also deliberately
   * does not go through the query cache — the answer is consumed once, at this
   * instant, and caching it would let a later refusal be resolved by a stale
   * verdict.
   */
  const readState = useCallback(
    async (
      challengeId: string,
    ): Promise<VerificationChallengeStatusResponse['state'] | undefined> => {
      try {
        const status = await readVerificationChallengeStatus(challengeId);
        return status.state;
      } catch {
        return undefined;
      }
    },
    [],
  );

  const issue = useMutation({
    mutationFn: () => issueVerificationChallenge(state.contactKind, state.contact, purpose),
    onSuccess: (response) => {
      clearCode();
      dispatch({ type: 'CHALLENGE_OPENED', challenge: toChallenge(response) });
    },
    onError: (error: unknown) => {
      const outcome = issueOutcomeOf(normalizeApiClientError(error));
      if (outcome === 'INVALID_CONTACT') dispatch({ type: 'CONTACT_REJECTED' });
      else if (outcome === 'RATE_LIMITED') dispatch({ type: 'RATE_LIMITED' });
      else dispatch({ type: 'REQUEST_FAILED' });
    },
    retry: false,
  });

  const resend = useMutation({
    mutationFn: () => {
      const challengeId = state.challenge?.challengeId;
      if (challengeId === undefined) throw new Error('No open challenge to resend.');
      return resendVerificationChallenge(challengeId);
    },
    onSuccess: (response) => {
      // The replacement's identity replaces the old one wholly, and the code
      // typed against the cancelled source is now meaningless (§13).
      clearCode();
      dispatch({ type: 'RESEND_SUCCEEDED', challenge: toChallenge(response) });
    },
    onError: async (error: unknown) => {
      const outcome = resendOutcomeOf(normalizeApiClientError(error));
      if (outcome === 'RATE_LIMITED') {
        dispatch({ type: 'RATE_LIMITED' });
        return;
      }
      if (outcome === 'RECOVERABLE_ERROR') {
        dispatch({ type: 'REQUEST_FAILED' });
        return;
      }
      const challengeId = state.challenge?.challengeId;
      const resolved = deadChallengeOutcome(
        challengeId === undefined ? undefined : await readState(challengeId),
      );
      clearCode();
      if (resolved === 'SUCCESS') dispatch({ type: 'VERIFIED' });
      else if (resolved === 'LOCKED') dispatch({ type: 'CHALLENGE_LOCKED' });
      else if (resolved === 'EXPIRED') dispatch({ type: 'CHALLENGE_EXPIRED' });
      else dispatch({ type: 'REQUEST_FAILED' });
    },
    retry: false,
  });

  const attempt = useMutation({
    // No variables: the code is read from the ref, so nothing TanStack retains
    // after settlement can contain it.
    mutationFn: () => {
      const challengeId = state.challenge?.challengeId;
      if (challengeId === undefined) throw new Error('No open challenge to answer.');
      return submitVerificationAttempt(challengeId, codeRef.current);
    },
    onSuccess: () => {
      clearCode();
      dispatch({ type: 'VERIFIED' });
    },
    onError: async (error: unknown) => {
      const normalized = normalizeApiClientError(error);
      const challengeId = state.challenge?.challengeId;
      const outcome = attemptOutcomeOf(
        normalized,
        challengeId === undefined ? undefined : await readState(challengeId),
      );
      if (outcome === 'MISMATCH') {
        // The one outcome that keeps the customer on the code field. The ref is
        // still cleared: a wrong code left in memory would be resubmitted by the
        // next Enter, and the field empties itself so nothing is left on screen.
        clearCode();
        dispatch({ type: 'ATTEMPT_MISMATCHED' });
        return;
      }
      clearCode();
      if (outcome === 'SUCCESS') dispatch({ type: 'VERIFIED' });
      else if (outcome === 'LOCKED') dispatch({ type: 'CHALLENGE_LOCKED' });
      else if (outcome === 'EXPIRED') dispatch({ type: 'CHALLENGE_EXPIRED' });
      else if (outcome === 'RATE_LIMITED') dispatch({ type: 'RATE_LIMITED' });
      else dispatch({ type: 'REQUEST_FAILED' });
    },
    onSettled: () => {
      // Belt and braces: `variables` is already undefined, and this drops the
      // mutation entry from the cache entirely.
      attempt.reset();
    },
    retry: false,
  });

  const requestCode = useCallback(() => {
    if (!isPlausibleContact(state.contactKind, state.contact)) {
      dispatch({ type: 'CONTACT_REJECTED' });
      return;
    }
    dispatch({ type: 'ISSUE_STARTED' });
    issue.mutate();
  }, [issue, state.contact, state.contactKind]);

  const submitCode = useCallback(
    (code: string) => {
      codeRef.current = code;
      dispatch({ type: 'ATTEMPT_STARTED' });
      attempt.mutate();
    },
    [attempt],
  );

  const resendCode = useCallback(() => {
    resend.mutate();
  }, [resend]);

  const restart = useCallback(() => {
    clearCode();
    // Nothing about the finished challenge may survive into the next one.
    queryClient.clear();
    dispatch({ type: 'RESTARTED' });
  }, [clearCode, queryClient]);

  return {
    state,
    setContactKind: useCallback((kind: ContactKind) => {
      dispatch({ type: 'CONTACT_KIND_CHANGED', contactKind: kind });
    }, []),
    setContact: useCallback((contact: string) => {
      dispatch({ type: 'CONTACT_CHANGED', contact });
    }, []),
    requestCode,
    submitCode,
    resendCode,
    restart,
    isResending: resend.isPending,
  };
}
