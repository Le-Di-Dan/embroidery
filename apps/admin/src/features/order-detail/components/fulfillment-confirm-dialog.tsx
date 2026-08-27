'use client';

import { useId, type ReactNode } from 'react';

import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import {
  classifyFulfillmentFailure,
  isFeeAcknowledgementRefusal,
  type FulfillmentFailure,
} from '../model/fulfillment-failure';
import { PaymentDialog } from './payment-dialog';

interface FulfillmentConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly testId: string;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  /**
   * This command's own wording for `ORDER_INVALID_TRANSITION`.
   *
   * All three commands are refused with that one code for what the catalog
   * writes up as three separate rows — a refused `TR-LC14-05` (`820:60`), a
   * dispatch replay (`820:90`) and a completion attempted before delivery
   * (`820:95`). The server cannot tell them apart for us and the code is the
   * same, but the *caller* knows which command it sent, so the sentence is
   * chosen here rather than guessed at in the classifier.
   */
  readonly staleSentence?: string;
  /** The approved effect block — what will be true after this commits. */
  readonly children?: ReactNode;
}

/**
 * The confirmation shell the three APP9 lifecycle commands share (`809:95`,
 * `814:4`, `815:89`).
 *
 * One component rather than three, because the three dialogs differ only in
 * their words and their effect block: each states what will be true after the
 * command commits, names the one operation behind it, and offers exactly one
 * way forward and one way out. Building them separately would have meant three
 * copies of the same refusal handling — and the refusal handling is the part
 * that has to be right.
 *
 * ## A refusal is rendered here and the dialog stays open
 *
 * `820:60`, `820:90` and `820:95` all say the same thing: the refusal belongs in
 * the dialog, not on a page of its own, and the screen must not silently succeed
 * a second time or retry by itself. So a failed confirm leaves the dialog
 * standing with an `alert` beside the button, and the operator decides. The one
 * refusal that never appears here is the fee-acknowledgement one, which belongs
 * to the shipping editor's own card (`812:197`) and cannot be produced by any of
 * these three commands anyway.
 *
 * ## The confirm button is disabled only while the command is in flight
 *
 * Never on a client-side judgement about whether the server would accept it.
 * Every one of these commands re-proves its own preconditions inside its
 * transaction, and a screen that pre-refused would be a second lifecycle
 * authority — one that could be wrong in the direction of blocking real work.
 */
export function FulfillmentConfirmDialog({
  title,
  body,
  confirmLabel,
  pendingLabel,
  testId,
  pending,
  error,
  onConfirm,
  onDismiss,
  staleSentence,
  children,
}: FulfillmentConfirmDialogProps) {
  const bodyId = useId();
  const failure: FulfillmentFailure | null =
    error === null || error === undefined ? null : classifyFulfillmentFailure(error);

  return (
    <PaymentDialog
      title={title}
      describedBy={bodyId}
      testId={testId}
      onDismiss={pending ? () => undefined : onDismiss}
    >
      <p className="payment-dialog__body" id={bodyId}>
        {body}
      </p>
      {children}
      {failure !== null && !isFeeAcknowledgementRefusal(failure) ? (
        <p className="order-fulfillment__refusal" role="alert" data-testid={`${testId}-error`}>
          {failure === 'stale' && staleSentence !== undefined
            ? staleSentence
            : refusalSentence(failure)}
        </p>
      ) : null}
      <div className="payment-dialog__actions">
        <button
          type="button"
          className="order-fulfillment__button order-fulfillment__button--secondary"
          data-testid={`${testId}-cancel`}
          disabled={pending}
          onClick={onDismiss}
        >
          {COPY.dispatch.cancel}
        </button>
        <button
          type="button"
          className="order-fulfillment__button order-fulfillment__button--primary"
          data-testid={`${testId}-confirm`}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </PaymentDialog>
  );
}

/**
 * The one approved sentence for a classified refusal.
 *
 * A `Record` lookup rather than a chain of conditionals, so a classification
 * added later without a sentence is a compile error instead of a blank alert.
 */
const REFUSAL_SENTENCE: Readonly<Record<FulfillmentFailure, string>> = {
  stale: COPY.refusal.transitionStale,
  'shipping-missing': COPY.refusal.shippingMissing,
  'shipping-incomplete': COPY.refusal.shippingIncomplete,
  'shipping-frozen': COPY.refusal.shippingFrozen,
  'fee-acknowledgement-required': COPY.feeRefusal.body,
  'fee-change-unavailable': COPY.refusal.feeChangeUnavailable,
  'fee-not-applicable': COPY.refusal.feeNotApplicable,
  'remaining-missing': COPY.refusal.remainingMissing,
  'payment-guard': COPY.refusal.dispatchPaymentGuard,
  'shipping-not-ready': COPY.refusal.dispatchShippingNotReady,
  'not-found': COPY.refusal.notFound,
  unauthenticated: COPY.refusal.unauthenticated,
  unknown: COPY.refusal.generic,
  generic: COPY.refusal.generic,
};

export function refusalSentence(failure: FulfillmentFailure): string {
  return REFUSAL_SENTENCE[failure];
}
