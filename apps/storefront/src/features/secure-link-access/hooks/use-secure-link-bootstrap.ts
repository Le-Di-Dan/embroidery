'use client';

/**
 * The secure-link landing controller (`APP4-S02` §5, §7, §8, §10).
 *
 * ## The load-bearing invariant
 *
 * ```text
 * capture #t=  →  history.replaceState  →  clean URL  →  POST the secret in a body
 * ```
 *
 * That order is not arranged by effect scheduling, a `useLayoutEffect`, a
 * `setTimeout` or a promise chain — every one of those makes the ordering a
 * property of the runtime that a future edit could silently reorder. It is
 * three statements in one synchronous block inside the bootstrap effect: the
 * fragment is read, `stripSecureLinkFragment` returns, and only then is
 * `resolve.mutate()` reached. `replaceState` is synchronous, so the address bar
 * is already clean before the mutation function is ever invoked, let alone
 * before Axios opens a socket. The browser proof asserts exactly that by
 * sampling `location.hash` at the moment the request is observed.
 *
 * The strip runs for a **malformed** fragment too, before that path returns.
 *
 * ## One call, and why the caller supplies it
 *
 * This hook owns *when* the credential is used and *how long* it lives; it does
 * not own *what it is spent on*. The consumer passes one function, and exactly
 * one request is made with it.
 *
 * That is what makes `APP5-S02`'s architecture expressible without a second
 * copy of this file. `APP5-B03` already runs the entire APP4 authorization
 * chain internally — policy, secure-link rate limiter, secure-link resolution,
 * the exact request the grant names, then the customer-safe projection — so the
 * `/truy-cap` landing passes B03 and resolves the link and reads the request in
 * one round trip. Chaining `publicSecureLinkResolve` in front of it would
 * authorize the same credential twice, spend the same abuse budget twice, and
 * hold the raw secret across two flights to learn nothing the second call does
 * not already return.
 *
 * ## Why a ref, and why it survives a transient failure
 *
 * The credential lives in a ref owned by this hook and nowhere else. A ref
 * rather than reducer state because reducer state is a value React keeps,
 * snapshots and hands to devtools, and this must be none of those. The mutation
 * is declared with **no variables** — `mutate()` takes no argument and the
 * secret is read from the ref inside `mutationFn` — so TanStack's retained
 * `mutation.variables` is permanently `undefined` rather than a copy of the
 * credential parked in the mutation cache. `reset()` on settlement drops the
 * mutation entry as well.
 *
 * It is cleared on success, on a definitive refusal, on a missing-or-malformed
 * fragment, and on unmount — except that a consumer may ask, through
 * {@link SecureLinkBootstrapOptions}, to keep it past a *successful* read. Only
 * `APP6-S01` does: the same grant authorises the customer's later accept or
 * reject, the fragment is already gone, and persisting it is forbidden, so the
 * ref is the only place it can live. Every other clearing rule is unchanged for
 * that consumer, and it clears the credential itself the moment its decision
 * settles. It is deliberately **kept** across a transient
 * failure, and only that one: a network error carries no verdict about the
 * link, the fragment is gone and cannot be read twice, so destroying it there
 * would convert a flaky connection into a permanently dead link. It stays in
 * the same ephemeral ref — not storage, not the URL, not the cache — and dies
 * with the component (§8).
 *
 * A reload after the strip therefore cannot recover the credential, and falls
 * into the same unavailable state as a visit with no fragment. That is the
 * intended behaviour, not a gap.
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, type Reducer } from 'react';

import { normalizeApiClientError } from '@embroidery/api-client';

import { readSecureLinkToken, stripSecureLinkFragment } from '../model/secure-link-fragment';
import {
  initialSecureLinkState,
  secureLinkOutcomeOf,
  secureLinkReducer,
  type SecureLinkAction,
  type SecureLinkState,
} from '../model/secure-link-state';

export interface SecureLinkBootstrap<TPayload> {
  readonly state: SecureLinkState<TPayload>;
  /**
   * Runs the resolve call again with the credential already held.
   *
   * Explicit user action or an explicit reconciliation only. There is no
   * automatic retry anywhere (§15), and this fires nothing on its own: it is a
   * function a caller invokes, guarded by the credential itself so it can never
   * run with an empty one.
   */
  readonly retry: () => void;
  readonly retrying: boolean;
  /**
   * How many times the resolve call has succeeded on this mount.
   *
   * Starts at 0 and increases by one per successful read. A consumer that must
   * know when a *re-read* has finished — `APP6-S01` compares the version it
   * gets back against the one the customer chose — needs a signal that is
   * unambiguous in a single render pass. A pending flag is not: it reads false
   * both before the request starts and after it ends, and a fast response can
   * be batched so that `true` is never rendered at all. A counter can only go
   * up, and it goes up exactly once per completed read.
   */
  readonly resolveCount: number;
  /**
   * Spends the retained credential on one further call.
   *
   * Present only for a consumer that asked to retain it. The secret is handed
   * to `spend` as an argument and is never returned, stored or logged here; a
   * consumer that has no credential (never had one, or dropped it) gets
   * {@link NO_SECURE_CREDENTIAL} rather than a request with an empty token.
   */
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
  /** Destroys the credential. Idempotent, and irreversible for this mount. */
  readonly clearCredential: () => void;
  /** Whether a credential is still held. Never the credential itself. */
  readonly hasCredential: () => boolean;
}

