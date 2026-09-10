'use client';

import { useState } from 'react';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { SELLABILITY_COPY } from '../model/sellability-copy';
import type { SellabilityWriteFailure } from '../model/sellability-failure';
import {
  validateVariantForm,
  type VariantFormError,
  type VariantFormValues,
} from '../model/variant-form';
import { SellabilityDialog } from './sellability-dialog';
import { SellabilityFailureNote } from './sellability-failure-note';

interface VariantDialogProps {
  readonly mode: 'create' | 'edit';
  /** The title of the variant being edited; unused in create mode. */
  readonly subjectTitle: string;
  readonly initialValues: VariantFormValues;
  readonly pending: boolean;
  /** The last refused attempt, or null. Staged input is never cleared by one. */
  readonly failure: SellabilityWriteFailure | null;
  readonly onSubmit: (values: VariantFormValues) => void;
  readonly onDismiss: () => void;
}

const FAILURE_NOTE_ID = 'variant-dialog-failure';

/**
 * Create and edit one variant (`975:187`, `975:220`).
 *
 * Both labels are optional individually and required together, which is why
 * neither field is marked required and the rule is stated once beneath them.
 * Marking both required would be false, and marking neither would leave the
 * refusal unexplained until the operator hit it.
 *
 * The local check answers only `VARIANT_LABEL_REQUIRED`, and even that is a
 * courtesy: the request would be refused identically by the server. Uniqueness
 * is deliberately not attempted here — it is decided against variants this
 * dialog cannot see, including deactivated ones, so a client-side duplicate
 * check would be wrong in exactly the case the operator needs it.
 *
 * There is no delete control, at any state. The contract publishes none;
 * deactivation is how a variant leaves the catalog, and it is the toggle below.
 */
export function VariantDialog({
  mode,
  subjectTitle,
  initialValues,
  pending,
  failure,
  onSubmit,
  onDismiss,
}: VariantDialogProps) {
  const [values, setValues] = useState<VariantFormValues>(initialValues);
  const [localError, setLocalError] = useState<VariantFormError | null>(null);
  const copy = SELLABILITY_COPY.variantDialog;

  const submit = () => {
    const error = validateVariantForm(values);
    setLocalError(error);
    if (error === null) onSubmit(values);
  };

  // A field-level message on both label inputs, because the rule is about the
  // pair: attaching it to one of them would tell the operator to fix a field
  // that is not individually wrong.
  const labelError =
    localError === 'labelRequired' ? SELLABILITY_COPY.validation.labelRequired : undefined;

  return (
    <SellabilityDialog
      title={mode === 'create' ? copy.createTitle : copy.editTitle}
      subtitle={mode === 'create' ? copy.createSubtitle : copy.editSubtitle(subjectTitle)}
      testId="variant-dialog"
      onDismiss={pending ? () => undefined : onDismiss}
    >
      <form
        className="product-sellability-dialog__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <AdminTextField
          label={copy.colorLabel}
          value={values.colorName}
          onChange={(colorName) => setValues((current) => ({ ...current, colorName }))}
          {...(labelError === undefined ? {} : { error: labelError })}
          disabled={pending}
          testId="variant-color"
        />
        <AdminTextField
          label={copy.sizeLabel}
          value={values.sizeLabel}
          onChange={(sizeLabel) => setValues((current) => ({ ...current, sizeLabel }))}
          help={copy.optionalHint}
          {...(labelError === undefined ? {} : { error: labelError })}
          disabled={pending}
          testId="variant-size"
        />

        {/*
          Activation is authored here on create and nowhere else in this dialog.
          Deactivating an existing variant is the row's own action, because that
          is the change that can make a published product unbuyable and it has
          to pass the approved confirmation — a toggle buried in an edit form
          would be a second, unguarded path to the same state.
        */}
        {mode === 'create' ? (
          <label className="product-sellability-dialog__toggle">
            <input
              type="checkbox"
              checked={values.isActive}
              disabled={pending}
              data-testid="variant-active"
              onChange={(event) =>
                setValues((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            <span>{copy.activeLabel}</span>
          </label>
        ) : null}

        {/*
          The next step, stated on create only: a variant with no SKU cannot be
          ordered, and an operator who stops here would have added something
          that looks finished and sells nothing.
        */}
        {mode === 'create' ? (
          <p className="product-sellability-dialog__note">{copy.nextStep}</p>
        ) : null}

        {failure === null ? null : (
          <SellabilityFailureNote failure={failure} id={FAILURE_NOTE_ID} />
        )}

        <div className="product-sellability-dialog__actions">
          <button
            type="button"
            className="product-sellability-dialog__secondary"
            disabled={pending}
            onClick={onDismiss}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            className="product-sellability-dialog__primary"
            disabled={pending}
            data-testid="variant-dialog-submit"
          >
            {pending ? copy.submitting : mode === 'create' ? copy.submitCreate : copy.submitEdit}
          </button>
        </div>
      </form>
    </SellabilityDialog>
  );
}
