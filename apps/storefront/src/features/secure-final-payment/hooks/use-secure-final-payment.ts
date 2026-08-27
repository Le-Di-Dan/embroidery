'use client';

/**
 * The `/truy-cap/thanh-toan-con-lai` controller (`APP9-S01` §5, §6, §7, §10,
 * §13, §19, §20).
 *
 * It composes two things and owns the rules that connect them:
 *
 * - `useSecureLinkBootstrap`, which performs the locked capture → strip → body
 *   sequence and then **keeps** the credential, because this route spends it
 *   again — on the initiation, on the QR and on every evidence call;
 * - one initiation, which is the only write a customer can make here that
 *   touches payment at all, and whose maximum effect is one attempt at
 *   `PENDING`.
 *
 * No new grant scope, session type or token carrier is introduced: this is
 * APP4's `REQUEST_ACCESS` grant and APP4's fragment, reused exactly as the
 * deposit lane reuses them.
 *
 * ## Attempt state exists only where the contract puts it
 *
 * `publicOrderFinalPayment_current` publishes **no attempt state** — order code,
 * order and obligation status, `payable`, the frozen amount, the currency, the
 * bank instructions and the access expiry, and nothing else. The only operation
 * that answers with an attempt is `publicOrderFinalPayment_initiate`. So this
 * controller holds "the attempt this session opened" in its own state and never
 * pretends to have recovered one from the read.
 *
 * That is also the whole reason `APP9-D01` collapses *hướng dẫn đã mở* and
 * *đang chờ xác nhận* into one customer state (`820:44`): the projection cannot
 * tell them apart, so neither may the screen.
 *
 * It does **not** initiate on mount. `APP9-B02` requires a recent step-up for
 * that call, so an automatic one would either fail or spend a verification the
 * customer never asked for — and opening a payment attempt because a route
 * mounted is not something a page may do on a customer's behalf. The customer
 * presses the button on `816:264`, and that is the whole trigger.
 *
 * A reload therefore cannot recover an attempt. It cannot recover the secure
 * session either: the fragment was stripped before the first request and is not
 * readable twice, so a reload lands on the same unavailable state every APP4
 * landing does. Nothing about a payment is written to storage.
 *
 * ## The payable gate is the server's, and it is checked twice
 *
 * `startAttempt` refuses to fire when the last read said the balance is not
 * payable. That is not a substitute for the server's own check — `APP9-B02`
 * answers `409 FINAL_PAYMENT_NOT_PAYABLE` regardless — but §7 and §10 both
 * forbid *initiating* from a screen the server would refuse, and the cheapest
 * way to guarantee that is to make the guard part of the action rather than part
 * of the rendering.
 *
 * ## Step-up is asked for by the server, not assumed by the screen
 *
 * The button calls `initiate` first. If GRD-003 wants fresh evidence the server
 * answers `403 REVERIFICATION_REQUIRED`, and only then does the step-up dialog
 * open — over this page, never as a navigation, because leaving would unmount
 * the only copy of the credential. When the code is accepted, the *same*
 * initiation is retried with the *same* idempotency key: it is one customer
 * action that needed evidence half-way through, not two.
 *
 * A completed step-up is evidence, never payment. It opens an attempt; it
 * settles nothing.
 *
 * ## One request per activation, decided synchronously
 *
 * `inFlightRef` is a plain boolean flipped *before* `mutate()`, not a derived
 * `isPending`. Two activations in the same tick both observe the pre-render
 * value of `isPending`, so a check on that would let both through and open two
 * attempts; a ref written synchronously is the only guard that closes the
 * same-tick window. §12 also depends on it: a hidden second attempt is exactly
 * what would orphan the evidence already bound to the first.
 *
 * ## Refresh
 *
 * Nothing here polls. §20 forbids a "waiting for the bank" loop outright, and it
 * would be dishonest anyway — Admin verification is manual and may happen hours
 * later. The balance is re-read exactly twice in the life of this screen and
 * both are explicit: the bootstrap's own `retry()` from the transient card, and
 * one reconciliation when an attempt comes back claiming something the read has
 * not yet confirmed.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  FinalPaymentAttemptResponseStatus,
  normalizeApiClientError,
  type CustomerFinalPaymentResponse,
  type FinalPaymentAttemptResponse,
} from '@embroidery/api-client';
import { useMutation } from '@tanstack/react-query';

import { newUploadIdempotencyKey } from '../../../shared/utils/upload-idempotency-key';
import { useSecureLinkBootstrap, type SecureLinkState } from '../../secure-link-access';
import {
  initiateFinalPaymentAttempt,
  readCurrentFinalPayment,
} from '../api/secure-final-payment.client';
import {
  endsSecureSession,
  initiateFailureOf,
  type NoticeableInitiateFailure,
} from '../model/final-payment-failure';
import { finalPaymentPanelOf, type FinalPaymentPanel } from '../model/final-payment-state';

/** What the screen is given, and everything the panels need beneath it. */
export interface SecureFinalPayment {
  readonly linkState: SecureLinkState<CustomerFinalPaymentResponse>;
  readonly retryLink: () => void;
  readonly retryingLink: boolean;
  /** The attempt this session opened, if the customer has opened one. */
  readonly attempt: FinalPaymentAttemptResponse | undefined;
  /** Which approved frame is on screen, once the link is authorized. */
  readonly panelOf: (payment: CustomerFinalPaymentResponse) => FinalPaymentPanel;
  readonly initiating: boolean;
  readonly stepUpOpen: boolean;
  readonly initiateFailure: NoticeableInitiateFailure | undefined;
  /** Opens an attempt. Refuses when the last read said the balance is not payable. */
  readonly startAttempt: (payment: CustomerFinalPaymentResponse) => void;
  readonly stepUpVerified: () => void;
  readonly cancelStepUp: () => void;
  /**
   * Replaces the whole screen with the one indistinguishable unavailable card.
   *
   * Reached when a *later* call answers with the grant-is-gone refusal, which
   * the bootstrap cannot express because its own read succeeded. Handed to the
   * evidence hook so an upload that meets it ends the session exactly as an
   * initiation would, rather than reporting a link failure as an image problem.
   */
  readonly endSession: () => void;
  /**
   * Spends the retained credential on one further call.
   *
   * Handed to the QR and evidence hooks so they never hold the secret
   * themselves: it is passed to the request function on the stack and is never
   * returned, stored or logged.
   */
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
}

