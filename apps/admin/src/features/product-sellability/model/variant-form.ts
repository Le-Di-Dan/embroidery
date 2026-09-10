/**
 * The variant dialog's values, and the exact bodies they become.
 *
 * A pure module: no React, no network, no copy. It exists so the "at least one
 * label" rule and the blank-to-null mapping are testable without rendering a
 * dialog, and so the two places that build a body — create and update — cannot
 * drift into sending different shapes for the same fields.
 *
 * ### Blank means null, and the server is still the judge
 *
 * `colorName` and `sizeLabel` are nullable on the wire, and a blank string is
 * stored as null. The mapping is done here rather than left to the server so
 * the request says what it means: `""` and `null` would otherwise be two ways
 * of writing the same thing, and only one of them survives a round trip.
 *
 * The local "at least one label" check mirrors `VARIANT_LABEL_REQUIRED` so the
 * operator is told before a round trip. It is not a second authority — the
 * server re-validates, normalizes whitespace, and remains the only thing that
 * decides a refusal. In particular this module does **not** attempt the
 * duplicate check: uniqueness is decided against rows the dialog cannot see,
 * including deactivated ones, and a client that guessed at it would be wrong in
 * exactly the case that matters.
 *
 * `displayOrder` is absent from every body on purpose. The server assigns it
 * under a write lock and never accepts it from a request; there is no reorder
 * operation to build one for.
 */
import type { CreateProductVariantBody, UpdateProductVariantBody } from '@embroidery/api-client';

export interface VariantFormValues {
  readonly colorName: string;
  readonly sizeLabel: string;
  readonly isActive: boolean;
}

/** A new variant starts active: the operator is adding something to sell. */
export const NEW_VARIANT_FORM: VariantFormValues = {
  colorName: '',
  sizeLabel: '',
  isActive: true,
};

export function variantFormFrom(variant: {
  readonly colorName: string | null;
  readonly sizeLabel: string | null;
  readonly isActive: boolean;
}): VariantFormValues {
  return {
    colorName: variant.colorName ?? '',
    sizeLabel: variant.sizeLabel ?? '',
    isActive: variant.isActive,
  };
}

/** The one thing the dialog can decide by itself. */
export type VariantFormError = 'labelRequired';

export function validateVariantForm(values: VariantFormValues): VariantFormError | null {
  const hasLabel = values.colorName.trim() !== '' || values.sizeLabel.trim() !== '';
  return hasLabel ? null : 'labelRequired';
}

function labelOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function toCreateVariantBody(values: VariantFormValues): CreateProductVariantBody {
  return {
    colorName: labelOrNull(values.colorName),
    sizeLabel: labelOrNull(values.sizeLabel),
    isActive: values.isActive,
  };
}

/**
 * The body for a label edit.
 *
 * `isActive` is deliberately absent. The edit dialog does not author activation
 * — the row's own control does, because that is the change that can make a
 * published product unbuyable and therefore has to pass a confirmation. Sending
 * the flag from here would also resurrect a variant someone else deactivated
 * between this dialog opening and the operator pressing save, by echoing back a
 * value the form had merely been seeded with.
 */
export function toUpdateVariantBody(values: VariantFormValues): UpdateProductVariantBody {
  return {
    colorName: labelOrNull(values.colorName),
    sizeLabel: labelOrNull(values.sizeLabel),
  };
}

/** The body for a pure activation change, which touches no label at all. */
export function toVariantActivationBody(isActive: boolean): UpdateProductVariantBody {
  return { isActive };
}
