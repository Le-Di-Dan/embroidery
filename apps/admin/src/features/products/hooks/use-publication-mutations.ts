'use client';

/**
 * The two publication commands and their cache reconciliation.
 *
 * Neither is optimistic, and that is a stronger rule here than for a draft
 * save. The server re-evaluates every requirement inside its own transaction,
 * so a publish the screen believed was certain can still be refused — writing
 * `PUBLISHED` into the cache first would show the operator a lifecycle state
 * the product never entered, which is the one thing a publication screen must
 * never do.
 *
 * On success the authoritative `status` and `updatedAt` are *merged* into the
 * detail record rather than replacing it. The command response is deliberately
 * narrow — id, slug, status, token — so overwriting the cache entry with it
 * would erase the name, category, description, price and media the screen is
 * still rendering. Merging keeps the record whole and advances exactly the two
 * fields the command actually changed.
 *
 * Readiness is invalidated rather than merged: publishing changes what the next
 * report will say, and no part of that report can be derived from the command
 * response. The list root is invalidated for the same reason a draft save
 * invalidates it — a summary is not a detail, and re-deriving one from the
 * other would be a guess.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type {
  AdminProductDetailResponse,
  AdminProductPublicationResponse,
} from '@embroidery/api-client';

import { productQueryKeys } from '../model/product-query-keys';
import type { PublicationCommandBody } from '../model/product-publication';
import { publishProduct, unpublishProduct } from '../services/product-publication.service';

export interface PublicationCommandInput {
  readonly productId: string;
  readonly body: PublicationCommandBody;
}

export type PublicationMutation = UseMutationResult<
  AdminProductPublicationResponse,
  Error,
  PublicationCommandInput
>;

type CommandFn = (
  productId: string,
  body: PublicationCommandBody,
) => Promise<AdminProductPublicationResponse>;

function usePublicationCommand(command: CommandFn): PublicationMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, body }: PublicationCommandInput) => command(productId, body),
    onSuccess: (result) => {
      const key = productQueryKeys.detail(result.productId);
      queryClient.setQueryData<AdminProductDetailResponse>(key, (current) =>
        current === undefined
          ? current
          : // Only the fields the command owns. `slug` is included because the
            // server declares it authoritative on this response; everything
            // else on the record is left exactly as it was.
            { ...current, slug: result.slug, status: result.status, updatedAt: result.updatedAt },
      );
      void queryClient.invalidateQueries({ queryKey: productQueryKeys.lists() });
      // Reset rather than invalidate. Invalidation marks the report stale but
      // keeps serving it while the refetch is in flight — and that cached
      // report describes the *previous* lifecycle state, which the line above
      // has just advanced. For those few hundred milliseconds the two
      // snapshots genuinely contradict each other, and the screen would tell an
      // operator whose publish had just succeeded that the product changed
      // underneath them. Resetting drops the stale answer so the screen shows
      // "loading" until the real one arrives.
      void queryClient.resetQueries({
        queryKey: productQueryKeys.publicationReadiness(result.productId),
      });
    },
    // A retry would re-send the same `expectedUpdatedAt`. After a conflict that
    // token is known-stale, so an automatic retry could only fail again — or,
    // worse, succeed against a window the operator never saw.
    retry: false,
  });
}

export function useProductPublishMutation(): PublicationMutation {
  return usePublicationCommand(publishProduct);
}

export function useProductUnpublishMutation(): PublicationMutation {
  return usePublicationCommand(unpublishProduct);
}