/**
 * Whether this attempt state obliges exactly one re-read of the balance.
 *
 * Only `SUCCEEDED`, and only once. It is the single state in which the attempt
 * claims something the read has not yet confirmed, so the honest move is to ask
 * the authority rather than to promote the claim — the obligation and the order
 * decide whether the balance is settled, never an attempt this session happens
 * to be holding. Every other value is already consistent with the facts in hand,
 * and re-reading on them would be the beginning of the polling §20 forbids.
 */
function shouldReconcile(attempt: FinalPaymentAttemptResponse): boolean {
  return attempt.status === FinalPaymentAttemptResponseStatus.SUCCEEDED;
}

export function useSecureFinalPayment(): SecureFinalPayment {
  const bootstrap = useSecureLinkBootstrap<CustomerFinalPaymentResponse>(
    (secret) => readCurrentFinalPayment(secret),
    { retainCredentialAfterSuccess: true },
  );

  const [attempt, setAttempt] = useState<FinalPaymentAttemptResponse | undefined>(undefined);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [initiateFailure, setInitiateFailure] = useState<NoticeableInitiateFailure | undefined>(
    undefined,
  );

  /**
   * The key of the initiation currently being attempted.
   *
   * Minted once per customer action and mirrored out of state because a mutation
   * declared with no variables closes over whatever it captured at declaration.
   * A step-up in the middle of an action reuses it — that is still one action.
   */
  const idempotencyKeyRef = useRef('');
  const inFlightRef = useRef(false);

  /**
   * Set when the initiation answers with a refusal that ends the grant.
   *
   * The bootstrap's own state cannot express this — its read succeeded — so the
   * screen substitutes the identical unavailable state rather than inventing a
   * fifth access frame. Indistinguishable from a link that never opened, which
   * is the point.
   */
  const sessionEndedRef = useRef(false);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  const endSession = useCallback(() => {
    sessionEndedRef.current = true;
    bootstrap.clearCredential();
    forceRender();
  }, [bootstrap]);

  const initiate = useMutation({
    // No variables: the credential is reached through `runWithSecret` and the key
    // is read from a ref, so nothing TanStack retains after settlement can
    // contain either.
    mutationFn: () =>
      bootstrap.runWithSecret((secret) =>
        initiateFinalPaymentAttempt(secret, idempotencyKeyRef.current),
      ),
    onSuccess: (opened: FinalPaymentAttemptResponse) => {
      // An attempt exists. Nothing about the balance changed — the obligation is
      // still PENDING and the bank instructions are identical on every read — so
      // no re-read is issued here.
      setStepUpOpen(false);
      setInitiateFailure(undefined);
      setAttempt(opened);
    },
    onError: (error: unknown) => {
      const failure = initiateFailureOf(normalizeApiClientError(error));
      if (endsSecureSession(failure)) {
        endSession();
        return;
      }
      if (failure === 'REVERIFICATION_REQUIRED') {
        // Evidence is missing, not consent. The action is suspended inside this
        // same mounted session and resumes with the same key.
        setStepUpOpen(true);
        return;
      }
      setInitiateFailure(failure);
    },
    onSettled: () => {
      inFlightRef.current = false;
      initiate.reset();
    },
    retry: false,
  });

  const runInitiation = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInitiateFailure(undefined);
    initiate.mutate();
  }, [initiate]);

  const startAttempt = useCallback(
    (payment: CustomerFinalPaymentResponse) => {
      if (inFlightRef.current) return;
      // §7 and §10: never initiate against a balance the server has already said
      // is not collectable. The read is the authority for that, and `payable` is
      // the field that carries it — not the order status beside it.
      if (!payment.payable) return;
      idempotencyKeyRef.current = newUploadIdempotencyKey();
      runInitiation();
    },
    [runInitiation],
  );

  const stepUpVerified = useCallback(() => {
    // The same action, resumed with the same key, so a verification that arrived
    // after the server had already opened the attempt replays it rather than
    // opening a second one.
    runInitiation();
  }, [runInitiation]);

  const cancelStepUp = useCallback(() => {
    setStepUpOpen(false);
  }, []);

  /**
   * The one reconciliation read.
   *
   * Deliberately without a dependency array: `bootstrap` is a fresh object each
   * render, so any list would be a list of everything. The ref is the real
   * guard, and it makes every render in which no reconciliation is pending a
   * no-op.
   */
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (attempt === undefined || reconciledRef.current) return;
    if (!shouldReconcile(attempt)) return;
    if (!bootstrap.hasCredential()) return;
    reconciledRef.current = true;
    bootstrap.retry();
  });

  const panelOf = useCallback(
    (payment: CustomerFinalPaymentResponse) => finalPaymentPanelOf(payment, attempt),
    [attempt],
  );

  return {
    linkState: sessionEndedRef.current ? { status: 'UNAVAILABLE' } : bootstrap.state,
    retryLink: bootstrap.retry,
    retryingLink: bootstrap.retrying,
    attempt,
    panelOf,
    initiating: initiate.isPending,
    stepUpOpen,
    initiateFailure,
    startAttempt,
    stepUpVerified,
    cancelStepUp,
    endSession,
    runWithSecret: bootstrap.runWithSecret,
  };
}
