'use client';

/**
 * The live FULL obligation, and the one attempt this session may open
 * (`APP12-S03` §14, §15, §18, §19, §20, §24, §26, §27, §30).
 *
 * ## Two facts, from two authorities, never merged
 *
 * The **order** decides the lifecycle and comes from the session's own read.
 * The **obligation** decides the payable amount and comes from this hook. They
 * are kept apart because they can disagree for a moment — `APP12-B03`
 * recomposes an obligation while the order status does not move at all — and
 * merging them would make one of the two silently authoritative for something
 * it does not know.
 *
 * ## The read is enabled by the order state, and by nothing else (§14)
 *
 * `enabled` is `order.status === AWAITING_PAYMENT`. Before an operator sets the
 * shipping fee `APP12-B04` publishes no obligation, so the call would answer a
 * perfectly predictable `404` — and §14 forbids using a predictable 404 as a
 * page-control mechanism. The order projection already told us there is nothing
 * to fetch, so nothing is fetched: no FULL read, no QR, no initiation, no
 * evidence call is made in `AWAITING_SHIPPING_FEE`.
 *
 * ## The amount is read, never computed (§15, §16)
 *
 * `fullPaymentAmount` is the obligation's own figure and reaches the highlight,
 * the copy control, the QR's context and the attempt state as **one string**,
 * so the screen cannot disagree with itself. No file in this feature adds a
 * subtotal to a fee, subtracts a deposit, or multiplies a unit price.
 *
 * ## No initiation on mount (§19)
 *
 * `APP12-B04` requires a recent step-up for the initiation, so an automatic one
 * would either fail or spend a verification the customer never asked for — and
 * opening a payment attempt because a route mounted is not something a page may
 * do on a customer's behalf. The customer presses the control, and that is the
 * whole trigger.
 *
 * ## Step-up is asked for by the server, not assumed by the screen (§18)
 *
 * The control calls `initiate` first. If the policy wants fresh evidence the
 * server answers `403 REVERIFICATION_REQUIRED`, and only then does the step-up
 * dialog open — over this page, never as a navigation, because leaving would
 * unmount the only copy of the credential. When the code is accepted the *same*
 * initiation is retried with the *same* idempotency key: it is one customer
 * action that needed evidence half-way through, not two. Possession of the
 * `ORDER_ACCESS` link is deliberately not treated as sufficient to initiate.
 *
 * ## One request per activation, decided synchronously
 *
 * `inFlightRef` is a plain boolean flipped *before* `mutate()`, not a derived
 * `isPending`. Two activations in the same tick both observe the pre-render
 * value of `isPending`, so a check on that would let both through and open two
 * attempts; a ref written synchronously is the only guard that closes the
 * same-tick window. §19's "repeated interaction must not produce uncontrolled
 * attempt spam" depends on it, and so does §23: a hidden second attempt is
 * exactly what would orphan the evidence already bound to the first.
 *
 * ## Attempt state is held, never recovered (§20)
 *
 * `publicOrderFullPayment_current` publishes **no** attempt identity — order
 * code, order and obligation status, `payable`, the exact amount, the currency,
 * the bank instructions and the access expiry, and nothing else. The only
 * operation that answers with an attempt is the initiation. So this hook holds
 * "the attempt this session opened" in its own state and never pretends to have
 * recovered one: nothing infers an attempt from a payment status, invents a
 * hidden id, queries an Admin API, or persists an id to survive a reload the
 * credential could not survive anyway.
 *
 * ## A superseded obligation strands its attempt (§24)
 *
 * An operator may correct the shipping fee while the customer is on this page.
 * The obligation is recomposed, `fullPaymentAmount` changes, and the attempt
 * this session opened now belongs to a predecessor. {@link FullPayment.attempt}
 * therefore publishes the attempt **only while it matches the live
 * obligation**; the stale one is reported through `attemptSuperseded` so the
 * screen can say the amount moved, and it is never migrated onto the successor.
 * Because the evidence hook binds to the published attempt, evidence cannot
 * migrate either — it simply has no current attempt to attach to until the
 * customer opens one against the new figure.
 */
import { useCallback, useRef, useState } from 'react';

import {
  normalizeApiClientError,
  type CustomerFullPaymentResponse,
  type FullPaymentAttemptResponse,
  type ReadyMadeOrderAccessResponse,
} from '@embroidery/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newUploadIdempotencyKey } from '../../../shared/utils/upload-idempotency-key';
import {
  initiateFullPaymentAttempt,
  readCurrentFullPayment,
} from '../api/secure-ready-made-order.client';
import {
  endsSecureSession,
  initiateFailureOf,
  type NoticeableInitiateFailure,
} from '../model/order-access-failure';
import { ORDER_ACCESS_QUERY_KEYS } from '../model/order-access-query-keys';
import { attemptMatchesObligation, readsFullPayment } from '../model/order-access-state';

