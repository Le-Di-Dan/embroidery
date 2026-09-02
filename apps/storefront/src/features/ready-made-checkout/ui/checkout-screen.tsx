'use client';

/**
 * `/mua-hang/[slug]` — the one screen, and the four states it can be in
 * (`APP12-D01` §H: *single page, no wizard*).
 *
 * ```text
 * selection refused → the invalid-selection card, and nothing else
 * created           → the confirmation, and the form is gone
 * otherwise         → the drawn checkout: contact + delivery | summary
 * with, when the server refused a submission, the refusal card above the action
 * ```
 *
 * ## The `<form>` wraps the delivery fields only, and the button joins it by id
 *
 * `Enter` in a delivery field and a press on `Đặt hàng` must raise the *same*
 * event, or §21's "one logical create" becomes two code paths that have to
 * agree. But the two cannot simply share an enclosing `<form>`: `APP4`'s
 * `ContactEntryCard` and `CodeEntryCard` are real forms of their own, and a
 * nested `<form>` is invalid HTML — the browser drops the inner one, which would
 * silently break the verification submit this screen depends on. (It does: React
 * warns, and the DOM keeps only the outer form.)
 *
 * So the order form encloses the delivery card, the summary's button sits in the
 * aside and is attached with the `form` attribute, and the `APP4` forms stay
 * siblings rather than descendants. One submit event, three well-formed forms,
 * and the tab order is still the source order.
 *
 * ## Where the order of operations matters
 *
 * `reconcile` runs during render, before anything is drawn, so a refusal that no
 * longer describes what the customer has typed is cleared in the same frame the
 * edit lands — never one frame later, beside inputs it was not about.
 *
 * `submit` validates first and posts second. A missing delivery field or an
 * unverified contact publishes a field-bound error and issues **no request**;
 * the server is not asked to be the presence check. What the server *is* asked
 * is everything that matters: the price, the stock, the challenge and the body's
 * own shape.
 */
import { useCallback, useId, useMemo, useState } from 'react';

import { useContactVerification } from '../../contact-verification';
import { useCheckoutSubmission } from '../hooks/use-checkout-submission';
import { useVerifiedContact } from '../hooks/use-verified-contact';
import {
  EMPTY_DELIVERY_DRAFT,
  hasDeliveryErrors,
  validateDelivery,
  type DeliveryDraft,
  type DeliveryErrors,
  type DeliveryField,
} from '../model/delivery-draft';
import { READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';
import type { ReadyMadeCheckoutView } from '../model/checkout-view';
import { CheckoutContactCard } from './checkout-contact-card';
import { CheckoutDeliveryCard } from './checkout-delivery-card';
import { CheckoutFailureCard, CheckoutInvalidSelectionCard } from './checkout-refusal-card';
import { CheckoutSuccessPanel } from './checkout-success-panel';
import { CheckoutSummaryCard } from './checkout-summary-card';

export interface CheckoutScreenProps {
  readonly view: ReadyMadeCheckoutView;
}

export function CheckoutScreen({ view }: CheckoutScreenProps) {
  /*
   * `SUBMISSION` is the purpose `APP12-B02` requires — its guard reads a
   * VERIFIED, unexpired challenge of that purpose and refuses any other. It is
   * also `useContactVerification`'s default, so this is a restatement of the
   * contract rather than a choice, written out because a silent default is the
   * wrong place for a rule an order depends on.
   */
  const verification = useContactVerification({ purpose: 'SUBMISSION' });
  const { verified, restart } = useVerifiedContact(verification);
  const submission = useCheckoutSubmission();
  /** Ties the aside's submit button to the delivery form — see the module note. */
  const formId = useId();

  const [draft, setDraft] = useState<DeliveryDraft>(EMPTY_DELIVERY_DRAFT);
  /** Empty until the customer asks to submit: errors on an untouched form are noise. */
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const [contactError, setContactError] = useState<string | undefined>(undefined);

  const selection = view.selection;
  const resolved = selection.kind === 'resolved' ? selection.selection : undefined;

  const onFieldChange = useCallback((field: DeliveryField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    // The field's own error clears as it is corrected, which is what makes the
    // error a statement about the field rather than about the last submit.
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const submissionInput = useMemo(
    () =>
      resolved === undefined
        ? undefined
        : {
            challengeId: verified?.challengeId ?? '',
            skuId: resolved.sku.skuId,
            quantity: resolved.quantity,
            delivery: draft,
          },
    [resolved, verified?.challengeId, draft],
  );

  // Render-time reconciliation — see the module note.
  if (submissionInput !== undefined) submission.reconcile(submissionInput);

  const onSubmit = useCallback(() => {
    if (submissionInput === undefined) return;
    const deliveryErrors = validateDelivery(draft);
    setErrors(deliveryErrors);
    const missingContact = verified === undefined;
    setContactError(
      missingContact ? READY_MADE_CHECKOUT_COPY.validation.contactUnverified : undefined,
    );
    if (hasDeliveryErrors(deliveryErrors) || missingContact) return;
    submission.submit(submissionInput);
  }, [draft, submission, submissionInput, verified]);

  if (selection.kind === 'refused') {
    return (
      <div className="ready-made-checkout">
        <h1 className="ready-made-checkout__title">{READY_MADE_CHECKOUT_COPY.pageTitle}</h1>
        <CheckoutInvalidSelectionCard slug={view.slug} />
      </div>
    );
  }

  if (submission.state.kind === 'created') {
    return (
      <div className="ready-made-checkout">
        <h1 className="ready-made-checkout__title">{READY_MADE_CHECKOUT_COPY.pageTitle}</h1>
        <CheckoutSuccessPanel slug={view.slug} order={submission.state.order} />
      </div>
    );
  }

  const submitting = submission.state.kind === 'submitting';

  return (
    <div className="ready-made-checkout">
      <h1 className="ready-made-checkout__title">{READY_MADE_CHECKOUT_COPY.pageTitle}</h1>
      <div className="ready-made-checkout__columns">
        <div className="ready-made-checkout__main">
          <CheckoutContactCard
            verification={verification}
            verified={verified !== undefined}
            onRestart={restart}
            {...(contactError === undefined ? {} : { error: contactError })}
          />
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <CheckoutDeliveryCard
              draft={draft}
              errors={errors}
              disabled={submitting}
              onChange={onFieldChange}
            />
          </form>
        </div>
        <aside className="ready-made-checkout__aside">
          {submission.state.kind === 'refused' ? (
            <CheckoutFailureCard slug={view.slug} failure={submission.state.failure} />
          ) : null}
          <CheckoutSummaryCard
            productName={view.name}
            {...(view.thumbnailUrl === undefined ? {} : { thumbnailUrl: view.thumbnailUrl })}
            selection={selection.selection}
            submitting={submitting}
            formId={formId}
          />
        </aside>
      </div>
    </div>
  );
}
