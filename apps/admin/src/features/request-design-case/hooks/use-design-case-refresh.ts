'use client';

/**
 * Re-reading server truth after a write (`APP6-A02` §16, §18, §19).
 *
 * Every mutation on this screen is followed by an invalidation and an *awaited*
 * re-read, never by writing the mutation's receipt into the cache. `APP6-B09`'s
 * send describes a transaction that also freezes a document, supersedes
 * siblings and may project the request to `DESIGN_REVIEW` — so the screen shows
 * what the server persisted, not what it believes the server did.
 *
 * The request context is invalidated alongside the history for a reason that is
 * easy to miss: it carries the request status the **gate** reads. A send that
 * moved the request out of `DIGITIZING` must not leave an authoring control on
 * screen, and only a re-read can tell the screen that.
 *
 * The version-detail entries are invalidated by prefix. After a send, every
 * cached detail for this request is stale — the sent version gained a hash and
 * an instant, and `TR-LC08-05` may have superseded a sibling — so invalidating
 * only the one that was acted on would leave the others describing a world that
 * no longer exists.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { requestDesignCaseKeys } from '../model/request-design-case-keys';

export interface DesignCaseRefresh {
  /** Re-reads the request status the gate and the action matrix depend on. */
  readonly refreshContext: () => Promise<void>;
  /** Re-reads the history and every cached version detail for this request. */
  readonly refreshVersions: () => Promise<void>;
  /** Both, for the outcomes that may have moved the request as well. */
  readonly refreshAll: () => Promise<void>;
}

export function useDesignCaseRefresh(requestId: string): DesignCaseRefresh {
  const client = useQueryClient();

  const refreshContext = useCallback(async () => {
    await client.invalidateQueries({ queryKey: requestDesignCaseKeys.context(requestId) });
  }, [client, requestId]);

  const refreshVersions = useCallback(async () => {
    // One prefix covers the list and every version detail: both live under
    // `[...ROOT, 'request', requestId]`.
    await client.invalidateQueries({
      queryKey: [...requestDesignCaseKeys.all, 'request', requestId],
    });
  }, [client, requestId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshContext(), refreshVersions()]);
  }, [refreshContext, refreshVersions]);

  return { refreshContext, refreshVersions, refreshAll };
}
