/**
 * The one `APP8-B03` **read** this screen performs: `adminProductionJob_get`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `ProductionJobApiError` carrying only the normalized envelope, so
 * no raw transport error reaches React state.
 *
 * ## One read is the whole screen
 *
 * The response already carries the job root, the frozen specification, the
 * append-only history and the reservation summary, so there is nothing here to
 * enrich. No Catalog, Product, quotation, Design Session, payment, customer,
 * artifact or storage call exists in this feature: the specification is a frozen
 * copy and reading a live catalog to "improve" it would replace what is being
 * produced with what is currently sold. There is no per-row second request
 * either — the N+1 `788:179` refuses by name.
 */
import { adminProductionJobGet, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductionJobDetailResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductionJobApiError } from '../model/production-job-failure';

export interface FetchProductionJobInput {
  readonly jobId: string;
  readonly signal?: AbortSignal | undefined;
}

export async function fetchProductionJob({
  jobId,
  signal,
}: FetchProductionJobInput): Promise<AdminProductionJobDetailResponse> {
  try {
    const body = await adminProductionJobGet(jobId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new ProductionJobApiError(normalizeApiClientError(error));
  }
}
