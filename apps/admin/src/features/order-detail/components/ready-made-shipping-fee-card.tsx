'use client';

import { useState } from 'react';

import type {
  AdminOrderPaymentsResponse,
  AdminShippingDetailResponse,
} from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { useSaveShippingDetail } from '../hooks/use-order-fulfillment';
import { classifyFulfillmentFailure } from '../model/fulfillment-failure';
import { READY_MADE_DETAIL_COPY as COPY } from '../model/ready-made-detail-copy';
import {
  readOptionalText,
  toSaveShippingBody,
  toShippingFormValues,
  type ShippingFormValues,
} from '../model/shipping-detail-form';
import { readyMadeFeeStage, type ReadyMadeFeeStage } from '../model/ready-made-fee-stage';
import { DefinitionRow } from './definition-row';
import { PaymentField } from './payment-field';

interface ReadyMadeShippingFeeCardProps {
  readonly orderId: string;
  readonly detail: AdminShippingDetailResponse;
  readonly payments: AdminOrderPaymentsResponse;
  /** The order's frozen merchandise subtotal, transported as stored. */
  readonly merchandiseAmount: string;
  readonly currencyCode: string;
  readonly onSaved: () => void;
}

/**
 * The Ready-Made shipping fee, in the three states `913:337` and `914:361` draw.
 *
 * ## `NULL` is "not priced", never zero
 *
 * An unpriced order has `feeAmount: null`, and the field opens **empty**. It is
 * not prefilled with `0`, and a saved `0.00` means the shop chose free delivery
 * — a different fact, which the card shows as `0` rather than as a blank.
 *
 * ## The fee is a decimal string from end to end
 *
 * Typed as text with `inputMode="decimal"`, carried as text, and submitted as
 * text. There is no `Number`, no `parseFloat` and no `toFixed` anywhere on this
 * path: a VND figure through an IEEE-754 double is precision loss no later
 * formatting can undo, and this is the figure the customer is then asked to
 * transfer exactly.
 *
 * ## The payable total is the server's, and is not previewed
 *
 * `913:337` draws `Tổng khách phải trả` filled in beside a fee the operator has
 * only *typed*. Rendering that would mean adding the subtotal and the entered
 * fee in the browser, which `APP12-A02-C1` §18 and §40 forbid outright — the
 * payable total is the `FULL` obligation's own frozen column, and until the
 * save commits there is no obligation to read it from. So the row is present
 * (the operator is told the total exists and what it is called) and its value
 * says `Chưa xác định` until the server has one. After the save, the amount
 * shown is the obligation's, read back.
 *
 * ## A correction says what it replaces, and does not promise more time
 *
 * While the `FULL` is `PENDING` a fee change is allowed, and it **supersedes**
 * the obligation: the predecessor is replaced and its payment link stops
 * working. The warning says exactly that. It deliberately does not say the
 * customer gets longer to pay — the server reschedules the stock hold, which is
 * a different fact, and a deadline claimed here would be this screen inventing
 * one.
 *
 * ## After settlement the card refuses, and says why
 *
 * `BR-028`. Not a disabled input with no explanation: the refusal names the
 * rule and the legitimate path (cancellation/refund), because an operator who
 * is only stopped will try again somewhere else.
 */
export function ReadyMadeShippingFeeCard({
  orderId,
  detail,
  payments,
  merchandiseAmount,
  currencyCode,
  onSaved,
}: ReadyMadeShippingFeeCardProps) {
  const stage: ReadyMadeFeeStage = readyMadeFeeStage(detail, payments);
  const [values, setValues] = useState<ShippingFormValues>(() => toShippingFormValues(detail));
  const [invalid, setInvalid] = useState(false);
  const save = useSaveShippingDetail(orderId);

  const storedFee = readOptionalText(detail.feeAmount);
  const payable = payments.currentObligation?.expectedAmount;

  const submit = () => {
    if (save.isPending) return;
    // The only client-side rule: a fee must actually have been entered. Its
    // *value* is the server's to judge — this does not pre-empt a refusal.
    if (values.feeAmount.trim() === '') {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate(toSaveShippingBody(values), { onSuccess: () => onSaved() });
  };

  if (stage === 'settled') {
    return (
      <section className="order-card" aria-labelledby="shipping-fee-heading">
        <h2 className="order-card__title" id="shipping-fee-heading">
          {COPY.shipping.heading}
        </h2>
        <dl className="order-card__definitions">
          <DefinitionRow label={COPY.shipping.frozenHeading} testId="shipping-fee-frozen">
            {storedFee === null ? '—' : formatAmountWithCurrency(storedFee, currencyCode)}
          </DefinitionRow>
        </dl>
        <div className="order-card__refusal" role="note" data-testid="shipping-fee-refused">
          <p className="order-card__refusal-title">{COPY.shipping.refusedTitle}</p>
          <p className="order-card__refusal-body">{COPY.shipping.refusedBody}</p>
        </div>
      </section>
    );
  }

  const correcting = stage === 'correctable';

  return (
    <section className="order-card" aria-labelledby="shipping-fee-heading">
      <h2 className="order-card__title" id="shipping-fee-heading">
        {COPY.shipping.heading}
      </h2>
      <p className="order-card__help">{COPY.shipping.help}</p>

      <PaymentField
        label={COPY.shipping.feeLabel}
        value={values.feeAmount}
        onChange={(feeAmount) => setValues((current) => ({ ...current, feeAmount }))}
        required
        requiredLabel={COPY.shipping.requiredLabel}
        optionalLabel=""
        help={COPY.shipping.feeHelp}
        placeholder={COPY.shipping.feePlaceholder}
        inputMode="decimal"
        disabled={save.isPending}
        testId="shipping-fee-input"
        {...(invalid ? { error: COPY.failure.saveFailed } : {})}
      />

      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.shipping.merchandise} testId="shipping-fee-merchandise">
          {formatAmountWithCurrency(merchandiseAmount, currencyCode)}
        </DefinitionRow>
        <DefinitionRow label={COPY.shipping.payable} testId="shipping-fee-payable">
          {payable === undefined
            ? COPY.shipping.payableUnknown
            : formatAmountWithCurrency(payable, currencyCode)}
        </DefinitionRow>
      </dl>

      {correcting ? (
        <p className="order-card__warning" role="note" data-testid="shipping-fee-supersede-warning">
          {COPY.shipping.correctWarning}
        </p>
      ) : null}

      <button
        type="button"
        className="order-card__action"
        data-testid="shipping-fee-submit"
        disabled={save.isPending}
        onClick={submit}
      >
        {save.isPending
          ? COPY.shipping.saving
          : correcting
            ? COPY.shipping.correct
            : COPY.shipping.confirm}
      </button>

      {save.isError ? (
        <p className="order-card__error" role="alert" data-testid="shipping-fee-error">
          {classifyFulfillmentFailure(save.error) === 'stale'
            ? COPY.failure.stale
            : COPY.failure.saveFailed}
        </p>
      ) : null}

      <p className="order-card__note">
        {correcting ? COPY.shipping.pendingNote : COPY.shipping.confirmNote}
      </p>
    </section>
  );
}
