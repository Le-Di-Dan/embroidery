'use client';

/**
 * Sending the request exactly once (`656:3`, `656:74`, `656:119`, `656:166`,
 * `656:213`).
 *
 * ## Two mechanisms, because one is not enough
 *
 * The backend's challenge-scoped idempotency is the authority: a repeat of the
 * same body replays the same result rather than creating a second request. That
 * is what makes a retry *safe*. It is not what stops a customer double-clicking,
 * so the screen adds its own: the action is disabled while a submission is in
 * flight, and this hook refuses a second `submit()` before the first settles —
 * so one logical click is one mutation whatever the button does.
 *
 * ## An unknown outcome is not a failure
 *
 * A submission that never came back may or may not have been created. Resetting
 * the form there would discard work that the server may already hold; declaring
 * failure would be a claim this code cannot support. It becomes the approved
 * *uncertain* state, whose only action is to send the same body again — which
 * the idempotency scope turns into a replay rather than a duplicate.
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import {
  normalizeApiClientError,
  type CustomRequestSubmissionResponse,
  type SubmitCustomRequestBody,
} from '@embroidery/api-client';

import { submitCustomRequest } from '../api/custom-request.client';
import { submissionOutcomeOf, type SubmissionOutcome } from '../model/submission-outcome';

export interface RequestSubmission {
  readonly isSubmitting: boolean;
  /** The approved outcome frame to show, or `undefined` before the first try. */
  readonly outcome: SubmissionOutcome | undefined;
  readonly result: CustomRequestSubmissionResponse | undefined;
  /** Ignored while a submission is in flight. */
  readonly submit: (body: SubmitCustomRequestBody) => void;
  readonly clearOutcome: () => void;
}

export interface UseRequestSubmissionInput {
  /**
   * The S02 handoff. Called once, with the minimum the confirmation needs —
   * `APP5-S02` owns everything shown after this point.
   */
  readonly onSubmitted: (result: CustomRequestSubmissionResponse) => void;
}

export function useRequestSubmission(input: UseRequestSubmissionInput): RequestSubmission {
  const { onSubmitted } = input;
  const [outcome, setOutcome] = useState<SubmissionOutcome | undefined>(undefined);
  const [result, setResult] = useState<CustomRequestSubmissionResponse | undefined>(undefined);

  /**
   * In-flight, in a ref rather than from the mutation's own status.
   *
   * `isPending` is state, so two clicks in the same tick both read the value
   * from before the first render — the exact case a duplicate-safe action has
   * to survive. A ref is written synchronously and is therefore already `true`
   * when the second click reads it.
   */
  const inFlightRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (body: SubmitCustomRequestBody) => submitCustomRequest(body),
    // No automatic retry: whether a re-send is safe is a decision the approved
    // states put in front of the customer, not something to do behind them.
    retry: false,
    onSuccess: (response) => {
      inFlightRef.current = false;
      setOutcome(undefined);
      setResult(response);
      // A replay returns the original result with the same request code, so it
      // arrives here and is treated as exactly what it is: a success.
      onSubmitted(response);
    },
    onError: (error) => {
      inFlightRef.current = false;
      setOutcome(submissionOutcomeOf(normalizeApiClientError(error)));
    },
  });

  const submit = useCallback(
    (body: SubmitCustomRequestBody) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setOutcome(undefined);
      mutation.mutate(body);
    },
    [mutation],
  );

  return {
    isSubmitting: mutation.isPending,
    outcome,
    result,
    submit,
    clearOutcome: useCallback(() => {
      setOutcome(undefined);
    }, []),
  };
}
