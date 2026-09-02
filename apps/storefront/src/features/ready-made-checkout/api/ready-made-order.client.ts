import {
  publicReadyMadeOrderCreate,
  type CreateReadyMadeOrderBody,
  type ReadyMadeOrderCreatedResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * The one network call `/mua-hang/[slug]` makes from the browser
 * (`APP12-S02` §40).
 *
 * Through the **generated operation only**: no path string appears in this
 * feature, no `fetch`, no second Axios instance and no hand-written DTO. A route
 * rename therefore arrives as a regenerated client rather than as a 404 nobody
 * notices — the `APP4-S01` and `APP5-S01` precedent, for the same reason.
 *
 * ## There is no `Idempotency-Key` header here, and that is the contract
 *
 * `APP5-B02`'s upload takes one because Orval emits no parameter for it.
 * `publicReadyMadeOrder_create` takes **none**: `APP12-B02` makes the verified
 * `SUBMISSION` challenge itself the idempotency scope, and fingerprints
 * `(skuId, quantity, delivery)` inside it. Re-sending the same body on the same
 * challenge replays the first order; sending a different one is refused as
 * `IDEMPOTENCY_CONFLICT`. Minting a header key here would be a second, weaker
 * idempotency authority the server does not read, and adding the parameter to
 * the contract is a widening this checkpoint may not perform
 * (`APP12-S02` §41).
 *
 * So the key is the challenge id — server-issued, single-purpose, unguessable,
 * and none of the four things §20 forbids: not a customer id, not the SKU id,
 * not a timestamp and not the route slug.
 *
 * ## The delivery facts leave in the body and nowhere else
 *
 * They are passed straight into the operation. Nothing in this module writes
 * them to a query string, a header, `localStorage`, a log line or an error
 * message (`APP12-S02` §19), and the response is returned unwrapped so no caller
 * has to reach into the envelope.
 */
export async function createReadyMadeOrder(
  body: CreateReadyMadeOrderBody,
): Promise<ReadyMadeOrderCreatedResponse> {
  const response = await publicReadyMadeOrderCreate(body, { instance: getBrowserApiClient() });
  return response.data;
}
