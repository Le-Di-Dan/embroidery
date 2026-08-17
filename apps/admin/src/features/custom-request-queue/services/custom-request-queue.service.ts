/**
 * Feature service seam over the generated `adminCustomRequest_list` operation.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `CustomRequestQueueApiError` carrying only the normalized
 * envelope, so no raw transport error reaches React state.
 *
 * This is the only APP5 Admin operation the queue may call. The request detail
 * and the moderation transitions are not on the curated boundary, so `APP5-A02`
 * work cannot be reached from this screen even by mistake.
 */
import { adminCustomRequestList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminCustomRequestQueueResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomRequestQueueApiError } from '../model/custom-request-queue-failure';
import {
  toQueueListParams,
  type CustomRequestQueueFilters,
} from '../model/custom-request-queue-filters';
import { CUSTOM_REQUEST_QUEUE_PAGE_SIZE } from '../model/custom-request-queue-keys';

/**
 * Axios serializes an array parameter as `status[]=NEW` by default. `APP5-B04`
 * publishes `status` as a **repeatable** parameter — `status=NEW&status=QUOTED` —
 * so the bracketed form is a different parameter name as far as the server is
 * concerned, and the filter would be silently dropped.
 *
 * `indexes: null` is Axios's "repeat the key" mode. It is set per call rather
 * than on the shared browser client: every other Admin screen sends scalar
 * parameters only, and changing the serializer for all of them to fix one
 * screen's array would be a platform-wide change made for a local reason.
 *
 * Found in the browser, not in jsdom: a component test observes the parameter
 * *object* handed to the generated operation, which is correct either way — only
 * a real request shows the query string that reaches the server.
 */
const REPEATED_PARAM_SERIALIZER = { indexes: null } as const;

export interface FetchQueuePageInput {
  readonly filters: CustomRequestQueueFilters;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. There is no offset and no page number: the
 * cursor is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchCustomRequestQueuePage({
  filters,
  cursor,
  signal,
}: FetchQueuePageInput): Promise<AdminCustomRequestQueueResponse> {
  try {
    const body = await adminCustomRequestList(
      {
        limit: CUSTOM_REQUEST_QUEUE_PAGE_SIZE,
        ...toQueueListParams(filters),
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
    throw new CustomRequestQueueApiError(normalizeApiClientError(error));
  }
}
