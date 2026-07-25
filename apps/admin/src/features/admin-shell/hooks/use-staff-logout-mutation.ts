'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { submitStaffLogout } from '../services/staff-logout.service';
import { useReturnToLogin } from './use-return-to-login';

export type StaffLogoutMutation = UseMutationResult<void, Error, void>;

/**
 * Handwritten TanStack mutation for staff logout. Retries are disabled — logout
 * must never be replayed automatically. The service treats a 204 and a 401
 * identically (the session ends either way) and resolves; both therefore run the
 * shared return-to-login transition, which clears the current-staff cache and
 * navigates to `/login`.
 *
 * A genuine dependency failure (network/timeout/5xx) rejects: the shell stays
 * visible, the cache is untouched, and the UI shows a safe retry affordance. No
 * raw backend/Axios error is exposed.
 */
export function useStaffLogoutMutation(): StaffLogoutMutation {
  const returnToLogin = useReturnToLogin();

  return useMutation<void, Error, void>({
    mutationFn: submitStaffLogout,
    retry: false,
    onSuccess: () => {
      void returnToLogin();
    },
  });
}
