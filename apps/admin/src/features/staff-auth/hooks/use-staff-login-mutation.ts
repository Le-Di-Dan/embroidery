'use client';

import { type StaffLoginRequest } from '@embroidery/api-client';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { submitStaffLogin } from '../services/staff-login.service';

/**
 * Handwritten TanStack mutation for staff login (generated operations stay
 * hook-free per IMP-D023). Retries are disabled — credentials must never be
 * resubmitted automatically. On success the browser holds a fresh session
 * cookie, so we navigate to the Admin root (owned by APP1-A02) and refresh so
 * server components re-render as authenticated.
 */
export function useStaffLoginMutation(): UseMutationResult<void, unknown, StaffLoginRequest> {
  const router = useRouter();

  return useMutation<void, unknown, StaffLoginRequest>({
    mutationFn: submitStaffLogin,
    retry: false,
    onSuccess: () => {
      router.replace('/');
      router.refresh();
    },
  });
}
