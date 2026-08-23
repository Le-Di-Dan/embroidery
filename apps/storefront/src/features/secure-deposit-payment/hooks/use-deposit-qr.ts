'use client';

/**
 * The dynamic QR, and the whole life of the object URL that renders it
 * (`APP7-S01` §8, §9, §10).
 *
 * ## It is a read, so it is a query
 *
 * `publicOrderDeposit_qr` writes nothing — the PNG is generated on the server
 * from immutable inputs on every request and is never stored, so there is no
 * object, asset or storage key for it. Modelling it as a mutation would attach
 * write semantics to a zero-write operation, so it is a `useQuery` under the
 * route-local client `APP4-S02` established: `retry: false`, `gcTime: 0`. That
 * second default is what stops a sensitive image being parked in a cache after
 * the customer has left the panel that showed it.
 *
 * ## The object URL is owned here and nowhere else
 *
 * ```text
 * blob arrives → revoke whatever we held → createObjectURL → render
 * blob changes / panel closes / component unmounts → revoke
 * ```
 *
 * The URL lives in one piece of state owned by this hook. It is never written to
 * a module-level variable, never handed to a global, never persisted, and the
 * blob itself never reaches `localStorage` or `sessionStorage` — neither can hold
 * a `Blob` in any case, and the point is that no code exists that tries.
 * Revocation happens *before* replacement rather than after, so a re-fetch cannot
 * leak the previous handle.
 *
 * ## Why `createObjectURL` is checked for rather than assumed
 *
 * It is absent in jsdom and in a handful of restricted embedded browsers. Calling
 * it unguarded throws inside a render effect, which would take the whole payment
 * screen down over a *convenience* — the QR is explicitly a shortcut, and the
 * account number, the amount and the transfer reference beside it are the actual
 * way to pay (`753:147`). So its absence degrades to the fallback line and the
 * customer transfers manually, exactly as someone whose camera cannot read the
 * code does.
 *
 * ## The download spends no second request
 *
 * §10 forbids calling the backend again just to hand over a copy of bytes the
 * page already holds. The download reuses the same authorized blob through the
 * same object URL. The filename is built from the order code — non-sensitive
 * display context the approved frames already print on the page — and carries no
 * token, no account number and no attempt id.
 */
import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { fetchDepositQr } from '../api/secure-deposit.client';
import { DEPOSIT_QUERY_KEYS } from '../model/deposit-query-keys';

export interface DepositQr {
  /** The object URL for the fetched PNG, once one exists. */
  readonly objectUrl: string | undefined;
  readonly loading: boolean;
  /** The fetch failed, or this browser cannot make an object URL. */
  readonly failed: boolean;
  readonly retry: () => void;
  /** Hands the already-authorized bytes to the browser. No second request. */
  readonly download: () => void;
  readonly downloadName: string;
}

export interface DepositQrOptions {
  /** Only true while an approved frame is actually showing the QR panel. */
  readonly enabled: boolean;
  /** Display context for the filename. Never a credential. */
  readonly orderCode: string;
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
}

/** Kept out of `SECURE_DEPOSIT_COPY`: a filename stem is not customer prose. */
const FILENAME_PREFIX = 'ma-qr-dat-coc';

/** Anything outside this set is dropped, so a surprising order code cannot shape a path. */
const FILENAME_SAFE = /[^A-Za-z0-9-]/g;

export function useDepositQr({ enabled, orderCode, runWithSecret }: DepositQrOptions): DepositQr {
  const query = useQuery({
    queryKey: DEPOSIT_QUERY_KEYS.qr(),
    queryFn: ({ signal }) => runWithSecret((secret) => fetchDepositQr(secret, signal)),
    enabled,
  });

  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  const [unsupported, setUnsupported] = useState(false);
  const blob = query.data;

  useEffect(() => {
    if (blob === undefined) return undefined;
    if (typeof URL.createObjectURL !== 'function') {
      setUnsupported(true);
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    // Revocation is the cleanup of the effect that created this exact URL, so a
    // replacement blob revokes its predecessor before the new handle is stored,
    // and leaving the route revokes the last one.
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(undefined);
    };
  }, [blob]);

  const downloadName = `${FILENAME_PREFIX}-${orderCode.replace(FILENAME_SAFE, '')}.png`;

  return {
    objectUrl,
    loading: query.isFetching,
    failed: unsupported || query.isError,
    retry: () => {
      void query.refetch();
    },
    download: () => {
      if (objectUrl === undefined) return;
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    downloadName,
  };
}
