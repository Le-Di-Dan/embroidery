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

export function usePlacementMutation(): PlacementMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, body }: PlacementReplaceInput) => replacePlacement(productId, body),
    onSuccess: (result) => {
      queryClient.setQueryData<PlacementModel>(placementQueryKeys.detail(result.productId), result);
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
