/**
 * The form model: authoritative values in, exact request bodies out.
 *
 * Two contract rules shape everything here.
 *
 * *Only changed fields are sent.* The PATCH body is diffed against the
 * authoritative record the form was seeded from, not against "whatever the
 * inputs hold". A field the operator never touched is absent from the request,
 * so a concurrent change to it is preserved rather than overwritten with a
 * stale echo.
 *
 * *Description distinguishes untouched from cleared.* `absent` leaves the
 * persisted value alone; `null` clears it to NULL. A form that always sent its
 * description would wipe a description the operator never looked at, so the
 * diff — not the input's emptiness — decides which of the two happens.
 */
import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { isCategorySlugShape } from './category-slug-shape';
import { hasSelectionChanged, selectionFromDetailMedia } from './product-media-selection';
import { inputToPriceAmount, priceAmountToInput } from './product-price';

/** What the inputs hold. Every field is the raw string/selection the UI edits. */
export interface ProductFormValues {
  readonly name: string;
  /**
   * The chosen category slug, or the empty string for "not chosen yet".
   *
   * A `string`, because the set of categories is data (`APP12-C01-C1`). The
   * `<select>` can only offer what the inventory returned, so a value here is a
   * category the server will accept — and if the inventory later drops one, the
   * server refuses it as `PRODUCT_CATEGORY_INVALID` rather than this app
   * pretending to know better.
   */
  readonly categorySlug: string;
  readonly description: string;
  /** Raw price input; empty means the unset sentinel. */
  readonly price: string;
  readonly mediaAssetIds: readonly string[];
}

/** The exact `adminProduct_create` body: three fields, nothing else. */
export interface ProductCreateRequestBody {
  readonly categorySlug: string;
  readonly name: string;
  readonly description?: string;
}

/** The exact `adminProduct_update` body; every optional field is a real change. */
export interface ProductUpdateRequestBody {
  readonly expectedUpdatedAt: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly basePriceAmount?: string;
  readonly categorySlug?: string;
  readonly mediaAssetIds?: readonly string[];
}

export const EMPTY_CREATE_VALUES: ProductFormValues = {
  name: '',
  categorySlug: '',
  description: '',
  price: '',
  mediaAssetIds: [],
};

/**
 * Seeds the form from the authoritative record.
 *
 * The product's own category is kept, whatever it is. It used to be checked
 * against a four-value list and blanked when it did not match — so opening a
 * real product filed under a real category silently cleared its category field,
 * and saving would have moved it. The slug is only rejected when it could not be
 * a slug at all, which is a data defect rather than a category this build has
 * not heard of (`APP12-C01-C1`).
 */
export function formValuesFromDetail(product: AdminProductDetailResponse): ProductFormValues {
  return {
    name: product.name,
    categorySlug: isCategorySlugShape(product.category.slug) ? product.category.slug : '',
    description: product.description ?? '',
    price: priceAmountToInput(product.basePriceAmount),
    mediaAssetIds: selectionFromDetailMedia(product.media),
  };
}

export interface ProductValidationErrors {
  readonly name?: string;
  readonly categorySlug?: string;
  readonly price?: string;
}

/**
 * Client-side validation mirrors the approved validation frame (`436:37`) so
 * the operator is not made to round-trip for an empty name. The server remains
 * the validation authority: passing here only means the request is worth
 * sending.
 */
export function validateProductForm(
  values: ProductFormValues,
  messages: { name: string; category: string; price: string },
  options: { readonly requirePrice: boolean },
): ProductValidationErrors {
  const errors: { name?: string; categorySlug?: string; price?: string } = {};
  if (values.name.trim() === '') {
    errors.name = messages.name;
  }
  if (values.categorySlug === '') {
    errors.categorySlug = messages.category;
  }
  if (options.requirePrice && inputToPriceAmount(values.price) === null) {
    errors.price = messages.price;
  }
  return errors;
}

export function hasValidationErrors(errors: ProductValidationErrors): boolean {
  return (
    errors.name !== undefined || errors.categorySlug !== undefined || errors.price !== undefined
  );
}

/**
 * The create body. Only the three fields POST accepts appear — no price, media,
 * slug or status — and an empty description is omitted rather than sent blank,
 * because create has no "clear" semantics to express.
 */
export function buildCreateBody(values: ProductFormValues): ProductCreateRequestBody | null {
  if (values.categorySlug === '') {
    return null;
  }
  const description = values.description.trim();
  return {
    categorySlug: values.categorySlug,
    name: values.name.trim(),
    ...(description === '' ? {} : { description }),
  };
}

/**
 * The PATCH body: the concurrency token plus exactly the fields that changed.
 * Returns `null` when nothing changed, which the caller treats as "no request
 * to make" rather than sending a body the server would reject for being empty.
 */
export function buildUpdateBody(
  initial: ProductFormValues,
  current: ProductFormValues,
  expectedUpdatedAt: string,
): ProductUpdateRequestBody | null {
  const body: {
    expectedUpdatedAt: string;
    name?: string;
    description?: string | null;
    basePriceAmount?: string;
    categorySlug?: string;
    mediaAssetIds?: readonly string[];
  } = { expectedUpdatedAt };
  let changed = false;

  const name = current.name.trim();
  if (name !== initial.name.trim()) {
    body.name = name;
    changed = true;
  }

  const description = current.description.trim();
  if (description !== initial.description.trim()) {
    // Blank after a real edit is an explicit clear; `null` is the contract's
    // way to say NULL, which an omitted field could never express.
    body.description = description === '' ? null : description;
    changed = true;
  }

  const price = inputToPriceAmount(current.price);
  const initialPrice = inputToPriceAmount(initial.price);
  if (price !== null && price !== initialPrice) {
    body.basePriceAmount = price;
    changed = true;
  }

  if (current.categorySlug !== '' && current.categorySlug !== initial.categorySlug) {
    body.categorySlug = current.categorySlug;
    changed = true;
  }

  if (hasSelectionChanged(initial.mediaAssetIds, current.mediaAssetIds)) {
    body.mediaAssetIds = current.mediaAssetIds;
    changed = true;
  }

  return changed ? body : null;
}

/**
 * Dirty state is "a save would send something", computed from the same diff the
 * request uses. Deriving both from one function is what keeps the unsaved-change
 * prompt honest: the screen can never warn about changes it would not send, or
 * stay silent about changes it would.
 */
export function isFormDirty(initial: ProductFormValues, current: ProductFormValues): boolean {
  return buildUpdateBody(initial, current, 'probe') !== null;
}

/** Create mode is dirty as soon as the operator has typed or chosen anything. */
export function isCreateFormDirty(values: ProductFormValues): boolean {
  return (
    values.name.trim() !== '' || values.categorySlug !== '' || values.description.trim() !== ''
  );
}
