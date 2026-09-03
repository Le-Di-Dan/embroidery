'use client';

import { useId } from 'react';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { CATEGORY_COPY, CATEGORY_VALIDATION_COPY } from '../model/category-copy';
import type { CategoryFormValues, CategoryValidationErrors } from '../model/category-form-values';

interface CategoryFormFieldsProps {
  readonly values: CategoryFormValues;
  readonly errors: CategoryValidationErrors;
  /** A server refusal that belongs to the slug control, not to the panel. */
  readonly slugFieldError?: string;
  /** False for a PUBLISHED or ARCHIVED category — the slug is frozen. */
  readonly slugEditable: boolean;
  /** True for an ARCHIVED category — the whole record is read-only. */
  readonly readOnly: boolean;
  readonly onChange: (patch: Partial<CategoryFormValues>) => void;
}

/**
 * The four category fields (`916:347` DRAFT, `916:370` PUBLISHED).
 *
 * Every control has a real `<label for>`, and its help or error text is wired
 * through `aria-describedby` by `AdminTextField`, so the reason a field is
 * invalid is announced with the field. Errors replace help text rather than
 * joining it; both at once buries the error.
 *
 * ## The locked slug is shown, never hidden
 *
 * A published category's slug stays on screen — it is that category's public
 * address and the operator must be able to read it — but the control is
 * disabled, carries `🔒 khoá sau khi xuất bản` beside its label (`916:379`) and
 * explains the freeze below (`916:382`). Hiding it would answer "what is this
 * category's URL?" with silence; disabling it without a reason would look like
 * a bug.
 *
 * ## `displayOrder` is authored, not drawn
 *
 * The frames draw name, slug and indexability. `adminCategory_create` requires
 * `displayOrder` and `adminCategory_update` accepts it, and the list's ordering
 * is `displayOrder` first — so a management screen without the control could
 * create categories but never re-order them, and would be sending a value the
 * operator never chose. It is rendered in the drawn field language, with no new
 * component and no new token.
 */
export function CategoryFormFields({
  values,
  errors,
  slugFieldError,
  slugEditable,
  readOnly,
  onChange,
}: CategoryFormFieldsProps) {
  const indexableId = useId();
  const nameError = messageFor(errors.name);
  const slugError = slugFieldError ?? messageFor(errors.slug);
  const orderError = messageFor(errors.displayOrder);

  return (
    <>
      <AdminTextField
        label={CATEGORY_COPY.form.nameLabel}
        value={values.name}
        disabled={readOnly}
        testId="category-name"
        {...(nameError === undefined ? {} : { error: nameError })}
        onChange={(name) => onChange({ name })}
      />

      <AdminTextField
        label={CATEGORY_COPY.form.slugLabel}
        value={values.slug}
        disabled={readOnly || !slugEditable}
        help={slugEditable ? CATEGORY_COPY.form.slugHelp : CATEGORY_COPY.form.slugLockedHelp}
        testId="category-slug"
        {...(slugEditable ? {} : { labelSuffix: CATEGORY_COPY.form.slugLockedChip })}
        {...(slugError === undefined ? {} : { error: slugError })}
        onChange={(slug) => onChange({ slug })}
      />

      <AdminTextField
        label={CATEGORY_COPY.form.displayOrderLabel}
        value={values.displayOrder}
        disabled={readOnly}
        inputMode="numeric"
        help={CATEGORY_COPY.form.displayOrderHelp}
        testId="category-display-order"
        {...(orderError === undefined ? {} : { error: orderError })}
        onChange={(displayOrder) => onChange({ displayOrder })}
      />

      <div className="category-checkbox">
        <input
          id={indexableId}
          type="checkbox"
          className="category-checkbox__box"
          checked={values.isIndexable}
          disabled={readOnly}
          data-testid="category-indexable"
          onChange={(event) => onChange({ isIndexable: event.target.checked })}
        />
        <label className="category-checkbox__label" htmlFor={indexableId}>
          {CATEGORY_COPY.form.indexableLabel}
        </label>
      </div>
    </>
  );
}

/** Resolves a validation reason key to its approved sentence. */
function messageFor(reason: CategoryValidationErrors[keyof CategoryValidationErrors]) {
  return reason === undefined ? undefined : CATEGORY_VALIDATION_COPY[reason];
}
