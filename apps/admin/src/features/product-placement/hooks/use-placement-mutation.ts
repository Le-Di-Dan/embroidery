'use client';

/**
 * The replace command and its cache reconciliation.
 *
 * Not optimistic. `APP3-B01` re-validates geometry, scale, code uniqueness,
 * background eligibility and every referenced-row rule inside its transaction,
 * so a save the screen believed was certain can still be refused — writing the
 * draft into the cache first would show the operator a placement model the
 * product never had.
 *
 * On success the cache is **replaced** with the server's answer rather than
 * merged. The replace response is the whole model, including the rows the
 * server just retired and the fresh `updatedAt`; merging a whole-model answer
 * into a whole-model cache entry could only reintroduce rows the save removed.
 *
 * No second read follows. The response already is canonical truth, and a
 * follow-up GET would race the very token the next save depends on.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { ReplaceProductPlacementBody } from '@embroidery/api-client';

import { placementQueryKeys } from '../model/placement-query-keys';
import type { PlacementModel } from '../model/placement-model';
import { replacePlacement } from '../services/product-placement.service';

export interface PlacementReplaceInput {
  readonly productId: string;
  readonly body: ReplaceProductPlacementBody;
}

export type PlacementMutation = UseMutationResult<PlacementModel, Error, PlacementReplaceInput>;

/**
 * The Sides whose background bytes the server would now answer differently.
 *
 * A Side counts when its `backgroundAssetId` changed, and also when it is new —
 * a Side that did not exist before has no cached image, but invalidating a key
 * nothing is observing is free, and leaving it out would mean relying on the
 * order in which the screen happens to select things.
 *
 * With no previous snapshot nothing is returned: without a baseline there is no
 * evidence any association moved, and invalidating everything on a guess is the
 * refetch-storm this function exists to avoid.
 */
function changedBackgroundSideIds(
  previous: PlacementModel | undefined,
  next: PlacementModel,
): readonly string[] {
  if (previous === undefined) return [];
  const before = new Map(previous.sides.map((side) => [side.id, side.backgroundAssetId]));
  return next.sides
    .filter((side) => before.get(side.id) !== side.backgroundAssetId)
    .map((side) => side.id);
}

export function usePlacementMutation(): PlacementMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, body }: PlacementReplaceInput) => replacePlacement(productId, body),
    onSuccess: (result) => {
      const key = placementQueryKeys.detail(result.productId);
      // Read before overwriting: the previous snapshot is the only thing that
      // says which Side associations actually moved.
      const previous = queryClient.getQueryData<PlacementModel>(key);
      queryClient.setQueryData<PlacementModel>(key, result);

      // `APP3-A01-C1`: a Side whose background association changed is now served
      // different bytes, so its cached image is wrong. Invalidated per Side
      // rather than by prefix — re-fetching every Side's background would pull
      // megabytes for images the operator did not touch and is not looking at.
      for (const sideId of changedBackgroundSideIds(previous, result)) {
        void queryClient.invalidateQueries({
          queryKey: placementQueryKeys.sideBackground(result.productId, sideId),
        });
      }
    },
    /**
     * A failed replace writes nothing on the server, so the cached snapshot is
     * still accurate and must not be invalidated — refetching here would
     * discard a perfectly good baseline and, on a conflict, would race the
     * reload the operator is about to choose.
     */
    retry: false,
  });
}
