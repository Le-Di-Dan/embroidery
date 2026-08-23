'use client';

/**
 * The `/truy-cap/thanh-toan` controller (`APP7-S01` §4, §6, §19, §24, §28).
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
 * ## Attempt state exists only where the contract puts it
 *
 * `publicOrderDeposit_current` publishes **no attempt state** — order code,
 * order and obligation status, the frozen amount, the currency, the bank
 * instructions and the access expiry, and nothing else. The only operation that
 * answers with an attempt is `publicOrderDeposit_initiate`. So this controller
 * holds "the attempt this session opened" in its own state and never pretends to
 * have recovered one from the deposit read.
 *
 * It also does **not** initiate on mount. `APP7-B03` requires a recent step-up
 * for that call, so an automatic one would either fail or spend a verification
 * the customer never asked for — and §4 forbids opening an attempt merely
 * because a route mounted. The customer presses the button on `747:3`, and that
 * is the whole trigger.
 *
 * A reload therefore cannot recover an attempt. It cannot recover the secure
 * session either: the fragment was stripped before the first request and is not
 * readable twice, so a reload lands on the same unavailable state every APP4
 * landing does. There is consequently no "latest attempt" selection to invent
 * client-side, and nothing about a payment is written to storage.
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
 * A completed step-up is evidence, never payment. It opens an attempt; it settles
 * nothing.
 *
 * ## One request per activation, decided synchronously
 *
 * `inFlightRef` is a plain boolean flipped *before* `mutate()`, not a derived
 * `isPending`. Two activations in the same tick both observe the pre-render value
 * of `isPending`, so a check on that would let both through and open two
 * attempts; a ref written synchronously is the only guard that closes the
 * same-tick window.
 *
 * ## The single re-read
 *
 * Nothing here polls. The deposit is re-read exactly twice in the life of this
 * screen and both are explicit: the bootstrap's own `retry()` from the transient
 * card, and one reconciliation when an attempt comes back `SUCCEEDED` claiming
 * something the deposit read has not yet confirmed. Completion is detected by the
 * bootstrap's success counter rather than a pending flag — a flag reads false
 * both before a request starts and after it ends, and a fast response can be
 * batched so its `true` is never rendered at all.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  normalizeApiClientError,
  type CustomerDepositResponse,
  type DepositAttemptResponse,
} from '@embroidery/api-client';
import { useMutation } from '@tanstack/react-query';

import { newUploadIdempotencyKey } from '../../../shared/utils/upload-idempotency-key';
import { useSecureLinkBootstrap, type SecureLinkState } from '../../secure-link-access';
import { initiateDepositAttempt, readCurrentDeposit } from '../api/secure-deposit.client';
import {
  endsSecureSession,
  initiateFailureOf,
  type NoticeableInitiateFailure,
} from '../model/deposit-failure';
import {
  depositPanelOf,
  shouldReconcileDeposit,
  type DepositPanel,
} from '../model/deposit-payment-state';

/** What the screen is given, and everything the panels need beneath it. */
export interface SecureDeposit {
  readonly linkState: SecureLinkState<CustomerDepositResponse>;
  readonly retryLink: () => void;
  readonly retryingLink: boolean;
  /** The attempt this session opened, if the customer has opened one. */
  readonly attempt: DepositAttemptResponse | undefined;
  /** Which approved frame is on screen, once the link is authorized. */
  readonly panelOf: (deposit: CustomerDepositResponse) => DepositPanel;
  readonly initiating: boolean;
  readonly stepUpOpen: boolean;
  readonly initiateFailure: NoticeableInitiateFailure | undefined;
  /** Opens an attempt, or a **new** one from the terminal card. */
  readonly startAttempt: () => void;
  readonly stepUpVerified: () => void;
  readonly cancelStepUp: () => void;
  readonly dismissInitiateFailure: () => void;
  /**
   * Replaces the whole screen with the one indistinguishable unavailable card.
   *
   * Reached when a *later* call answers with the grant-is-gone refusal, which the
   * bootstrap cannot express because its own read succeeded. Handed to the
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

export function useSecureDeposit(): SecureDeposit {
  const bootstrap = useSecureLinkBootstrap<CustomerDepositResponse>(
    (secret) => readCurrentDeposit(secret),
    { retainCredentialAfterSuccess: true },
  );

  const [attempt, setAttempt] = useState<DepositAttemptResponse | undefined>(undefined);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [initiateFailure, setInitiateFailure] = useState<NoticeableInitiateFailure | undefined>(
    undefined,
  );

  /**
   * The key of the initiation currently being attempted.
   *
   * Minted once per customer action and mirrored out of state because a mutation
   * declared with no variables closes over whatever it captured at declaration.
   * A step-up in the middle of an action reuses it — that is still one action —
   * while pressing *start again* on the terminal card mints a new one, which is
   * what makes a retry a genuinely new attempt rather than a replay of a dead
   * one.
   */
  const idempotencyKeyRef = useRef('');
  const inFlightRef = useRef(false);

  /**
   * Set when the initiation answers with a refusal that ends the grant.
   *
   * The bootstrap's own state cannot express this — its read succeeded — so the
   * screen substitutes the identical unavailable state rather than inventing a
   * fourth access frame. Indistinguishable from a link that never opened, which
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
        initiateDepositAttempt(secret, idempotencyKeyRef.current),
      ),
    onSuccess: (opened: DepositAttemptResponse) => {
      // An attempt exists. Nothing about the deposit facts changed — the
      // obligation is still PENDING and the bank instructions are identical on
      // every read — so no re-read is issued here (§27).
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

  const startAttempt = useCallback(() => {
    if (inFlightRef.current) return;
    // A fresh key: this is a new customer action, and on the terminal card it is
    // deliberately a new *attempt* — a finished one is never returned to waiting.
    idempotencyKeyRef.current = newUploadIdempotencyKey();
    setAttempt(undefined);
    runInitiation();
  }, [runInitiation]);

  const stepUpVerified = useCallback(() => {
    // The same action, resumed with the same key, so a verification that arrived
    // after the server had already opened the attempt replays it rather than
    // opening a second one.
    runInitiation();
  }, [runInitiation]);

  const cancelStepUp = useCallback(() => {
    setStepUpOpen(false);
  }, []);

  const dismissInitiateFailure = useCallback(() => {
    setInitiateFailure(undefined);
  }, []);

  /**
   * The one reconciliation read.
   *
   * `SUCCEEDED` is the single attempt state that claims something the deposit
   * read has not confirmed, and `751:175` makes the *obligation* the authority
   * for that claim. So the deposit is read once more, through the bootstrap's own
   * retry, and the confirmation renders only if that read says so.
   *
   * Deliberately without a dependency array: `bootstrap` is a fresh object each
   * render, so any list would be a list of everything. The ref is the real guard,
   * and it makes every render in which no reconciliation is pending a no-op.
   */
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (attempt === undefined || reconciledRef.current) return;
    if (!shouldReconcileDeposit(attempt)) return;
    if (!bootstrap.hasCredential()) return;
    reconciledRef.current = true;
    bootstrap.retry();
  });

  const panelOf = useCallback(
    (deposit: CustomerDepositResponse) => depositPanelOf(deposit, attempt),
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
    dismissInitiateFailure,
    endSession,
    runWithSecret: bootstrap.runWithSecret,
  };
}
