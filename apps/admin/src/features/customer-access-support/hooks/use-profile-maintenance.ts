'use client';

/**
 * The profile edit lifecycle: normal → editing → saving → saved, and the
 * refusals in between.
 *
 * ### The draft is form state; the profile is server state
 *
 * The two are never confused. `draft` exists only while the operator is editing
 * and is seeded from the authoritative detail when editing opens; the moment the
 * save succeeds it is discarded and the panel goes back to rendering what the
 * server returned. Nothing writes the submitted value into the query cache, so
 * a patch the server silently declined to apply cannot appear on screen as if
 * it had been.
 *
 * ### The success path re-reads rather than predicts
 *
 * `PATCH /api/admin/customers/{customerId}` answers 204 and republishes nothing,
 * so there is no updated Customer to adopt. The hook re-reads the Customer and
 * lets the panel render that. `retry: false`, because a refused patch will be
 * refused again and a 409 on a merged Customer is not a transient failure.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import { classifyProfileFailure, type ProfileFailure } from '../model/customer-maintenance-failure';
import {
  draftOf,
  validateProfileDraft,
  type ProfileDraft,
  type ProfileProblem,
} from '../model/profile-draft';
import { updateCustomerProfile } from '../services/customer-maintenance.service';

export interface ProfileMaintenanceState {
  readonly draft: ProfileDraft | null;
  readonly running: boolean;
  readonly saved: boolean;
  readonly problem: ProfileProblem | null;
  readonly failure: ProfileFailure | null;
  readonly begin: (customer: AdminCustomerDetailResponse) => void;
  readonly change: (field: keyof ProfileDraft, value: string) => void;
  readonly cancel: () => void;
  readonly save: (customer: AdminCustomerDetailResponse) => void;
  readonly reset: () => void;
}

export function useProfileMaintenance(
  customerId: string | null,
  refetchCustomer: () => Promise<AdminCustomerDetailResponse | undefined>,
): ProfileMaintenanceState {
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<ProfileProblem | null>(null);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateCustomerProfile>[1] }) =>
      updateCustomerProfile(id, body),
  });

  const reset = useCallback(() => {
    setDraft(null);
    setSaved(false);
    setProblem(null);
    setFailure(null);
  }, []);

  const begin = useCallback((customer: AdminCustomerDetailResponse) => {
    setDraft(draftOf(customer));
    setSaved(false);
    setProblem(null);
    setFailure(null);
  }, []);

  const change = useCallback((field: keyof ProfileDraft, value: string) => {
    setDraft((current) => (current === null ? current : { ...current, [field]: value }));
    setProblem(null);
  }, []);

  const cancel = useCallback(() => {
    setDraft(null);
    setProblem(null);
    setFailure(null);
  }, []);

  const save = useCallback(
    (customer: AdminCustomerDetailResponse) => {
      if (draft === null || customerId === null) return;
      const validated = validateProfileDraft(draft, customer);
      if (!validated.ok) {
        setProblem(validated.problem);
        return;
      }
      setProblem(null);
      setFailure(null);
      setSaved(false);
      mutation.mutate(
        { id: customerId, body: validated.body },
        {
          onSuccess: () => {
            // The form closes first, so what the operator reads next is the
            // server's record and not the text they typed.
            setDraft(null);
            setSaved(true);
            void refetchCustomer();
          },
          onError: (error: unknown) => {
            setFailure(classifyProfileFailure(error));
          },
        },
      );
    },
    [customerId, draft, mutation, refetchCustomer],
  );

  return {
    draft,
    running: mutation.isPending,
    saved,
    problem,
    failure,
    begin,
    change,
    cancel,
    save,
    reset,
  };
}