/**
 * Options for a landing whose credential outlives its first call.
 *
 * `APP4-S02` and `APP5-S02` are read-only: the customer arrives, one call is
 * made, and the credential has no further use the moment it settles. `APP6-S01`
 * is not — the same grant authorises the customer's later accept or reject, the
 * fragment is already gone, and nothing may persist it. So the credential must
 * survive a successful read, in the same ephemeral ref and nowhere else.
 *
 * Off by default, deliberately. Retention is the exceptional posture and the
 * screens that do not need it must not acquire it by inheritance.
 */
export interface SecureLinkBootstrapOptions {
  /**
   * Keeps the credential in the ref after the resolve call succeeds.
   *
   * Every other lifetime rule is unchanged: it still dies on a definitive
   * refusal, on a missing or malformed fragment and on unmount, and it is still
   * never written anywhere a snapshot could reach.
   */
  readonly retainCredentialAfterSuccess?: boolean;
}

/**
 * Raised when a caller tries to spend a credential this mount no longer holds.
 *
 * A thrown error rather than a silent no-op: the call sites are decisions the
 * customer explicitly took, and one that quietly does nothing would leave a
 * button that appears to work.
 */
export const NO_SECURE_CREDENTIAL = 'NO_SECURE_CREDENTIAL';

/**
 * Runs the one authorized call a secure-link landing is allowed to make.
 *
 * `resolveWithSecret` receives the credential as an argument and must place it
 * in a request **body**. It is called at most once per bootstrap and once more
 * per explicit retry.
 */
