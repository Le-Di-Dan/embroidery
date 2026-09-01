'use client';

import { useId } from 'react';

import { toProductCategoryOptions } from '../model/product-category-options';
import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import type { ProductFormValues, ProductValidationErrors } from '../model/product-form-values';
import type { ProductCategory } from '../services/category-inventory.service';

interface ProductFormFieldsProps {
  readonly values: ProductFormValues;
  readonly errors: ProductValidationErrors;
  readonly disabled: boolean;
  /** Create mode renders three fields; price belongs to edit mode only. */
  readonly showPrice: boolean;
  /**
   * The category inventory, from `GET /api/public/categories` (`APP12-C01-C1`).
   *
   * Passed in rather than fetched here: this component renders and owns no data.
   * An empty array — inventory still loading, or unreadable — renders the
   * placeholder alone, which is a truthful "no category can be chosen right now"
   * rather than a remembered list of four.
   */
  readonly categories: readonly ProductCategory[];
  readonly onChange: (patch: Partial<ProductFormValues>) => void;
}

/**
 * The editable scalar fields (`434:20` / `436:37` / `438:90`).
 *
 * Every control has a real `<label for>` — never a placeholder standing in for
 * one — and its help or error text is wired through `aria-describedby`, so the
 * reason a field is invalid is announced with the field rather than only in the
 * summary above. An invalid field carries `aria-invalid` and shows the approved
 * message *in place of* its help text; both at once would bury the error.
 *
 * Price is a `text` input with a numeric `inputMode`, not `type="number"`. The
 * contract is a 1–12 digit string, and a number input would invite the browser
 * to reformat, round or exponent-notate a value that must stay exactly as
 * typed.
 */
export function ProductFormFields({
  values,
  errors,
  disabled,
  showPrice,
  categories,
  onChange,
}: ProductFormFieldsProps) {
  const nameId = useId();
  const descriptionId = useId();
  const categoryId = useId();
  const priceId = useId();

  return (
    <>
      <fieldset className="product-form__group" disabled={disabled}>
        <legend className="product-form__group-title">{PRODUCT_FORM_COPY.groups.basic}</legend>

        <div className="product-field">
          <label className="product-field__label" htmlFor={nameId}>
            {PRODUCT_FORM_COPY.fields.nameLabel}
          </label>
          <input
            id={nameId}
            className="product-field__control"
            type="text"
            value={values.name}
            placeholder={PRODUCT_FORM_COPY.fields.namePlaceholder}
            aria-describedby={`${nameId}-help`}
            aria-invalid={errors.name !== undefined}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p
            className={errors.name === undefined ? 'product-field__help' : 'product-field__error'}
            id={`${nameId}-help`}
          >
            {errors.name ?? PRODUCT_FORM_COPY.fields.nameHelp}
          </p>
        </div>

        <div className="product-field">
          <label className="product-field__label" htmlFor={descriptionId}>
            {PRODUCT_FORM_COPY.fields.descriptionLabel}
          </label>
          <textarea
            id={descriptionId}
            className="product-field__control product-field__control--textarea"
            value={values.description}
            rows={4}
            aria-describedby={`${descriptionId}-help`}
            onChange={(event) => onChange({ description: event.target.value })}
          />
          <p className="product-field__help" id={`${descriptionId}-help`}>
            {PRODUCT_FORM_COPY.fields.descriptionHelp}
          </p>
        </div>
      </fieldset>

      <fieldset className="product-form__group" disabled={disabled}>
        <legend className="product-form__group-title">{PRODUCT_FORM_COPY.groups.category}</legend>

        <div className="product-field">
          <label className="product-field__label" htmlFor={categoryId}>
            {PRODUCT_FORM_COPY.fields.categoryLabel}
          </label>
          <select
            id={categoryId}
            className="product-field__control"
            value={values.categorySlug}
            aria-describedby={`${categoryId}-help`}
            aria-invalid={errors.categorySlug !== undefined}
            onChange={(event) => onChange({ categorySlug: event.target.value })}
          >
            <option value="">{PRODUCT_FORM_COPY.fields.categoryPlaceholder}</option>
            {toProductCategoryOptions(categories).map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.label}
              </option>
            ))}
          </select>
          <p
            className={
              errors.categorySlug === undefined ? 'product-field__help' : 'product-field__error'
            }
            id={`${categoryId}-help`}
          >
            {errors.categorySlug ?? PRODUCT_FORM_COPY.fields.categoryHelp}
          </p>
        </div>
      </fieldset>

      {showPrice ? (
        <fieldset className="product-form__group" disabled={disabled}>
          <legend className="product-form__group-title">{PRODUCT_FORM_COPY.groups.price}</legend>

          <div className="product-field">
            <label className="product-field__label" htmlFor={priceId}>
              {PRODUCT_FORM_COPY.fields.priceLabel}
            </label>
            <input
              id={priceId}
              className="product-field__control"
              type="text"
              inputMode="numeric"
              value={values.price}
              aria-describedby={`${priceId}-help`}
              aria-invalid={errors.price !== undefined}
              onChange={(event) => onChange({ price: event.target.value })}
            />
            <p
              className={
                errors.price === undefined ? 'product-field__help' : 'product-field__error'
              }
              id={`${priceId}-help`}
            >
              {errors.price ?? PRODUCT_FORM_COPY.fields.priceHelp}
            </p>
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
