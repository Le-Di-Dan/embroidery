'use client';

/**
 * The two decisions a REQUESTED case admits, and the re-read both end in.
 *
 * ### Nothing is optimistic, in either direction
 *
 * Execution is irreversible and rejection is terminal, so neither is shown as
 * done before the server says so. No `setQueryData` writes `EXECUTED` ahead of
 * the response; the state on screen afterwards is the state the **re-read**
 * returned. The confirm buttons disable while a request is in flight, which is
 * what stops a second click sending a second decision.
 *
 * ### The refusal path re-reads too, and that is what makes it legible
 *
 * `APP10-B02` and `APP10-B03` publish no business code on their refusals, so a
 * 409 alone cannot say whether the case was declined, whether both Customers
 * hold a business profile, or whether the world moved under the preview. The
 * execute hook therefore awaits a fresh case **before** classifying, and reads
 * the reason off what the server now says is true. It also leaves the operator
 * looking at the current record instead of the stale card they acted on — the
 * rule `useGrantRevocation` set for a conflicted revoke and `APP10-A01`
 * generalised.
 *
 * ### `ALREADY_EXECUTED` is a completion, not an error
 *
 * `outcome` is the authoritative field for it. The success state distinguishes
 * the two only in its wording — both are finished, nothing moved twice — and
 * neither is presented as a failure.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AdminCustomerMergeExecutedResponseOutcome } from '@embroidery/api-client';
import type { AdminCustomerMergeCaseResponse } from '@embroidery/api-client';

import {
  classifyExecuteFailure,
  classifyRejectFailure,
  type ExecuteMergeFailure,
  type RejectMergeFailure,
} from '../model/customer-merge-failure';
import { validateMergeReason, type ReasonProblem } from '../model/merge-reason';
import { executeMergeCase, rejectMergeCase } from '../services/customer-merge.service';

type RefetchCase = () => Promise<AdminCustomerMergeCaseResponse | undefined>;

export type ExecuteOutcome = 'EXECUTED' | 'ALREADY_EXECUTED';

export interface ExecuteMergeState {
  readonly running: boolean;
  /** The server's own outcome, never inferred from timing. */
  readonly outcome: ExecuteOutcome | null;
  readonly failure: ExecuteMergeFailure | null;
  readonly run: () => void;
  readonly reset: () => void;
}

export function useExecuteMerge(mergeCaseId: string, refetchCase: RefetchCase): ExecuteMergeState {
  const [outcome, setOutcome] = useState<ExecuteOutcome | null>(null);
  const [failure, setFailure] = useState<ExecuteMergeFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: () => executeMergeCase(mergeCaseId),
  });

  const run = useCallback(() => {
    setOutcome(null);
    setFailure(null);
    mutation.mutate(undefined, {
      onSuccess: (executed) => {
        setOutcome(
          executed.outcome === AdminCustomerMergeExecutedResponseOutcome.ALREADY_EXECUTED
            ? 'ALREADY_EXECUTED'
            : 'EXECUTED',
        );
        void refetchCase();
      },
      onError: (error: unknown) => {
        void refetchCase().then((fresh) => {
          setFailure(classifyExecuteFailure(error, fresh));
        });
      },
    });
  }, [mutation, refetchCase]);

  return {
    running: mutation.isPending,
    outcome,
    failure,
    run,
    reset: useCallback(() => {
      setOutcome(null);
      setFailure(null);
    }, []),
  };
}

export interface RejectMergeState {
  readonly running: boolean;
  readonly succeeded: boolean;
  readonly problem: ReasonProblem | null;
  readonly failure: RejectMergeFailure | null;
  readonly run: (reason: string) => void;
  readonly reset: () => void;
}

export function useRejectMerge(mergeCaseId: string, refetchCase: RefetchCase): RejectMergeState {
  const [succeeded, setSucceeded] = useState(false);
  const [problem, setProblem] = useState<ReasonProblem | null>(null);
  const [failure, setFailure] = useState<RejectMergeFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: (reason: string) => rejectMergeCase(mergeCaseId, reason),
  });

  const run = useCallback(
    (reason: string) => {
      const validated = validateMergeReason(reason);
      if (!validated.ok) {
        setProblem(validated.problem);
        return;
      }
      setProblem(null);
      setFailure(null);
      setSucceeded(false);
      mutation.mutate(validated.value, {
        onSuccess: () => {
          setSucceeded(true);
          void refetchCase();
        },
        onError: (error: unknown) => {
          const classified = classifyRejectFailure(error);
          setFailure(classified);
          // A conflict means the case was decided by somebody else, so the
          // screen must re-read to stop offering decisions on a closed case.
          if (classified === 'already-decided') void refetchCase();
        },
      });
    },
    [mutation, refetchCase],
  );

  return {
    running: mutation.isPending,
    succeeded,
    problem,
    failure,
    run,
    reset: useCallback(() => {
      setSucceeded(false);
      setProblem(null);
      setFailure(null);
    }, []),
  };
}
