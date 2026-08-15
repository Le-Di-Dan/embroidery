'use client';

/**
 * The `/truy-cap` bootstrap controller (`APP4-S02` §5, §7, §8, §10).
 *
 * ## The load-bearing invariant
 *
 * ```text
 * capture #t=  →  history.replaceState  →  clean URL  →  POST token in body
 * ```
 *
 * That order is not arranged by effect scheduling, a `useLayoutEffect`, a
 * `setTimeout` or a promise chain — every one of those makes the ordering a
 * property of the runtime that a future edit could silently reorder. It is
 * three statements in one synchronous block inside {@link bootstrap}: the
 * fragment is read, `stripSecureLinkFragment` returns, and only then is
 * `resolve.mutate()` reached. `replaceState` is synchronous, so the address bar
 * is already clean before the mutation function is ever invoked, let alone
 * before Axios opens a socket. The browser proof asserts exactly that by
 * sampling `location.hash` at the moment the request is observed.
 *
 * The strip runs for a **malformed** fragment too, before that path returns.
 *
 * ## Why a ref, and why it survives a transient failure
 *
 * The token lives in a ref owned by this hook and nowhere else. A ref rather
 * than reducer state because reducer state is a value React keeps, snapshots
 * and hands to devtools, and this must be none of those. The mutation is
 * declared with **no variables** — `mutate()` takes no argument and the token is
 * read from the ref inside `mutationFn` — so TanStack's retained
 * `mutation.variables` is permanently `undefined` rather than a copy of the
 * credential parked in the mutation cache. `reset()` on settlement drops the
 * mutation entry as well.
 *
 * It is cleared on a resolved grant, on a definitive refusal, on a
 * missing-or-malformed fragment, and on unmount. It is deliberately **kept**
 * across a transient failure, and only that one: a network error carries no
 * verdict about the link, the fragment is gone and cannot be read twice, so
 * destroying the token there would convert a flaky connection into a
 * permanently dead link. It stays in the same ephemeral ref — not storage, not
 * the URL, not the cache — and dies with the component (§8).
 *
 * A reload after the strip therefore cannot recover the credential, and falls
 * into the same unavailable state as a visit with no fragment. That is the
 * intended behaviour, not a gap.
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { normalizeApiClientError } from '@embroidery/api-client';

import { resolveSecureLink } from '../api/secure-link.client';
import { readSecureLinkToken, stripSecureLinkFragment } from '../model/secure-link-fragment';
import {
  initialSecureLinkState,
  secureLinkOutcomeOf,
  secureLinkReducer,
  type SecureLinkState,
} from '../model/secure-link-state';

export interface SecureLinkResolution {
  readonly state: SecureLinkState;
  /** Explicit user action only. There is no automatic retry anywhere (§15). */
  readonly retry: () => void;
  readonly retrying: boolean;
}

export function useSecureLinkResolution(): SecureLinkResolution {
  const [state, dispatch] = useReducer(secureLinkReducer, initialSecureLinkState);

  /** The token, for exactly as long as a request may still need it. */
  const tokenRef = useRef('');
  const clearToken = useCallback(() => {
    tokenRef.current = '';
  }, []);

  /**
   * Bootstrap runs once.
   *
   * Without this guard React's development double-invocation would run the
   * effect a second time, find the fragment already stripped, and render the
   * unavailable state over a link that was perfectly valid — a bug that appears
   * only in development and only for real customers of the dev build.
   */
  const bootstrappedRef = useRef(false);

  const resolve = useMutation({
    // No variables: the token is read from the ref, so nothing TanStack retains
    // after settlement can contain it.
    mutationFn: () => resolveSecureLink(tokenRef.current),
    onSuccess: (grant) => {
      // A verdict exists and it is favourable; the credential has no further use.
      clearToken();
      dispatch({ type: 'RESOLVED', grant });
    },
    onError: (error: unknown) => {
      const outcome = secureLinkOutcomeOf(normalizeApiClientError(error));
      if (outcome === 'TRANSIENT') {
        // No verdict was reached, so the token is kept for a manual retry.
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
    // that still holds a token. The guard is the token itself rather than the
    // status, so a retry can never fire with an empty credential.
    if (tokenRef.current === '') return;
    resolve.mutate();
  }, [resolve]);

  return { state, retry, retrying: resolve.isPending };
}