export interface FullPayment {
  /** The live obligation, once the order is in the state that has one. */
  readonly current: CustomerFullPaymentResponse | undefined;
  readonly loading: boolean;
  /** The attempt this session opened, **only while it is still current**. */
  readonly attempt: FullPaymentAttemptResponse | undefined;
  /** An attempt was opened, then a fee correction superseded its obligation. */
  readonly attemptSuperseded: boolean;
  readonly initiating: boolean;
  readonly stepUpOpen: boolean;
  readonly initiateFailure: NoticeableInitiateFailure | undefined;
  /** Opens an attempt. Refuses when the server's own `payable` is false. */
  readonly startAttempt: () => void;
  readonly stepUpVerified: () => void;
  readonly cancelStepUp: () => void;
}

export interface FullPaymentOptions {
  readonly order: ReadyMadeOrderAccessResponse;
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
  /** Called when a refusal says the grant itself is gone. */
  readonly onSessionEnded: () => void;
}

export function useFullPayment({
  order,
  runWithSecret,
  onSessionEnded,
}: FullPaymentOptions): FullPayment {
  const queryClient = useQueryClient();
  const enabled = readsFullPayment(order);

  const query = useQuery({
    queryKey: ORDER_ACCESS_QUERY_KEYS.fullPayment(),
    queryFn: () => runWithSecret((secret) => readCurrentFullPayment(secret)),
    enabled,
  });

  const [attempt, setAttempt] = useState<FullPaymentAttemptResponse | undefined>(undefined);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [initiateFailure, setInitiateFailure] = useState<NoticeableInitiateFailure | undefined>(
    undefined,
  );

  /**
   * The key of the initiation currently being attempted.
   *
   * Minted once per customer action and mirrored out of state because a
   * mutation declared with no variables closes over whatever it captured at
   * declaration. A step-up in the middle of an action reuses it — that is still
   * one action.
   */
  const idempotencyKeyRef = useRef('');
  const inFlightRef = useRef(false);

  const current = query.data;

  const initiate = useMutation({
    // No variables: the credential is reached through `runWithSecret` and the
    // key is read from a ref, so nothing TanStack retains after settlement can
    // contain either.
    mutationFn: () =>
      runWithSecret((secret) => initiateFullPaymentAttempt(secret, idempotencyKeyRef.current)),
    onSuccess: (opened: FullPaymentAttemptResponse) => {
      // An attempt exists. Nothing about the obligation changed — it is still
      // PENDING and the bank instructions are identical on every read — so no
      // re-read is issued here. The attempt is an intention to transfer and the
      // maximum state it can carry is PENDING (§27).
      setStepUpOpen(false);
      setInitiateFailure(undefined);
      setAttempt(opened);
    },
    onError: (error: unknown) => {
      const failure = initiateFailureOf(normalizeApiClientError(error));
      if (endsSecureSession(failure)) {
        onSessionEnded();
        return;
      }
      if (failure === 'REVERIFICATION_REQUIRED') {
        // Evidence is missing, not consent. The action is suspended inside this
        // same mounted session and resumes with the same key.
        setStepUpOpen(true);
        return;
      }
      if (failure === 'FULL_PAYMENT_NOT_PAYABLE') {
        // The server's answer moved under us — most often a fee correction or a
        // verification that landed while the page was open. Re-read the
        // obligation so the amount on screen becomes the one now owed, rather
        // than leaving a stale figure beside a refusal (§24, §26).
        void queryClient.invalidateQueries({ queryKey: ORDER_ACCESS_QUERY_KEYS.fullPayment() });
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

  const startAttempt = useCallback(() => {
    if (inFlightRef.current) return;
    // §18 and §19: never initiate against an obligation the server has already
    // said is not collectable. `payable` is the field that carries that answer —
    // derived server-side from both the order state and the obligation state —
    // and not the order status beside it. The server checks it again regardless;
    // this only keeps the screen from offering a control it would refuse.
    if (current?.payable !== true) return;
    idempotencyKeyRef.current = newUploadIdempotencyKey();
    runInitiation();
  }, [current, runInitiation]);

  const stepUpVerified = useCallback(() => {
    // The same action, resumed with the same key, so a verification that arrived
    // after the server had already opened the attempt replays it rather than
    // opening a second one.
    runInitiation();
  }, [runInitiation]);

  const cancelStepUp = useCallback(() => setStepUpOpen(false), []);

  // §24 — the stale-attempt gate. An attempt is published only while its exact
  // amount still matches the live obligation's; a superseded one is withheld
  // from every consumer at once, which is what stops the QR, the instructions
  // and the evidence intake from disagreeing about which obligation is being
  // paid. String equality, never a parsed comparison.
  const attemptIsCurrent =
    attempt !== undefined && current !== undefined && attemptMatchesObligation(attempt, current);

  return {
    current,
    loading: enabled && query.isPending,
    attempt: attemptIsCurrent ? attempt : undefined,
    attemptSuperseded: attempt !== undefined && current !== undefined && !attemptIsCurrent,
    initiating: initiate.isPending,
    stepUpOpen,
    initiateFailure,
    startAttempt,
    stepUpVerified,
    cancelStepUp,
  };
}
