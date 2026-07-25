'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { LOGIN_ROUTE } from '../../../config/routes';
import { STAFF_SELF_QUERY_KEY } from '../model/session-expiry';

/**
 * Return-to-login transition shared by logout success and session expiry. It
 * clears only the feature-owned current-staff cache (cancel in-flight, then
 * remove), navigates to `/login`, and refreshes so the server components
 * re-render as unauthenticated. No other cache is touched, and no session token
 * or cookie is read — the server owns the cookie.
 */
export function useReturnToLogin(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: STAFF_SELF_QUERY_KEY });
    queryClient.removeQueries({ queryKey: STAFF_SELF_QUERY_KEY });
    router.replace(LOGIN_ROUTE);
    router.refresh();
  }, [router, queryClient]);
}
