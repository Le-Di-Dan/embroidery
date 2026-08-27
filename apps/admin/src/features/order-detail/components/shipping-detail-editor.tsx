'use client';

import { useCallback, useState } from 'react';

import type { AdminShippingDetailResponse } from '@embroidery/api-client';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';
import { useSaveShippingDetail } from '../hooks/use-order-fulfillment';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import {
  classifyFulfillmentFailure,
  isFeeAcknowledgementRefusal,
} from '../model/fulfillment-failure';
import {
  EMPTY_SHIPPING_FORM,
  findShippingFieldErrors,
  hasShippingChanges,
  isFeeIncrease,
  readOptionalText,
  toSaveShippingBody,
  toShippingFormValues,
  type ShippingFormField,
  type ShippingFormValues,
} from '../model/shipping-detail-form';
import { refusalSentence } from './fulfillment-confirm-dialog';
import { ShippingDetailFields } from './shipping-detail-fields';
import { ShippingFeeCard } from './shipping-fee-card';
import { ShippingFeeRefusalCard } from './shipping-fee-refusal-card';

interface ShippingDetailEditorProps {
  readonly orderId: string;
  /** The stored detail, or `null` when the order has none saved yet. */
  readonly detail: AdminShippingDetailResponse | null;
  readonly currencyCode: string;
  /** Whether an unsaved fee change is blocking dispatch. Lifted for the rail. */
  readonly onBlockedChange: (blocked: boolean) => void;
}

/**
 * The editable shipping detail (`812:38`), and the two things a save can mean.
 *
 * ## Save is a full replacement, and the form sends all nine members
 *
 * `PUT` takes a complete body: an optional member it omits is **cleared**, not
 * left alone. So an emptied optional field is omitted on purpose — that is what
 * clearing it means — and nothing is quietly carried over from the last read.
 *
 * ## Two save outcomes, and only one of them is an ordinary error
 *
 * A fee **increase** with no matching customer acknowledgement is refused with
 * nothing written at all, and gets the approved refusal card rather than an
 * inline sentence — `APP9-B04-C1` makes it the one refusal an operator cannot
 * resolve alone. Every other refusal is one sentence beside the buttons.
 *
 * ## The fee comparison warns; it never decides
 *
 * `isFeeIncrease` is string arithmetic on whole đồng — no `Number`, no float —
 * and it is used only to shape what the editor says. The server measures the
 * increase against its own stored `previousFeeAmount`, which may not be what
 * this browser last read, and refuses on its own terms. The form does not block
 * a save it thinks would fail.
 *
 * ## Nothing here computes what the customer owes
 *
 * The fee is displayed and edited. The balance it moves is not: no obligation
 * amount is derived, and the `AdminShippingFeeOutcomeResponse` a successful save
 * returns is not projected into the cache as a new payment truth — the detail is
 * re-read instead.
 */
export function ShippingDetailEditor({
  orderId,
  detail,
  currencyCode,
  onBlockedChange,
}: ShippingDetailEditorProps) {
  const stored = detail === null ? EMPTY_SHIPPING_FORM : toShippingFormValues(detail);
  const [values, setValues] = useState<ShippingFormValues>(stored);
  const [invalid, setInvalid] = useState<readonly ShippingFormField[]>([]);
  const [saved, setSaved] = useState(false);
  const mutation = useSaveShippingDetail(orderId);

  const failure = mutation.error === null ? null : classifyFulfillmentFailure(mutation.error);
  const feeRefused = failure !== null && isFeeAcknowledgementRefusal(failure);
  const storedFee = detail === null ? null : readOptionalText(detail.feeAmount);

  const change = useCallback(
    (field: ShippingFormField, value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
      setInvalid((current) => current.filter((entry) => entry !== field));
      setSaved(false);
      if (feeRefused && field === 'feeAmount') {
        mutation.reset();
        onBlockedChange(false);
      }
    },
    [feeRefused, mutation, onBlockedChange],
  );

  const restoreStoredFee = useCallback(() => {
    setValues((current) => ({ ...current, feeAmount: stored.feeAmount }));
    mutation.reset();
    onBlockedChange(false);
  }, [mutation, onBlockedChange, stored.feeAmount]);

  const submit = useCallback(() => {
    const errors = findShippingFieldErrors(values);
    if (errors.length > 0) {
      setInvalid(errors);
      return;
    }
    setInvalid([]);
    setSaved(false);
    mutation.mutate(toSaveShippingBody(values), {
      onSuccess: () => {
        setSaved(true);
        onBlockedChange(false);
      },
      onError: (error: unknown) => {
        onBlockedChange(isFeeAcknowledgementRefusal(classifyFulfillmentFailure(error)));
      },
    });
  }, [mutation, onBlockedChange, values]);

  const dirty = hasShippingChanges(values, stored);

  return (
    <>
      <section className="order-card" aria-labelledby="shipping-detail-heading">
        <div className="order-card__heading-row">
          <h2 className="order-card__title" id="shipping-detail-heading">
            {COPY.shipping.title}
          </h2>
          <AdminStatusBadge
            token={detail?.status ?? 'EDITABLE'}
            label={COPY.shipping.editableBadge}
            tone="info"
            symbol={STATUS_SYMBOLS.working}
            testId="shipping-status"
          />
        </div>
        <p className="order-card__help">{COPY.shipping.editableHelp}</p>

        <ShippingDetailFields
          values={values}
          invalid={invalid}
          disabled={mutation.isPending}
          onChange={change}
        />

        <p className="order-card__note">{COPY.shipping.requiredNote}</p>

        {invalid.length > 0 ? (
          <p className="order-fulfillment__refusal" role="alert" data-testid="shipping-invalid">
            {COPY.refusal.shippingIncomplete}
          </p>
        ) : null}
        {failure !== null && !feeRefused ? (
          <p className="order-fulfillment__refusal" role="alert" data-testid="shipping-save-error">
            {refusalSentence(failure)}
          </p>
        ) : null}
        {saved ? (
          <p className="order-fulfillment__saved" role="status" data-testid="shipping-saved">
            {COPY.shipping.saved}
          </p>
        ) : null}

        <div className="order-fulfillment__actions">
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--primary"
            data-testid="shipping-save"
            disabled={mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending ? COPY.shipping.saving : COPY.shipping.save}
          </button>
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--secondary"
            data-testid="shipping-reset"
            disabled={mutation.isPending || !dirty}
            onClick={() => {
              setValues(stored);
              setInvalid([]);
              setSaved(false);
              mutation.reset();
              onBlockedChange(false);
            }}
          >
            {COPY.shipping.reset}
          </button>
        </div>
      </section>

      <ShippingFeeCard
        storedFee={storedFee}
        currencyCode={currencyCode}
        increasing={isFeeIncrease(storedFee, values.feeAmount)}
      />

      {feeRefused ? (
        <ShippingFeeRefusalCard
          storedFee={storedFee}
          attemptedFee={values.feeAmount}
          currencyCode={currencyCode}
          onRestore={restoreStoredFee}
        />
      ) : null}
    </>
  );
}
