'use client';

/**
 * The `/truy-cap/don-hang` secure session: one credential, one order read, and
 * the rules that govern both (`APP12-S03` §6, §7, §8, §10, §26, §31, §32, §34).
 *
 * ## The bootstrap is APP4's, unchanged
 *
 * `useSecureLinkBootstrap` performs the locked sequence — capture `#t=`, strip
 * the fragment synchronously through `history.replaceState`, and only then send
 * the credential in a request **body**. That ordering is three statements in
 * one synchronous block inside APP4's own effect, not an effect-scheduling
 * accident, and this feature does not restate it: there is one fragment parser,
 * one strip and one credential lifetime in this application, and §6 exists to
 * keep it that way. No second secure framework is built here.
 *
 * ## The one call the credential is spent on first
 *
 * `readCurrentOrder`, and nothing before it. `APP12-B04`'s read runs the whole
 * grant resolution and authorization chain internally, so chaining
 * `publicSecureLinkResolve` in front would authorize the same bearer twice,
 * spend the same abuse budget twice, hold the raw secret across an extra
 * request, and return no business fact the read does not already carry (§7).
 * `SECURE_LINK_RESOLVE_CALLS = 0`.
 *
 * ## The credential outlives the first read, and only here
 *
 * Unlike `APP4-S02`'s read-only landing, this route spends the credential again
 * — on the FULL obligation, the QR, the initiation and every evidence call — so
 * it is acquired with `retainCredentialAfterSuccess` (§8), which is the same
 * posture `APP6-S01`, `APP7-S01` and `APP9-S01` take. Every other lifetime rule
 * is APP4's and is unchanged: the credential lives in one ephemeral ref owned
 * by that hook, is reachable only by being passed *into* a request function on
 * the stack, and dies on a definitive refusal, on a missing or malformed
 * fragment, on unmount, and on the session ending here.
 *
 * It is never written to React state, Zustand, a TanStack key, mutation
 * variables, storage, a cookie, history state, the DOM or a log. The mutations
 * in this feature are declared with **no variables** precisely so nothing
 * TanStack retains after settlement can contain it.
 *
 * ## A reload is a dead end, and that is the design (§34)
 *
 * The fragment was stripped before the first request and cannot be read twice,
 * so a reload lands on the same unavailable state as a visit with no fragment.
 * Nothing is persisted to make reload work, because persisting a bearer
 * credential to survive a refresh is the leak the fragment carrier exists to
 * close. The customer reopens the original link from their message.
 *
 * ## Refresh, and why there is no timer (§26)
 *
 * The workshop changes this order asynchronously — an operator sets the
 * shipping fee, an Admin verifies the transfer hours later — so the page must
 * be able to catch up. It does so on **returning attention** and on explicit
 * action, never on a clock:
 *
 * ```text
 * transient failure   →  the shell's own manual retry
 * tab becomes visible →  one re-read
 * window regains focus →  one re-read
 * ```
 *
 * §26 forbids aggressive polling outright and a 1- or 5-second timer would be
 * dishonest anyway: Admin verification is manual and may be hours away, so a
 * loop would spend the secure-link rate budget to learn nothing. The re-reads
 * are coalesced through {@link REFRESH_QUIET_MS} so a rapid alt-tab does not
 * fire two, and they are skipped entirely once the session has ended or the
 * credential is gone.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';

import type { ReadyMadeOrderAccessResponse } from '@embroidery/api-client';
import { useQueryClient } from '@tanstack/react-query';

import { useSecureLinkBootstrap, type SecureLinkState } from '../../secure-link-access';
import { readCurrentOrder } from '../api/secure-ready-made-order.client';
import { ORDER_ACCESS_QUERY_KEYS } from '../model/order-access-query-keys';

/**
 * The shortest gap between two attention-triggered re-reads.
 *
 * A window regaining focus and a tab becoming visible are two events for one
 * gesture in most browsers, and a customer switching between apps produces them
 * in bursts. Coalescing them is what keeps "refetch when the customer comes
 * back" from becoming the polling §26 forbids.
 */
