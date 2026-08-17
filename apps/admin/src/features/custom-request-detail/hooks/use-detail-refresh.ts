'use client';

/**
 * Re-reads the request after anything that may have changed it.
 *
 * Two invalidations, and both are justified rather than defensive:
 *
 * - **the detail**, because the persisted status, the new transition row and the
 *   appended note are what the screen must render. This is the only way A02
 *   learns what actually happened — the mutation receipts are not projected into
 *   the cache, so nothing on screen can be a transition the database does not
 *   have.
 * - **the queue root**, because a moderation move changes which requests belong
 *   in triage. The key comes from `APP5-A01`'s published factory rather than
 *   from a literal spelled again here: two spellings of one cache key is how an
 *   invalidation silently stops matching and an operator returns to a queue
 *   still listing work they just finished.
 *
 * The evidence entries are deliberately *not* invalidated. A transition changes
 * no asset, and `gcTime: 0` means those entries do not survive being unobserved
 * anyway — re-reading them would re-download a customer's photographs to display
 * bytes that did not change.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { customRequestQueueKeys } from '../../custom-request-queue';
import { customRequestDetailKeys } from '../model/custom-request-detail-keys';

export function useDetailRefresh(requestId: string): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: customRequestDetailKeys.detail(requestId),
    });
    void queryClient.invalidateQueries({ queryKey: customRequestQueueKeys.lists() });
  }, [queryClient, requestId]);
}
