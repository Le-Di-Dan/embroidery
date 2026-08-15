'use client';

/**
 * The revoke command, and the one cache invalidation it justifies.
 *
 * ### Nothing is flipped optimistically
 *
 * Revocation is terminal and kills a customer's only way back into their
 * request, so the screen never shows it as done before the server says so. The
 * status changes because the refetched grants say it changed — there is no local
 * `setQueryData` writing `REVOKED` ahead of the response, and the button stays
 * disabled while the request is in flight so a second click cannot send a second
 * revoke.
 *
 * ### The conflict refetches too, and that is the point
 *
 * A 409 means the grant stopped being ACTIVE between the read and the click —
 * expired, or revoked by someone else. The operator is not shown an error and
 * left with a stale card: the grants query is invalidated on **both** paths, so
 * what they see next is the canonical current state either way. The difference
 * is only what the banner says.
 *
 * ### Only the grants
 *
 * `customerAccessKeys.grants(customerId)` and nothing else. The Customer record
 * did not change — revoking a link does not touch a contact or a verification —
 * and the notifications did not either, because revocation mints nothing and
 * sends nothing. Invalidating them would be re-reading two endpoints to display
 * identical data.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { classifyRevokeFailure, type RevokeFailure } from '../model/customer-access-failure';
import { customerAccessKeys } from '../model/customer-access-keys';
import { revokeSecureGrant } from '../services/customer-access.service';

export interface GrantRevocationState {
  readonly running: boolean;
  /** Set once the server confirmed the revocation. Drives the success banner. */
  readonly succeeded: boolean;
  readonly failure: RevokeFailure | null;
  readonly run: (grantId: string, reason: string) => void;
  readonly reset: () => void;
}

export function useGrantRevocation(
  customerId: string | null,
  onSettled: () => void,
): GrantRevocationState {
  const queryClient = useQueryClient();
  const [succeeded, setSucceeded] = useState(false);
  const [failure, setFailure] = useState<RevokeFailure | null>(null);

  const refreshGrants = useCallback(() => {
    if (customerId === null) return;
    void queryClient.invalidateQueries({ queryKey: customerAccessKeys.grants(customerId) });
  }, [customerId, queryClient]);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({ grantId, reason }: { grantId: string; reason: string }) =>
      revokeSecureGrant(grantId, reason),
  });

  const run = useCallback(
    (grantId: string, reason: string) => {
      setSucceeded(false);
      setFailure(null);
      mutation.mutate(
        { grantId, reason },
        {
          onSuccess: () => {
            setSucceeded(true);
            refreshGrants();
            onSettled();
          },
          onError: (error: unknown) => {
            const classified = classifyRevokeFailure(error);
            setFailure(classified);
            // A conflict means the row moved, so the screen must re-read to stop
            // showing a state that is no longer true. Nothing else does.
            if (classified === 'conflict') refreshGrants();
            onSettled();
          },
        },
      );
    },
    [mutation, onSettled, refreshGrants],
  );

  return {
    running: mutation.isPending,
    succeeded,
    failure,
    run,
    reset: useCallback(() => {
      setSucceeded(false);
      setFailure(null);
    }, []),
  };
}
