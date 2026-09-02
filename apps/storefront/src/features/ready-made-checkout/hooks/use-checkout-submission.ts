'use client';

/**
 * The one write this route performs, and everything that keeps it to one order
 * (`APP12-S02` §20, §21, §26).
 *
 * ## The idempotency key is the verified challenge
 *
 * `APP12-B02` scopes idempotency by `challengeId` and fingerprints
 * `(skuId, quantity, delivery)` inside it. So:
 *
 * ```text
 * same semantic checkout, retried  → same challenge, same body → replayed order
 * double click                     → same challenge, same body → replayed order
 * material input changed           → different fingerprint     → refused, never a 2nd order
 * ```
 *
 * All three are *server* properties, which is the point: §21 says the disabled
 * button must not be what correctness rests on. It is still disabled, because a
 * customer should not be able to fire a second request the server will only have
 * to reconcile — but the guarantee is the contract's.
 *
 * ## What this hook adds on top
 *
 * Two things, and neither is a second idempotency authority.
 *
 * 1. **One in-flight submission.** `mutate()` is refused while the mutation is
 *    pending, so a double click, a repeated Enter and a form's implicit submit
 *    all collapse into the request already running.
 * 2. **A settled result belongs to the inputs that produced it.** The material
 *    fingerprint is captured with the attempt; if the customer edits the SKU,
 *    the quantity, the address or the verified contact afterwards, the retained
 *    outcome is dropped rather than shown beside inputs it was not about. A
 *    *success* is deliberately not droppable this way — the order exists, the
 *    form is gone, and there is nothing left to edit (§34).
 *
 * ## Nothing computed here is sent
 *
 * The body is a SKU id, a quantity, the challenge and the trimmed delivery
 * facts. No price, no subtotal, no total, no availability and no customer
 * identifier — the contract has no field for any of them, and the server
 * re-resolves the two that matter under the stock lock (§12, §14).
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import {
  normalizeApiClientError,
  type ReadyMadeOrderCreatedResponse,
} from '@embroidery/api-client';

import { createReadyMadeOrder } from '../api/ready-made-order.client';
import { checkoutFailureOf, type CheckoutFailure } from '../model/checkout-failure';
import {
  materialCheckoutFingerprint,
  toDeliveryBody,
  type DeliveryDraft,
} from '../model/delivery-draft';

export interface CheckoutSubmissionInput {
  readonly challengeId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly delivery: DeliveryDraft;
}

export type CheckoutSubmissionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'refused'; readonly failure: CheckoutFailure }
  | { readonly kind: 'created'; readonly order: ReadyMadeOrderCreatedResponse };

export interface CheckoutSubmission {
  readonly state: CheckoutSubmissionState;
  /**
   * Attempt the order. A no-op while one is in flight or already created, so a
   * caller cannot start a second one by calling twice.
   */
  readonly submit: (input: CheckoutSubmissionInput) => void;
  /**
   * Report what the form currently holds, so a refusal that no longer describes
   * it is cleared. Called on every render of the form; cheap and idempotent.
   */
  readonly reconcile: (input: CheckoutSubmissionInput) => void;
}

export function useCheckoutSubmission(): CheckoutSubmission {
  const [state, setState] = useState<CheckoutSubmissionState>({ kind: 'idle' });

  /**
   * The material inputs the current outcome belongs to.
   *
   * A ref rather than state: it is never rendered, and writing it during
   * `reconcile` must not schedule a render of its own.
   */
  const attemptedFingerprintRef = useRef<string | undefined>(undefined);
  /** Guards the in-flight window without waiting for a render (§21). */
  const inFlightRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (input: CheckoutSubmissionInput) =>
      createReadyMadeOrder({
        challengeId: input.challengeId,
        skuId: input.skuId,
        quantity: input.quantity,
        delivery: toDeliveryBody(input.delivery),
      }),
    onSuccess: (order) => {
      inFlightRef.current = false;
      setState({ kind: 'created', order });
    },
    onError: (error: unknown) => {
      inFlightRef.current = false;
      // The normalizer is the only thing that touches the transport error; the
      // raw Axios object, the server's own message and any field-error payload
      // stop here and never reach a rendered string (§27).
      setState({ kind: 'refused', failure: checkoutFailureOf(normalizeApiClientError(error)) });
    },
    // A silent retry is the one thing a create must never do: the server would
    // replay rather than duplicate, but the customer would be told nothing while
    // it happened. Every failure surfaces as a state with a stated action.
    retry: false,
    // Settled mutations are dropped rather than parked, so no cache snapshot
    // holds the delivery facts or the challenge id after the screen is done.
    gcTime: 0,
  });

  const submit = useCallback(
    (input: CheckoutSubmissionInput) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      attemptedFingerprintRef.current = materialCheckoutFingerprint({
        skuId: input.skuId,
        quantity: input.quantity,
        delivery: input.delivery,
        challengeId: input.challengeId,
      });
      setState({ kind: 'submitting' });
      mutation.mutate(input);
    },
    [mutation],
  );

  const reconcile = useCallback((input: CheckoutSubmissionInput) => {
    // A created order is permanent: the form is replaced by the confirmation and
    // there is nothing left that could disagree with it.
    if (inFlightRef.current) return;
    const current = materialCheckoutFingerprint({
      skuId: input.skuId,
      quantity: input.quantity,
      delivery: input.delivery,
      challengeId: input.challengeId,
    });
    if (attemptedFingerprintRef.current === undefined) return;
    if (attemptedFingerprintRef.current === current) return;
    attemptedFingerprintRef.current = undefined;
    setState((previous) => (previous.kind === 'refused' ? { kind: 'idle' } : previous));
  }, []);

  return { state, submit, reconcile };
}
