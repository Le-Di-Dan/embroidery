/**
 * Request-side validation for the bounded Product media-curation write
 * (`APP12-M01.B2`).
 *
 * `.strict()`, like every other Admin product body: an unknown field is a
 * client bug worth reporting, and silently dropping one is how a caller
 * believes it set something it did not. In particular there is no `isPrimary`,
 * no `role`, no `displayOrder` and no `position` — the array *is* those facts,
 * and accepting a second way to state them would let a request describe a
 * selection with two primaries or a gap.
 *
 * `mediaAssetIds` is required rather than optional. This operation has exactly
 * one intent, so an absent array would have to mean either "clear the
 * selection" or "change nothing", and neither reading is safe to guess. `[]` is
 * the explicit clear, and the domain refuses it on a published Product.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { MAX_PRODUCT_MEDIA_ITEMS } from '../../domain/product-draft.policy';

/**
 * The complete intended selection, in display order.
 *
 * `maxItems` publishes the same `MAX_PRODUCT_MEDIA_ITEMS` the domain enforces
 * and migration 0039 installs as the `display_order` bound — read from the one
 * constant, so a client reading the schema and a service refusing the request
 * cannot disagree about the number. The domain check behind it is not
 * redundant: it is the one that holds for every caller, including a write that
 * never passes through this DTO. Duplicates are refused in the domain as
 * `PRODUCT_MEDIA_DUPLICATE` rather than de-duplicated here, because silently
 * collapsing a repeat would answer 200 to a request the operator got wrong.
 */
export const replaceProductMediaBodySchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    mediaAssetIds: z.array(z.string().uuid()).max(MAX_PRODUCT_MEDIA_ITEMS),
  })
  .strict();

export class ReplaceProductMediaBody extends createZodDto(replaceProductMediaBodySchema) {}

registerZodDtos(ReplaceProductMediaBody);
