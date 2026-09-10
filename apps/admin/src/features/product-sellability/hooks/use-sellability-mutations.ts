'use client';

/**
 * The four sellability writes and their cache reconciliation.
 *
 * ### Nothing here is optimistic, and that is a rule rather than a preference
 *
 * Both invariants this screen authors are decided by the server inside a write
 * lock over rows the client cannot see: variant uniqueness is compared against
 * every variant of the product, deactivated ones included, and "at most one
 * order-eligible SKU per variant" is counted after the write. An optimistic
 * update would paint the new state, then have to take it back on the exact
 * refusals the section exists to explain — and in the ambiguity case it would
 * briefly show two SKUs selling under one variant, a state the system
 * guarantees is impossible.
 *
 * So every mutation settles against the server and the authoritative list is
 * re-read. That refetch is also what makes a lost response harmless: the client
 * never has to decide whether a write committed, because the next thing it does
 * is ask.
 *
 * ### Readiness is invalidated through a callback, not by reaching for its key
 *
 * The publication readiness report belongs to the product capability and is
 * keyed there. This feature does not import that key: it reports that the
 * commerce structure changed, and the screen that owns readiness invalidates
 * it. A feature that invalidated another feature's cache entry by name would
 * couple the two through a string, and the coupling would be invisible until
 * the key changed shape.
 *
 * Nothing else is touched. A variant write changes neither the product detail
 * record nor a list summary, and invalidating either would re-fetch a page to
 * discover it had not changed.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type {
  AdminProductVariantResponse,
  AdminSkuResponse,
  CreateProductVariantBody,
  CreateSkuBody,
  UpdateProductVariantBody,
  UpdateSkuBody,
} from '@embroidery/api-client';

import { sellabilityKeys } from '../model/sellability-keys';
import { createProductVariant, updateProductVariant } from '../services/product-variant.service';
import { createVariantSku, updateVariantSku } from '../services/variant-sku.service';

/** What every mutation in this module needs to reconcile afterwards. */
interface SellabilityMutationContext {
  readonly productId: string;
  /**
   * Called after the authoritative list has been invalidated, so the owner can
   * refresh the publication readiness report and the structural warning.
   */
  readonly onStructureChanged: () => void;
}

export interface CreateVariantInput {
  readonly body: CreateProductVariantBody;
}

export interface UpdateVariantInput {
  readonly variantId: string;
  readonly body: UpdateProductVariantBody;
}

export interface CreateSkuInput {
  readonly variantId: string;
  readonly body: CreateSkuBody;
}

export interface UpdateSkuInput {
  readonly skuId: string;
  readonly body: UpdateSkuBody;
}

/**
 * The one reconciliation every write shares.
 *
 * `invalidateQueries` is awaited so the mutation is not reported as settled
 * until the authoritative list has been re-read. A dialog that closed on the
 * unawaited promise would hand the operator back a section still showing the
 * state before their change, and the next thing they did would be decided from
 * it.
 */
function useSettleAgainstServer({ productId, onStructureChanged }: SellabilityMutationContext) {
  const queryClient = useQueryClient();
  return async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: sellabilityKeys.variants(productId) });
    onStructureChanged();
  };
}

export type CreateVariantMutation = UseMutationResult<
  AdminProductVariantResponse,
  Error,
  CreateVariantInput
>;

export function useCreateVariantMutation(
  context: SellabilityMutationContext,
): CreateVariantMutation {
  const settle = useSettleAgainstServer(context);
  return useMutation({
    mutationFn: ({ body }: CreateVariantInput) => createProductVariant(context.productId, body),
    onSuccess: settle,
  });
}

export type UpdateVariantMutation = UseMutationResult<
  AdminProductVariantResponse,
  Error,
  UpdateVariantInput
>;

/**
 * Label edits, deactivation and reactivation all travel through this one
 * mutation, because they are one operation on the contract. There is no
 * delete to give a mutation of its own.
 */
export function useUpdateVariantMutation(
  context: SellabilityMutationContext,
): UpdateVariantMutation {
  const settle = useSettleAgainstServer(context);
  return useMutation({
    mutationFn: ({ variantId, body }: UpdateVariantInput) =>
      updateProductVariant(context.productId, variantId, body),
    onSuccess: settle,
  });
}

export type CreateSkuMutation = UseMutationResult<AdminSkuResponse, Error, CreateSkuInput>;

export function useCreateSkuMutation(context: SellabilityMutationContext): CreateSkuMutation {
  const settle = useSettleAgainstServer(context);
  return useMutation({
    mutationFn: ({ variantId, body }: CreateSkuInput) =>
      createVariantSku(context.productId, variantId, body),
    onSuccess: settle,
  });
}

export type UpdateSkuMutation = UseMutationResult<AdminSkuResponse, Error, UpdateSkuInput>;

export function useUpdateSkuMutation(context: SellabilityMutationContext): UpdateSkuMutation {
  const settle = useSettleAgainstServer(context);
  return useMutation({
    mutationFn: ({ skuId, body }: UpdateSkuInput) => updateVariantSku(skuId, body),
    onSuccess: settle,
  });
}
