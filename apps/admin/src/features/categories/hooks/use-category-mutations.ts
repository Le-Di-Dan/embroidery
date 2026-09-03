'use client';

/**
 * The three category writes and their cache reconciliation (`APP12-A01`).
 *
 * ## None of them is optimistic
 *
 * Every one can be refused for a reason the client cannot predict — a stale
 * `expectedUpdatedAt`, a slug another operator just took, an archive still
 * holding published products. Writing the new state into the cache before the
 * response arrived would show a state that never existed, and the publish case
 * is the worst of them: a category that appears `PUBLISHED` for a moment is a
 * category the operator believes has a live public URL.
 *
 * ## Why a success invalidates rather than patches
 *
 * The mutation responses are `AdminCategoryResponse`, which deliberately
 * carries **no** `publishedProductCount` — that number is counted from the
 * products on every list read. Patching a returned record into the cached list
 * row would therefore either drop the count or invent one. So the whole
 * inventory is invalidated and re-read, which is also what makes the count
 * shown after an archive refusal the current one.
 *
 * ## Both category caches, always
 *
 * The Product screens read the same taxonomy under their own key
 * (`productQueryKeys.categories()`). A category published here must appear in
 * the Product form without a reload — that is the no-code property this whole
 * checkpoint exists to deliver — so every write invalidates both entries. One
 * key would leave the other screen showing a taxonomy that no longer exists.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type {
  CreateCategoryBody,
  TransitionCategoryBody,
  UpdateCategoryBody,
} from '@embroidery/api-client';

import { productQueryKeys } from '../../products';
import { categoryQueryKeys } from '../model/category-query-keys';
import {
  createCategory,
  updateCategory,
  transitionCategory,
  type AdminCategoryRecord,
} from '../services/admin-category.service';

/**
 * Marks every cached view of the taxonomy stale.
 *
 * Invalidation rather than removal: the screens keep rendering what they have
 * while the refetch is in flight, so a save does not blank the table.
 */
function useTaxonomyInvalidation(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: categoryQueryKeys.inventory() });
    void queryClient.invalidateQueries({ queryKey: productQueryKeys.categories() });
  };
}

export type CategoryCreateMutation = UseMutationResult<
  AdminCategoryRecord,
  Error,
  CreateCategoryBody
>;

export function useCategoryCreateMutation(): CategoryCreateMutation {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: (body: CreateCategoryBody) => createCategory(body),
    onSuccess: invalidate,
    retry: false,
  });
}

export interface CategoryUpdateInput {
  readonly categoryId: string;
  readonly body: UpdateCategoryBody;
}

export type CategoryUpdateMutation = UseMutationResult<
  AdminCategoryRecord,
  Error,
  CategoryUpdateInput
>;

export function useCategoryUpdateMutation(): CategoryUpdateMutation {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: ({ categoryId, body }: CategoryUpdateInput) => updateCategory(categoryId, body),
    onSuccess: invalidate,
    // A retry would re-send the same `expectedUpdatedAt`. After a conflict that
    // token is known-stale, so an automatic retry could only fail again — or,
    // worse, succeed against a window the operator never saw.
    retry: false,
  });
}

export interface CategoryTransitionInput {
  readonly categoryId: string;
  readonly body: TransitionCategoryBody;
}

export type CategoryTransitionMutation = UseMutationResult<
  AdminCategoryRecord,
  Error,
  CategoryTransitionInput
>;

export function useCategoryTransitionMutation(): CategoryTransitionMutation {
  const invalidate = useTaxonomyInvalidation();
  return useMutation({
    mutationFn: ({ categoryId, body }: CategoryTransitionInput) =>
      transitionCategory(categoryId, body),
    // Also invalidated after a *failed* archive: the refusal is the moment the
    // operator most needs the true published-product count, and the count they
    // were shown before the attempt is the one that just proved insufficient.
    onSuccess: invalidate,
    onError: invalidate,
    retry: false,
  });
}
