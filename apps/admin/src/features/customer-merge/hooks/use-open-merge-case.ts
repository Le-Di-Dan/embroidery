'use client';

/**
 * Opening a case, and the one navigation it ends in.
 *
 * ### Opening moves nothing
 *
 * `POST /api/admin/customer-merges` records a decision waiting to be made: no
 * contact moves, no grant is revoked, nothing is repointed and neither Customer
 * is tombstoned. The copy says so beside the button, and this hook does nothing
 * on success except navigate — there is no cache to update, because the case did
 * not exist a moment ago and the screen it lands on reads the authority itself.
 *
 * ### The reason is validated here, sent trimmed, and never stored
 *
 * It goes into the request body and stays in component state until the operator
 * leaves. It is not written to a query key or to storage — it is the operator's
 * own words about two identifiable people.
 *
 * `retry: false`: a refused open will be refused again, and a duplicate-open
 * conflict is not a transient failure. The pending flag is what stops a second
 * click producing a second case for the same pair — the unique index would
 * refuse it, but a request that cannot succeed should not be sent.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { classifyOpenFailure, type OpenMergeFailure } from '../model/customer-merge-failure';
import { adminCustomerMergeCaseRoute } from '../model/customer-merge-route';
import { validateMergeReason, type ReasonProblem } from '../model/merge-reason';
import { openMergeCase } from '../services/customer-merge.service';

export interface OpenMergeCaseState {
  readonly running: boolean;
  readonly problem: ReasonProblem | null;
  readonly failure: OpenMergeFailure | null;
  readonly submit: (survivorCustomerId: string, loserCustomerId: string, reason: string) => void;
  readonly clearProblem: () => void;
}

export function useOpenMergeCase(): OpenMergeCaseState {
  const router = useRouter();
  const [problem, setProblem] = useState<ReasonProblem | null>(null);
  const [failure, setFailure] = useState<OpenMergeFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      survivorCustomerId,
      loserCustomerId,
      reason,
    }: {
      survivorCustomerId: string;
      loserCustomerId: string;
      reason: string;
    }) => openMergeCase(survivorCustomerId, loserCustomerId, reason),
  });

  const submit = useCallback(
    (survivorCustomerId: string, loserCustomerId: string, reason: string) => {
      const validated = validateMergeReason(reason);
      if (!validated.ok) {
        setProblem(validated.problem);
        return;
      }
      setProblem(null);
      setFailure(null);
      mutation.mutate(
        { survivorCustomerId, loserCustomerId, reason: validated.value },
        {
          onSuccess: (mergeCaseId) => {
            router.push(adminCustomerMergeCaseRoute(mergeCaseId));
          },
          onError: (error: unknown) => {
            setFailure(classifyOpenFailure(error));
          },
        },
      );
    },
    [mutation, router],
  );

  return {
    running: mutation.isPending,
    problem,
    failure,
    submit,
    clearProblem: useCallback(() => {
      setProblem(null);
    }, []),
  };
}