export const REFRESH_QUIET_MS = 10_000;

export interface SecureOrderSession {
  readonly linkState: SecureLinkState<ReadyMadeOrderAccessResponse>;
  /** The shell's manual retry, for the transient-transport card only. */
  readonly retryLink: () => void;
  readonly retryingLink: boolean;
  /**
   * Re-reads the order with the credential already held.
   *
   * Explicit, and guarded by the credential itself so it can never fire with an
   * empty one. Nothing calls it on a timer.
   */
  readonly refresh: () => void;
  /**
   * Replaces the whole screen with the one indistinguishable unavailable card.
   *
   * Reached when a *later* call answers with the grant-is-gone refusal, which
   * the bootstrap cannot express because its own read succeeded (§31). Handed
   * to the FULL, QR and evidence hooks so a refusal that means the link died is
   * reported as a dead link rather than as a payment or image problem — and so
   * the order code, the amount, the bank account and the evidence list all
   * leave the screen with it, rather than sitting behind an error overlay.
   */
  readonly endSession: () => void;
  /**
   * Spends the retained credential on one further call.
   *
   * The secret is passed into `spend` and the promise resolves with whatever
   * that call produced, so the credential's only appearance outside APP4's hook
   * is as an argument on the stack of the request that needs it. It is never
   * returned, stored or logged.
   */
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
}

export function useSecureOrderSession(): SecureOrderSession {
  const queryClient = useQueryClient();
  const bootstrap = useSecureLinkBootstrap<ReadyMadeOrderAccessResponse>(
    (secret) => readCurrentOrder(secret),
    { retainCredentialAfterSuccess: true },
  );

  /**
   * Set when a later call answers with the refusal that ends the grant.
   *
   * A ref plus a forced render rather than reducer state: the flag is
   * write-once and irreversible for this mount, and the screen substitutes the
   * identical unavailable state rather than inventing a fifth access frame.
   */
  const sessionEndedRef = useRef(false);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    bootstrap.clearCredential();
    forceRender();
  }, [bootstrap]);

  /**
   * The bootstrap, in a ref so the attention listeners below do not have to
   * re-subscribe on every render. `bootstrap` is a fresh object each time, so a
   * dependency on it would tear down and rebuild both listeners continuously.
   */
  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  const lastRefreshRef = useRef(0);

  const refresh = useCallback(() => {
    const current = bootstrapRef.current;
    // The credential is the guard rather than the status, so a refresh can
    // never fire with an empty one — and a session that has ended holds none.
    if (sessionEndedRef.current || !current.hasCredential()) return;
    if (current.retrying) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_QUIET_MS) return;
    lastRefreshRef.current = now;
    current.retry();

    // The order projection and the FULL obligation are two reads, and a refresh
    // that renewed only the first would leave a **stale amount** on screen after
    // a shipping-fee correction — the exact failure §24 forbids, and one the
    // order status cannot reveal because a correction does not move it. The QR
    // encodes that same amount, so it is renewed in the same breath.
    //
    // Exactly two keys. Evidence is deliberately not among them: it is bound to
    // the attempt this session opened, a refresh cannot change what that attempt
    // holds, and §33 forbids widening an invalidation to "everything" because
    // that is easier to write.
    void queryClient.invalidateQueries({ queryKey: ORDER_ACCESS_QUERY_KEYS.fullPayment() });
    void queryClient.invalidateQueries({ queryKey: ORDER_ACCESS_QUERY_KEYS.qr() });
  }, [queryClient]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') refresh();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return {
    // A session that has ended shows the same card as a link that never opened.
    // Indistinguishable, which is the point (§10, §31).
    linkState: sessionEndedRef.current ? { status: 'UNAVAILABLE' } : bootstrap.state,
    retryLink: bootstrap.retry,
    retryingLink: bootstrap.retrying,
    refresh,
    endSession,
    runWithSecret: bootstrap.runWithSecret,
  };
}
