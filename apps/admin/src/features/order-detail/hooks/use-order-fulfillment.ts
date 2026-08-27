'use client';

/**
 * The APP9 read, the four APP9 commands, and the invalidation that keeps the
 * screen honest after each of them.
 *
 * ## Nothing here projects a receipt into the cache
 *
 * Every command returns a receipt saying what committed, and none of it is
 * written into a query. The screen learns the new state by **re-reading**, so
 * what it renders is what the database has. That rule is what makes an ambiguous
 * failure survivable: a dispatch whose response was lost is reconciled by the
 * same re-read as a dispatch that succeeded, and the operator sees the truth
 * either way rather than an optimistic `DELIVERED` the server never wrote.
 *
 * ## The invalidation is scoped to what each command can actually change
 *
 * - **opening the final payment** moves the order's status, so the order and the
 *   queue root. The shipping detail is not read in that stage and the payments
 *   are untouched — the REMAINING obligation is neither created nor moved.
 * - **saving the shipping detail** moves the detail and, when the fee changed,
 *   the balance behind it. The order's own status never moves, so the order and
 *   the queue are left alone.
 * - **dispatching** moves the order and freezes the detail: both, plus the
 *   queue root, whose status filter the move changes.
 * - **completing** moves the order alone. The frozen detail cannot change again.
 *
 * The deposit payments are never invalidated by any of them. No APP9 command
 * touches the DEPOSIT obligation, its attempts, its evidence or its
 * reconciliations, and re-reading them would re-request a customer's private
 * payment metadata to display bytes that did not change.
 *
 * The queue key comes from the queue feature rather than from a literal spelled
 * again here: two spellings of one cache key is how an invalidation silently
 * stops matching and an operator returns to a queue still listing work they just
 * finished.
 *
 * ## No polling, no retry, no focus refetch
 *
 * A failed read is reported with an explicit retry the operator triggers. On a
 * surface where one of the reads sits beside a control that freezes an address
 * permanently, a silent loop against a private Admin endpoint is not a
 * convenience.
 */
import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  AdminOrderCompletionResponse,
  AdminOrderDispatchResponse,
  AdminOrderTransitionResultResponse,
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
  SaveShippingDetailBody,
} from '@embroidery/api-client';

import { orderQueueKeys } from '../../order-queue';
import { orderDetailKeys } from '../model/order-detail-keys';
import {
  completeOrder,
  dispatchOrder,
  fetchShippingDetail,
  openFinalPayment,
  saveShippingDetail,
} from '../services/order-fulfillment.service';

export const SHIPPING_DETAIL_STALE_TIME_MS = 15_000;

export type ShippingDetailQueryResult = UseQueryResult<AdminShippingDetailResponse, Error>;

/**
 * The order's shipping detail, read only in the stages that can display one.
 *
 * `enabled` is the whole point: at `PRODUCTION_COMPLETED` the design draws the
 * shipping block as a locked placeholder, and issuing a request for a detail
 * that has no surface yet would spend an Admin round trip — and produce a 404
 * the screen would then have to explain away — for nothing.
 */
export function useShippingDetailQuery(
  orderId: string,
  enabled: boolean,
): ShippingDetailQueryResult {
  return useQuery({
    queryKey: orderDetailKeys.shipping(orderId),
    queryFn: ({ signal }) => fetchShippingDetail({ orderId, signal }),
    enabled,
    staleTime: SHIPPING_DETAIL_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

interface Invalidations {
  /** The order, and the queue whose status filter its move changes. */
  readonly refreshOrder: () => Promise<void>;
  /** The order-owned shipping detail alone. */
  readonly refreshShipping: () => Promise<void>;
  /** Both, for a command that moves the order and freezes the detail. */
  readonly refreshOrderAndShipping: () => Promise<void>;
}

function useFulfillmentInvalidations(orderId: string): Invalidations {
  const queryClient = useQueryClient();

  const refreshOrder = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: orderDetailKeys.detail(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderQueueKeys.lists() });
  }, [orderId, queryClient]);

  const refreshShipping = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: orderDetailKeys.shipping(orderId) });
  }, [orderId, queryClient]);

  const refreshOrderAndShipping = useCallback(async () => {
    await refreshShipping();
    await refreshOrder();
  }, [refreshOrder, refreshShipping]);

  return { refreshOrder, refreshShipping, refreshOrderAndShipping };
}

export type OpenFinalPaymentMutation = UseMutationResult<
  AdminOrderTransitionResultResponse,
  Error,
  void
>;

export function useOpenFinalPayment(orderId: string): OpenFinalPaymentMutation {
  const { refreshOrder } = useFulfillmentInvalidations(orderId);
  return useMutation({
    mutationFn: () => openFinalPayment(orderId),
    retry: false,
    onSuccess: async () => {
      await refreshOrder();
    },
  });
}

export type SaveShippingMutation = UseMutationResult<
  AdminShippingDetailSavedResponse,
  Error,
  SaveShippingDetailBody
>;

/**
 * Saving does not invalidate the order: `adminOrderShipping_save` never moves
 * the order's LC-14 state, and re-reading it would only re-render the same
 * header.
 */
export function useSaveShippingDetail(orderId: string): SaveShippingMutation {
  const { refreshShipping } = useFulfillmentInvalidations(orderId);
  return useMutation({
    mutationFn: (body: SaveShippingDetailBody) => saveShippingDetail({ orderId, body }),
    retry: false,
    onSuccess: async () => {
      await refreshShipping();
    },
  });
}

export type DispatchMutation = UseMutationResult<AdminOrderDispatchResponse, Error, void>;

export function useDispatchOrder(orderId: string): DispatchMutation {
  const { refreshOrderAndShipping } = useFulfillmentInvalidations(orderId);
  return useMutation({
    mutationFn: () => dispatchOrder(orderId),
    retry: false,
    onSuccess: async () => {
      await refreshOrderAndShipping();
    },
  });
}

export type CompleteMutation = UseMutationResult<AdminOrderCompletionResponse, Error, void>;

export function useCompleteOrder(orderId: string): CompleteMutation {
  const { refreshOrder } = useFulfillmentInvalidations(orderId);
  return useMutation({
    mutationFn: () => completeOrder(orderId),
    retry: false,
    onSuccess: async () => {
      await refreshOrder();
    },
  });
}

/**
 * Re-reads the order and its shipping detail after a failure whose outcome the
 * client cannot know.
 *
 * Reconciliation, never a resubmit. A `5xx` or a dropped connection is not proof
 * the write did not happen, and asking the server what is true is the only safe
 * answer available to a screen that cannot see inside the transaction.
 */
export function useFulfillmentReconcile(orderId: string): () => Promise<void> {
  const { refreshOrderAndShipping } = useFulfillmentInvalidations(orderId);
  return refreshOrderAndShipping;
}
