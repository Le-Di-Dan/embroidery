'use client';

/**
 * The `APP5-B07` variant list, and the four outcomes `APP5-S01` §17 refuses to
 * let collapse into one error.
 *
 * `APP5-B07` resolves the product before it reads variants precisely so a
 * consumer can tell these apart: an unknown, draft, archived or uncategorised
 * product is a 404, while a published product with nothing selectable is a
 * **200 with an empty array**. Both are truthful answers about different facts,
 * they have different recovery actions, and neither one is a stale design
 * session. Modelling them as separate values of one union is what stops a
 * later edit from folding them together.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { normalizeApiClientError, type PublicProductVariantResponse } from '@embroidery/api-client';

import { listCatalogVariants } from '../api/custom-request.client';
import { customRequestQueryKeys } from '../model/custom-request-query-keys';
import { selectionStillEligible } from '../model/variant-option';

const NOT_FOUND = 404;

export type CatalogVariantsStatus =
  | 'LOADING'
  /** Selectable variants came back. */
  | 'READY'
  /** The product is published and has no selectable variant (§17.A). */
  | 'EMPTY'
  /** The product is not publicly available (§17.B). */
  | 'PRODUCT_UNAVAILABLE'
  /** Transient: the read itself failed and may be retried. */
  | 'FAILED';

export interface CatalogVariants {
  readonly status: CatalogVariantsStatus;
  readonly productId: string | undefined;
  readonly variants: readonly PublicProductVariantResponse[];
  readonly refetch: () => void;
}

export interface UseCatalogVariantsInput {
  /** `undefined` disables the read entirely — the COP branch never fetches. */
  readonly productSlug: string | undefined;
  readonly selectedVariantId: string | undefined;
  /**
   * Called when a refetch shows the selected variant is no longer selectable.
   *
   * A callback rather than a return value because the selection lives in the
   * flow reducer: this hook observes the server's answer, the reducer decides
   * what happens to the customer's other input (`APP5-S01` §6.3 — it survives).
   */
  readonly onSelectionWithdrawn: () => void;
}

export function useCatalogVariants(input: UseCatalogVariantsInput): CatalogVariants {
  const { productSlug, selectedVariantId, onSelectionWithdrawn } = input;

  const query = useQuery({
    queryKey: customRequestQueryKeys.catalogVariants(productSlug ?? ''),
    queryFn: () => listCatalogVariants(productSlug as string),
    enabled: productSlug !== undefined,
    // Publication is re-read on every request server-side and nothing in this
    // system invalidates a cache, so a stored answer could offer a variant the
    // operator has delisted. The list is read fresh and never persisted.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const variants = query.data?.variants ?? [];
  const loaded = query.isSuccess;

  // A selection is only ever withdrawn against a list that actually arrived: a
  // failed refetch says nothing about whether the variant is still selectable,
  // and clearing on it would lose the customer's choice for a network blip.
  useEffect(() => {
    if (!loaded) return;
    if (selectedVariantId === undefined) return;
    if (selectionStillEligible(variants, selectedVariantId)) return;
    onSelectionWithdrawn();
  }, [loaded, variants, selectedVariantId, onSelectionWithdrawn]);

  return {
    status: statusOf(),
    productId: query.data?.productId,
    variants,
    refetch: () => {
      void query.refetch();
    },
  };

  function statusOf(): CatalogVariantsStatus {
    if (productSlug === undefined || query.isPending) return 'LOADING';
    if (query.isError) {
      const normalized = normalizeApiClientError(query.error);
      return normalized.httpStatus === NOT_FOUND ? 'PRODUCT_UNAVAILABLE' : 'FAILED';
    }
    // The distinction §17.A exists for: the product is real, the list is empty.
    return variants.length === 0 ? 'EMPTY' : 'READY';
  }
}
