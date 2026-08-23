/**
 * Feature service seam over the generated `adminOrder_list` operation.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as an `OrderQueueApiError` carrying only the normalized envelope, so no
 * raw transport error reaches React state.
 *
 * This is the only APP7 operation the queue may call. The order detail, the
 * payment read and both payment decisions are reached through the order-detail
 * capability or not at all — nothing on this screen can move money state.
 */
import { adminOrderList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminOrderQueueResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { OrderQueueApiError } from '../model/order-queue-failure';
import { toOrderListParams, type OrderQueueFilters } from '../model/order-queue-filters';
import { ORDER_QUEUE_PAGE_SIZE } from '../model/order-queue-keys';

/**
 * Axios serializes an array parameter with bracketed indexes by default.
 * `APP7-B02` publishes `status` as a **repeatable** parameter —
 * `status=AWAITING_DEPOSIT&status=DEPOSIT_PAID` — so the bracketed form is a
 * different parameter name as far as the server is concerned and the filter
 * would be silently dropped.
 *
 * `indexes: null` is Axios's "repeat the key" mode. It is set per call rather
 * than on the shared browser client, exactly as `APP5-A01` set it for the same
 * reason: every other Admin screen sends scalar parameters only, and changing
 * the serializer for all of them to fix one screen's array would be a
 * platform-wide change made for a local reason.
 *
 * Found in the browser, not in jsdom: a component test observes the parameter
 * *object* handed to the generated operation, which is correct either way — only
 * a real request shows the query string that reaches the server.
 */
const REPEATED_PARAM_SERIALIZER = { indexes: null } as const;

export interface FetchOrderQueuePageInput {
  readonly filters: OrderQueueFilters;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. There is no offset and no page number: the
 * cursor is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchOrderQueuePage({
  filters,
  cursor,
  signal,
}: FetchOrderQueuePageInput): Promise<AdminOrderQueueResponse> {
  try {
    const body = await adminOrderList(
      {
        limit: ORDER_QUEUE_PAGE_SIZE,
        ...toOrderListParams(filters),
        ...(cursor === undefined ? {} : { cursor }),
      },
      {
        instance: getBrowserApiClient(),
        config: {
          paramsSerializer: REPEATED_PARAM_SERIALIZER,
          ...(signal === undefined ? {} : { signal }),
        },
      },
    );
    return body.data;
  } catch (error: unknown) {
    throw new OrderQueueApiError(normalizeApiClientError(error));
  }
}
