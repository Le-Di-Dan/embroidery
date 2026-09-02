import { cache } from 'react';

import { publicProductVariantList } from '@embroidery/api-client';
import { isPublicProductSlug } from '@embroidery/contracts';

import { getServerApiClient } from '../../../config/server-api-client';
import {
  toReadyMadePurchaseView,
  type ReadyMadePurchaseResult,
} from '../model/purchase-projection';

/**
 * The single server-side read of one Product's Ready-Made purchase state.
 *
 * Anonymous by construction, exactly like `loadProductDetail` beside it: no
 * cookie is forwarded and no header is read. Availability is the same for every
 * visitor because nothing is held or reserved by looking.
 *
 * ### One request, one read
 *
 * `APP12-S01` §26 asks for one `publicProductVariant_list` fetch per render, and
 * this is where that is made structural rather than watched for. The read
 * happens **on the server**, once, and the resolved projection is handed to the
 * client island as props — so the panel makes no browser request at all and
 * there is no per-SKU call to multiply. React's `cache()` memoizes it for the
 * duration of one browser request, so a second consumer in the same render tree
 * cannot turn into a second backend call, while a new request still asks again.
 *
 * That last half is the freshness requirement, not an optimisation: the route
 * segment is `force-dynamic`, availability is inventory-sensitive, and a
 * process-global memo would keep showing stock that has since been reserved
 * (`APP12-S01` §27).
 *
 * ### A failure is not zero stock
 *
 * Every refusal — a malformed slug, the API's safe 404, a transport error, a
 * 500 — resolves to `unavailable`, and the panel says it could not read the
 * purchase state. It never falls back to the Product's base price, to
 * `isDisplayOutOfStock` or to a historical constant, and it never reports zero
 * availability, because "the inventory service is down" and "there are none
 * left" are different sentences and only one of them is ever true here
 * (`APP12-S01` §24).
 *
 * The 404 in particular is left as `unavailable` rather than promoted to a
 * page-level not-found: `loadProductDetail` has already decided the Product is
 * publicly visible, so a 404 here means the two reads raced an unpublication.
 * The honest answer is that this Product cannot be bought right now, not that
 * the artwork the visitor is already reading does not exist.
 */
async function readReadyMadePurchase(slug: string): Promise<ReadyMadePurchaseResult> {
  if (!isPublicProductSlug(slug)) return { kind: 'unavailable' };

  try {
    const body = await publicProductVariantList(slug, { instance: getServerApiClient() });
    return { kind: 'ready', view: toReadyMadePurchaseView(body.data) };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Request-scoped memoization, for the reason recorded above. */
export const loadReadyMadePurchase = cache(readReadyMadePurchase);
