'use client';

/**
 * The two canonical reads behind the inventory workspace, and the invalidation
 * that keeps them honest.
 *
 * Both are keyed by `skuId` alone, because that is the only address
 * `APP8-B01` accepts. They are separate queries rather than one combined read
 * for two reasons: they are two HTTP operations, and a failed history must not
 * blank out the metrics beside it — an operator who can see on-hand and
 * availability can still act, even when the ledger is unreadable.
 *
 * `staleTime` is short. Availability is computed under a row lock and is true
 * only for the transaction that produced it; a worker reserving stock for a
 * paid order can move it at any moment. It is not zero, so opening and closing
 * the adjustment dialog does not re-request the page.
 *
 * No automatic retry, no polling and no focus refetch. A failed read is
 * reported with an explicit retry the operator triggers, never a silent loop
 * against a private Admin endpoint.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { AdminSkuStockLedgerResponse, AdminSkuStockResponse } from '@embroidery/api-client';

import { skuStockKeys } from '../model/sku-stock-keys';
import { fetchSkuStock, fetchSkuStockLedger } from '../services/sku-stock.service';

export const SKU_STOCK_STALE_TIME_MS = 15_000;

export type SkuStockQueryResult = UseQueryResult<AdminSkuStockResponse, Error>;
export type SkuStockLedgerQueryResult = UseQueryResult<AdminSkuStockLedgerResponse, Error>;

export function useSkuStockQuery(skuId: string): SkuStockQueryResult {
  return useQuery({
    queryKey: skuStockKeys.stock(skuId),
    queryFn: ({ signal }) => fetchSkuStock({ skuId, signal }),
    staleTime: SKU_STOCK_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSkuStockLedgerQuery(skuId: string): SkuStockLedgerQueryResult {
  return useQuery({
    queryKey: skuStockKeys.ledger(skuId),
    queryFn: ({ signal }) => fetchSkuStockLedger({ skuId, signal }),
    staleTime: SKU_STOCK_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface SkuStockRefresh {
  /** Re-reads the stock record and resolves with it. */
  readonly refreshStock: () => Promise<AdminSkuStockResponse | undefined>;
  /** Re-reads the stock record and the ledger behind it. */
  readonly refreshAll: () => Promise<AdminSkuStockResponse | undefined>;
}

/**
 * Re-reads whatever an adjustment may have changed — and nothing else.
 *
 * Two invalidations, both scoped to this SKU:
 *
 * - **the stock record**, because the delta moved `quantityOnHand` and
 *   therefore `available`, and because this is the only way the screen learns
 *   what actually happened. The response of the write is never projected into
 *   the cache as a substitute for re-reading, so nothing on screen can be a
 *   quantity the database does not have.
 * - **the ledger**, because a successful adjustment appended exactly one
 *   `ADJUSTMENT` row and the history must show it.
 *
 * Nothing else is touched. There is no `invalidateQueries()` without a key —
 * that would re-fetch every other Admin screen's cached data for a change that
 * concerns one SKU — and no other feature's root is invalidated, because no
 * other Admin surface reads stock.
 *
 * `refreshStock` is the narrow one, awaited by the refusal and ambiguity paths:
 * it returns the record the dialog has to quote, and it leaves the ledger alone
 * because at that moment the screen does not yet know whether anything moved.
 */
export function useSkuStockRefresh(skuId: string): SkuStockRefresh {
  const queryClient = useQueryClient();

  const refreshStock = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: skuStockKeys.stock(skuId) });
    return queryClient.getQueryData<AdminSkuStockResponse>(skuStockKeys.stock(skuId));
  }, [queryClient, skuId]);

  const refreshAll = useCallback(async () => {
    const stock = await refreshStock();
    await queryClient.invalidateQueries({ queryKey: skuStockKeys.ledger(skuId) });
    return stock;
  }, [queryClient, refreshStock, skuId]);

  return { refreshStock, refreshAll };
}
