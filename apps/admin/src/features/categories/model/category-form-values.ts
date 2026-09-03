/**
 * The category form's values, their validation, and the exact bodies the two
 * write operations accept (`APP12-A01`).
 *
 * ## Syntax lives here; values never do
 *
 * This module states what a slug may *look* like and how long a name may be.
 * It holds no slug, no label and no taxonomy, and it must never grow one —
 * `CATEGORY_MODEL = DYNAMIC` means the set of categories is database data
 * (`APP12-P01` §0.0). Nothing is derived either: the slug is not transliterated
 * from the name, and `displayOrder` is not auto-assigned, because
 * `adminCategory_create` infers neither and a client-side guess would be a
 * second authority over an operator decision.
 *
 * ## Why the form is strings and the wire is not
 *
 * `displayOrder` is typed by a human, one character at a time, and passes
 * through states (`""`, `"1e3"`, `"-0"`) that are not numbers. Keeping the
 * draft as text means the control shows exactly what was typed, and the
 * conversion happens once, at the boundary, where an invalid value is a
 * validation error rather than a silent `NaN` on the wire.
 */
import type { CreateCategoryBody, UpdateCategoryBody } from '@embroidery/api-client';

import { CATEGORY_SLUG_PATTERN, CATEGORY_SLUG_MAX_LENGTH } from './category-slug-shape';

export const CATEGORY_NAME_MAX_LENGTH = 120;
export const CATEGORY_DISPLAY_ORDER_MIN = 0;
export const CATEGORY_DISPLAY_ORDER_MAX = 100_000;

export interface CategoryFormValues {
  readonly name: string;
  readonly slug: string;
  readonly isIndexable: boolean;
  /** Kept as typed text; converted once, at the wire boundary. */
  readonly displayOrder: string;
}

/** A new category opens unindexed and unordered — both are operator decisions. */
export const EMPTY_CATEGORY_FORM: CategoryFormValues = {
  name: '',
  slug: '',
  isIndexable: false,
  displayOrder: '0',
};

export type CategoryFieldErrors = Partial<Record<keyof CategoryFormValues, string>>;

/** The reason a field is invalid, as a key the copy module resolves to text. */
export type CategoryValidationReason =
  | 'name-required'
  | 'name-too-long'
  | 'slug-required'
  | 'slug-malformed'
  | 'slug-too-long'
  | 'display-order-invalid'
  | 'display-order-range';

export type CategoryValidationErrors = Partial<
  Record<keyof CategoryFormValues, CategoryValidationReason>
>;

function validateName(raw: string): CategoryValidationReason | undefined {
  const name = raw.trim();
  if (name.length === 0) return 'name-required';
  return name.length > CATEGORY_NAME_MAX_LENGTH ? 'name-too-long' : undefined;
}

function validateSlug(raw: string): CategoryValidationReason | undefined {
  if (raw.length === 0) return 'slug-required';
  if (raw.length > CATEGORY_SLUG_MAX_LENGTH) return 'slug-too-long';
  return CATEGORY_SLUG_PATTERN.test(raw) ? undefined : 'slug-malformed';
}

/**
 * Parses the typed order, or reports why it is not one.
 *
 * Deliberately stricter than `Number()`: `"1e3"`, `" 12 "` and `"1.5"` all
 * coerce to a number, and none of them is what an operator meant to type into a
 * position field.
 */
export function parseDisplayOrder(raw: string): number | undefined {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : undefined;
}

function validateDisplayOrder(raw: string): CategoryValidationReason | undefined {
  const parsed = parseDisplayOrder(raw);
  if (parsed === undefined) return 'display-order-invalid';
  return parsed < CATEGORY_DISPLAY_ORDER_MIN || parsed > CATEGORY_DISPLAY_ORDER_MAX
    ? 'display-order-range'
    : undefined;
}

/**
 * Validates the fields the current state actually writes.
 *
 * `editableSlug` is false for a PUBLISHED or ARCHIVED category: its slug is
 * displayed but never sent, so validating it would be able to block a save over
 * a value the request will not carry.
 */
export function validateCategoryForm(
  values: CategoryFormValues,
  options: { readonly editableSlug: boolean },
): CategoryValidationErrors {
  const name = validateName(values.name);
  const slug = options.editableSlug ? validateSlug(values.slug) : undefined;
  const displayOrder = validateDisplayOrder(values.displayOrder);
  return {
    ...(name === undefined ? {} : { name }),
    ...(slug === undefined ? {} : { slug }),
    ...(displayOrder === undefined ? {} : { displayOrder }),
  };
}

export function hasCategoryValidationError(errors: CategoryValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The exact create body: four fields, no status, nothing inferred. */
export function toCreateCategoryBody(values: CategoryFormValues): CreateCategoryBody {
  return {
    name: values.name.trim(),
    slug: values.slug,
    isIndexable: values.isIndexable,
    displayOrder: parseDisplayOrder(values.displayOrder) ?? CATEGORY_DISPLAY_ORDER_MIN,
  };
}

/** The saved record a patch is measured against. */
export interface CategoryBaseline {
  readonly name: string;
  readonly slug: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
  /** The `updatedAt` token last read for this category. Never synthesised. */
  readonly updatedAt: string;
}

export function toCategoryFormValues(baseline: CategoryBaseline): CategoryFormValues {
  return {
    name: baseline.name,
    slug: baseline.slug,
    isIndexable: baseline.isIndexable,
    displayOrder: String(baseline.displayOrder),
  };
}

/**
 * The patch: only what actually changed, plus the concurrency token.
 *
 * `expectedUpdatedAt` is the baseline's own `updatedAt`, copied verbatim. It is
 * never re-read from a clock and never rounded — it is the server's token, and
 * a value this app composed would either be refused or, worse, accepted for a
 * version the operator never saw.
 *
 * `slug` is included only when the state allows it *and* it changed. Sending an
 * unchanged slug for a PUBLISHED category would be refused as
 * `CATEGORY_SLUG_IMMUTABLE` even though the operator changed nothing.
 */
export function toUpdateCategoryBody(
  values: CategoryFormValues,
  baseline: CategoryBaseline,
  options: { readonly editableSlug: boolean },
): UpdateCategoryBody {
  const name = values.name.trim();
  const displayOrder = parseDisplayOrder(values.displayOrder);
  return {
    expectedUpdatedAt: baseline.updatedAt,
    ...(name === baseline.name ? {} : { name }),
    ...(options.editableSlug && values.slug !== baseline.slug ? { slug: values.slug } : {}),
    ...(values.isIndexable === baseline.isIndexable ? {} : { isIndexable: values.isIndexable }),
    ...(displayOrder === undefined || displayOrder === baseline.displayOrder
      ? {}
      : { displayOrder }),
  };
}

/**
 * Whether a patch would carry an actual change.
 *
 * An update body is never sent with `expectedUpdatedAt` alone: an empty patch
 * spends a write, advances the concurrency token and invalidates every other
 * operator's in-flight edit, all to change nothing.
 */
export function isEmptyCategoryPatch(body: UpdateCategoryBody): boolean {
  return Object.keys(body).every((key) => key === 'expectedUpdatedAt');
}

/** Whether the form differs from the record it was loaded from. */
export function isCategoryFormDirty(
  values: CategoryFormValues,
  baseline: CategoryBaseline,
): boolean {
  return (
    values.name.trim() !== baseline.name ||
    values.slug !== baseline.slug ||
    values.isIndexable !== baseline.isIndexable ||
    parseDisplayOrder(values.displayOrder) !== baseline.displayOrder
  );
}
