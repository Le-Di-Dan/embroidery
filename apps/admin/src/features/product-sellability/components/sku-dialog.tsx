'use client';

import { useId, useState } from 'react';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { SELLABILITY_COPY } from '../model/sellability-copy';
import type { SellabilityWriteFailure } from '../model/sellability-failure';
import { formatDong, isResolvablePrice } from '../model/sku-effective-price';
import { validateSkuForm, type SkuFormError, type SkuFormValues } from '../model/sku-form';
import { SellabilityDialog } from './sellability-dialog';
import { SellabilityFailureNote } from './sellability-failure-note';

interface SkuDialogProps {
  readonly mode: 'create' | 'edit';
  /** The variant this SKU belongs to; immutable, so it is stated and never edited. */
  readonly variantTitle: string;
  /** The product's base price, as the decimal string the contract carries. */
  readonly basePriceAmount: string;
  readonly initialValues: SkuFormValues;
  readonly pending: boolean;
  readonly failure: SellabilityWriteFailure | null;
  /** The SKU already selling under this variant, for the ambiguity refusal. */
  readonly conflictingSkuCode?: string;
  readonly onSubmit: (values: SkuFormValues) => void;
  readonly onDismiss: () => void;
}

const FAILURE_NOTE_ID = 'sku-dialog-failure';

/**
 * Create and edit one SKU (`976:187`, `976:269`).
 *
 * ### The price is a two-way choice, drawn as one
 *
 * A radio pair, not an optional amount field. With a bare optional input,
 * "return this SKU to the product's price" has nowhere to be expressed —
 * clearing the box and never touching it look identical — and the operator
 * cannot see, without reading the empty field as meaningful, which price
 * applies. The inheritance option names the amount it inherits for the same
 * reason.
 *
 * A base price the product has not set yet does not hide the inheritance
 * option: it is still a legitimate choice, and the label says the product has
 * no price rather than rendering `0 ₫` as if one had been chosen.
 *
 * ### Staged input survives a refusal
 *
 * Every refusal leaves the dialog open with its values intact. That matters
 * most for `SKU_ORDER_ELIGIBLE_AMBIGUOUS`, where the staged SKU is not wrong —
 * it merely cannot be *active* yet — and where the approved recovery is for the
 * operator to turn the toggle off and create it inactive. Discarding their
 * input would remove the one action the refusal is telling them to take.
 *
 * Nothing here retries and nothing deactivates the existing SKU automatically.
 * There is no delete control.
 */
export function SkuDialog({
  mode,
  variantTitle,
  basePriceAmount,
  initialValues,
  pending,
  failure,
  conflictingSkuCode,
  onSubmit,
  onDismiss,
}: SkuDialogProps) {
  const [values, setValues] = useState<SkuFormValues>(initialValues);
  const [localError, setLocalError] = useState<SkuFormError | null>(null);
  const copy = SELLABILITY_COPY.skuDialog;
  const priceModeName = useId();

  const submit = () => {
    const error = validateSkuForm(values);
    setLocalError(error);
    if (error === null) onSubmit(values);
  };

  const inheritLabel = isResolvablePrice(basePriceAmount)
    ? copy.priceInherit(formatDong(basePriceAmount))
    : copy.priceInheritUnset;

  const priceError =
    localError === 'priceRequired'
      ? SELLABILITY_COPY.validation.priceRequired
      : localError === 'priceInvalid'
        ? SELLABILITY_COPY.validation.priceInvalid
        : undefined;

  return (
    <SellabilityDialog
      title={mode === 'create' ? copy.createTitle : copy.editTitle}
      subtitle={copy.subtitle(variantTitle)}
      testId="sku-dialog"
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
          label={copy.codeLabel}
          value={values.code}
          onChange={(code) => setValues((current) => ({ ...current, code }))}
          help={copy.codeHint}
          {...(localError === 'codeRequired'
            ? { error: SELLABILITY_COPY.validation.codeRequired }
            : {})}
          disabled={pending}
          testId="sku-code"
        />

        <fieldset className="product-sellability-dialog__fieldset" disabled={pending}>
          <legend className="product-sellability-dialog__legend">{copy.priceModeLabel}</legend>
          <label className="product-sellability-dialog__radio">
            <input
              type="radio"
              name={priceModeName}
              checked={values.priceMode === 'inherit'}
              data-testid="sku-price-inherit"
              onChange={() => setValues((current) => ({ ...current, priceMode: 'inherit' }))}
            />
            <span>{inheritLabel}</span>
          </label>
          <label className="product-sellability-dialog__radio">
            <input
              type="radio"
              name={priceModeName}
              checked={values.priceMode === 'override'}
              data-testid="sku-price-override"
              onChange={() => setValues((current) => ({ ...current, priceMode: 'override' }))}
            />
            <span>{copy.priceOverride}</span>
          </label>
          {values.priceMode === 'override' ? (
            <AdminTextField
              label={copy.priceOverrideLabel}
              value={values.priceOverride}
              onChange={(priceOverride) => setValues((current) => ({ ...current, priceOverride }))}
              help={copy.priceOverrideHint}
              {...(priceError === undefined ? {} : { error: priceError })}
              inputMode="numeric"
              disabled={pending}
              testId="sku-price-amount"
            />
          ) : null}
        </fieldset>

        {/*
          Selling is authored here on create and nowhere else in this dialog.
          It is also the operator's recovery from the ambiguity refusal: turn it
          off and the same staged SKU is created inactive, which is a complete
          and correct outcome rather than a workaround. Stopping or resuming an
          existing SKU is the row's own action, so the change that can make a
          published product unbuyable passes the approved confirmation.
        */}
        {mode === 'create' ? (
          <>
            <label className="product-sellability-dialog__toggle">
              <input
                type="checkbox"
                checked={values.isActive}
                disabled={pending}
                data-testid="sku-active"
                onChange={(event) =>
                  setValues((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              <span>{copy.activeLabel}</span>
            </label>
            <p className="product-sellability-dialog__note">{copy.activeHint}</p>
          </>
        ) : null}

        {/*
          Stated on create only, and stated as fact: a new SKU's stock is 0, the
          anchor row is created lazily by the first stock read, and stock is
          never a publication requirement. Without this an operator would
          reasonably assume the SKU is unsellable until they visit the stock
          screen.
        */}
        {mode === 'create' ? (
          <p className="product-sellability-dialog__note">{copy.stockNote}</p>
        ) : null}

        {failure === null ? null : (
          <SellabilityFailureNote
            failure={failure}
            id={FAILURE_NOTE_ID}
            {...(conflictingSkuCode === undefined ? {} : { conflictingSkuCode })}
          />
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
            data-testid="sku-dialog-submit"
          >
            {pending ? copy.submitting : mode === 'create' ? copy.submitCreate : copy.submitEdit}
          </button>
        </div>
      </form>
    </SellabilityDialog>
  );
}
