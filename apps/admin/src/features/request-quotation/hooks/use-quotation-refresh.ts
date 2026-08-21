'use client';

/**
 * Re-reading server truth after a write (`APP6-A01` §10, §11, §15).
 *
 * Every mutation on this screen is followed by an invalidation and an *awaited*
 * re-read, never by writing the mutation's receipt into the cache. `APP6-B01`'s
 * response is explicitly a receipt rather than a projection, and `APP6-B03`'s
 * result describes a transaction that also moved the request — so the screen
 * shows what the server persisted, not what it believes the server did.
 *
 * The request context is invalidated alongside the history for a reason that is
 * easy to miss: it carries the `quotationId` locator. Until it has been re-read,
 * a freshly created quotation is discoverable only through the value held in
 * memory, and the reload the operator is about to do would land on the empty
 * state. Invalidating it here is what makes the DRAFT durable.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { requestQuotationKeys } from '../model/request-quotation-keys';

export interface QuotationRefresh {
  /** Re-reads the locator. Awaited, so a caller can act on the settled result. */
  readonly refreshContext: () => Promise<void>;
  /** Re-reads the history and every cached version detail for this quotation. */
  readonly refreshQuotation: (quotationId: string) => Promise<void>;
  /** Both, for the outcomes that may have moved the request as well. */
  readonly refreshAll: (quotationId: string | null) => Promise<void>;
}

export function useQuotationRefresh(requestId: string): QuotationRefresh {
  const client = useQueryClient();

  const refreshContext = useCallback(async () => {
    await client.invalidateQueries({ queryKey: requestQuotationKeys.context(requestId) });
  }, [client, requestId]);

  const refreshQuotation = useCallback(
    async (quotationId: string) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: requestQuotationKeys.history(quotationId) }),
        // A prefix invalidation: every cached version detail of this quotation
        // is stale after a send, because the send superseded one of them.
        client.invalidateQueries({
          queryKey: [...requestQuotationKeys.all, 'quotation', quotationId],
        }),
      ]);
    },
    [client],
  );

  const refreshAll = useCallback(
    async (quotationId: string | null) => {
      await refreshContext();
      if (quotationId !== null) {
        await refreshQuotation(quotationId);
      }
    },
    [refreshContext, refreshQuotation],
  );

  return { refreshContext, refreshQuotation, refreshAll };
}