export function useSecureLinkBootstrap<TPayload>(
  resolveWithSecret: (secret: string) => Promise<TPayload>,
  options?: SecureLinkBootstrapOptions,
): SecureLinkBootstrap<TPayload> {
  const retainAfterSuccess = options?.retainCredentialAfterSuccess === true;
  const [state, dispatch] = useReducer(
    secureLinkReducer as Reducer<SecureLinkState<TPayload>, SecureLinkAction<TPayload>>,
    initialSecureLinkState,
  );

  /** The credential, for exactly as long as a request may still need it. */
  const tokenRef = useRef('');
  const clearToken = useCallback(() => {
    tokenRef.current = '';
  }, []);

  /**
   * The call, held in a ref so the effect below does not depend on the
   * caller's function identity. A consumer that passes an inline arrow would
   * otherwise hand this hook a new function every render; the bootstrap guard
   * already makes that harmless, and this keeps it harmless for the retry path
   * too without asking every consumer to remember `useCallback`.
   */
  const resolveRef = useRef(resolveWithSecret);
  resolveRef.current = resolveWithSecret;

  /**
   * Bootstrap runs once.
   *
   * Without this guard React's development double-invocation would run the
   * effect a second time, find the fragment already stripped, and render the
   * unavailable state over a link that was perfectly valid — a bug that appears
   * only in development and only for real customers of the dev build.
   */
  const bootstrappedRef = useRef(false);

  /** Incremented in `onSuccess`, so it is already current when React re-renders. */
  const resolveCountRef = useRef(0);

  const resolve = useMutation({
    // No variables: the credential is read from the ref, so nothing TanStack
    // retains after settlement can contain it.
    mutationFn: () => resolveRef.current(tokenRef.current),
    onSuccess: (payload: TPayload) => {
      // A verdict exists and it is favourable. For a read-only landing the
      // credential has no further use and dies here; for a landing that will
      // spend it again on the customer's own explicit decision it stays in the
      // same ref it has been in since bootstrap — never in storage, the URL,
      // history state or the cache.
      if (!retainAfterSuccess) clearToken();
      resolveCountRef.current += 1;
      dispatch({ type: 'RESOLVED', payload });
    },
    onError: (error: unknown) => {
      const outcome = secureLinkOutcomeOf(normalizeApiClientError(error));
      if (outcome === 'TRANSIENT') {
        // No verdict was reached, so the credential is kept for a manual retry.
        dispatch({ type: 'TRANSIENT_FAILURE' });
        return;
      }
      clearToken();
      dispatch({ type: 'UNAVAILABLE' });
    },
    onSettled: () => {
      // `variables` is already undefined; this drops the mutation entry — and
      // with it any retained error metadata — from the cache entirely.
      resolve.reset();
    },
    retry: false,
  });

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    // 1 — capture, into a local const that never leaves this block.
    const token = readSecureLinkToken(window.location.hash);

    // 2 — strip, unconditionally and synchronously. Nothing below this line can
    //     observe the fragment, because there is no longer one to observe.
    stripSecureLinkFragment(window.history, window.location);

    // 3 — and only now, a request. A missing or malformed fragment makes none
    //     at all: there is nothing to ask, and asking would make fragment
    //     syntax answerable (§14).
    if (token === undefined) {
      dispatch({ type: 'UNAVAILABLE' });
      return;
    }
    tokenRef.current = token;
    resolve.mutate();
    // `resolve` is an honest dependency rather than a suppressed one. It gives
    // the effect a new identity on every render, and `bootstrappedRef` is what
    // makes every run after the first a no-op — which is the guard that has to
    // exist anyway for React's development double-invocation. Suppressing the
    // dependency instead would hide the re-entrancy rather than handle it.
  }, [resolve]);

  // Unmount is an exit like any other; the customer has left the flow.
  useEffect(() => clearToken, [clearToken]);

  const retry = useCallback(() => {
    // Only reachable from the transient-error screen, which is the only state
    // that still holds a credential. The guard is the credential itself rather
    // than the status, so a retry can never fire with an empty one.
    if (tokenRef.current === '') return;
    resolve.mutate();
  }, [resolve]);

  /**
   * The one way a retained credential is reachable, and it never returns it.
   *
   * The secret is passed into `spend` and the promise resolves with whatever
   * that call produced, so the credential's only appearance outside this hook
   * is as an argument on the stack of the request that needs it.
   */
  const runWithSecret = useCallback(
    <TResult>(spend: (secret: string) => Promise<TResult>): Promise<TResult> => {
      if (tokenRef.current === '') return Promise.reject(new Error(NO_SECURE_CREDENTIAL));
      return spend(tokenRef.current);
    },
    [],
  );

  const hasCredential = useCallback(() => tokenRef.current !== '', []);

  return {
    state,
    retry,
    retrying: resolve.isPending,
    resolveCount: resolveCountRef.current,
    runWithSecret,
    clearCredential: clearToken,
    hasCredential,
  };
}
