/**
 * Feature service seam over the generated `adminProductionJob_list` operation.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `ProductionQueueApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * This is the **only** production operation the queue may call, and the only one
 * exported from this module. Job creation, the job detail and the three LC-18
 * transitions are not reached from this screen at all: `APP8-B04` decides a
 * transition under a row lock beside facts a list cannot show, and the public
 * api-client boundary does not even publish those operations to this app.
 */
import { adminProductionJobList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductionJobQueueResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductionQueueApiError } from '../model/production-queue-failure';
import {
  toProductionListParams,
  type ProductionQueueFilters,
} from '../model/production-queue-filters';
import { PRODUCTION_QUEUE_PAGE_SIZE } from '../model/production-queue-keys';

/**
 * Axios serializes an array parameter with bracketed indexes by default.
 * `APP8-B03` publishes `status` as a **repeatable** parameter —
 * `status=PLANNED&status=STARTED` — so the bracketed form is a different
 * parameter name as far as the server is concerned. Worse than being dropped:
 * the query schema is `.strict()`, so `status[0]` is an *unknown* parameter and
 * the whole request is refused with a `400`.
 *
 * `indexes: null` is Axios's "repeat the key" mode. It is set per call rather
 * than on the shared browser client, exactly as `APP5-A01` and `APP7-A01` set
 * it for the same reason: every other Admin screen sends scalar parameters
 * only, and changing the serializer for all of them to fix one screen's array
 * would be a platform-wide change made for a local reason.
 */
const REPEATED_PARAM_SERIALIZER = { indexes: null } as const;

export interface FetchProductionQueuePageInput {
  readonly filters: ProductionQueueFilters;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. There is no offset and no page number: the
 * cursor is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchProductionQueuePage({
  filters,
  cursor,
  signal,
}: FetchProductionQueuePageInput): Promise<AdminProductionJobQueueResponse> {
  try {
    const body = await adminProductionJobList(
      {
        limit: PRODUCTION_QUEUE_PAGE_SIZE,
        ...toProductionListParams(filters),
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
    throw new ProductionQueueApiError(normalizeApiClientError(error));
  }
}
