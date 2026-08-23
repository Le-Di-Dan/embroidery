'use client';

/**
 * The two canonical reads behind the workspace, and the invalidation that keeps
 * them honest.
 *
 * `APP7-B02` owns the frozen order; `APP7-B04` owns every payment fact. They are
 * separate queries under stable, order-scoped keys, so a payment decision
 * re-reads the payment truth without re-downloading an order that cannot have
 * changed except in its own status — and so no component fetches either one a
 * second time.
 *
 * `staleTime` is short for both: another operator may be reconciling the same
 * deposit right now, and a stale panel is one that offers a decision against a
 * state the attempt has already left. It is not zero, so opening and closing a
 * dialog does not re-request the page.
 *
 * No automatic retry, no polling and no focus refetch. A failed read is reported
 * with an explicit retry the operator triggers, never a silent loop against a
 * private Admin endpoint — and, on a money surface, never a loop that could look
 * to the server like a caller hammering a verification route.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { AdminOrderDetailResponse, AdminOrderPaymentsResponse } from '@embroidery/api-client';

import { orderQueueKeys } from '../../order-queue';
import { orderDetailKeys } from '../model/order-detail-keys';
import { fetchOrderDetail, fetchOrderPayments } from '../services/order-detail.service';

export const ORDER_DETAIL_STALE_TIME_MS = 15_000;

export type OrderDetailQueryResult = UseQueryResult<AdminOrderDetailResponse, Error>;
export type OrderPaymentsQueryResult = UseQueryResult<AdminOrderPaymentsResponse, Error>;

export function useOrderDetailQuery(orderId: string): OrderDetailQueryResult {
  return useQuery({
    queryKey: orderDetailKeys.detail(orderId),
    queryFn: ({ signal }) => fetchOrderDetail({ orderId, signal }),
    staleTime: ORDER_DETAIL_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useOrderPaymentsQuery(orderId: string): OrderPaymentsQueryResult {
  return useQuery({
    queryKey: orderDetailKeys.payments(orderId),
    queryFn: ({ signal }) => fetchOrderPayments({ orderId, signal }),
    staleTime: ORDER_DETAIL_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface PaymentRefresh {
  /** Re-reads the payment truth and resolves with it. */
  readonly refreshPayments: () => Promise<AdminOrderPaymentsResponse | undefined>;
  /** Re-reads the payment truth, the order, and the queue root behind them. */
  readonly refreshAll: () => Promise<AdminOrderPaymentsResponse | undefined>;
}

/**
 * Re-reads whatever a decision may have changed — and nothing else.
 *
 * Three invalidations, each with a reason:
 *
 * - **the payments**, because the attempt status, the obligation status, the
 *   new reconciliation row and the satisfying attempt are what the panel must
 *   render. This is the only way the screen learns what actually happened: the
 *   decision receipt is never projected into the cache, so nothing on screen can
 *   be a payment the database does not have.
 * - **the order**, because an exact match moves it `AWAITING_DEPOSIT` →
 *   `DEPOSIT_PAID`, and its own header states that status.
 * - **the queue root**, because that same move changes which orders belong in a
 *   status-filtered queue. The key comes from `APP7-A01`'s queue feature rather
 *   than from a literal spelled again here: two spellings of one cache key is
 *   how an invalidation silently stops matching and an operator returns to a
 *   queue still listing work they just finished.
 *
 * The **evidence** entries are deliberately not invalidated by a decision. A
 * verification changes no image, and their `gcTime: 0` means those entries do
 * not survive being unobserved anyway — re-reading them would re-download a
 * customer's private photographs to display bytes that did not change.
 *
 * `refreshPayments` is the narrow one, awaited by the ambiguity recovery: it
 * returns the payment truth the caller has to inspect, and it does not touch the
 * queue, because at that moment the screen does not yet know whether anything
 * moved.
 */
export function useOrderRefresh(orderId: string): PaymentRefresh {
  const queryClient = useQueryClient();

  const refreshPayments = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: orderDetailKeys.payments(orderId) });
    return queryClient.getQueryData<AdminOrderPaymentsResponse>(orderDetailKeys.payments(orderId));
  }, [orderId, queryClient]);

  const refreshAll = useCallback(async () => {
    const payments = await refreshPayments();
    await queryClient.invalidateQueries({ queryKey: orderDetailKeys.detail(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderQueueKeys.lists() });
    return payments;
  }, [orderId, queryClient, refreshPayments]);

  return { refreshPayments, refreshAll };
}
