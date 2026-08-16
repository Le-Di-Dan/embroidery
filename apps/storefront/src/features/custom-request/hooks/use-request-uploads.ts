'use client';

/**
 * Customer uploads for one verified challenge: the upload itself, and the
 * bounded wait for a verdict (`654:3` … `654:397`).
 *
 * ## Polling is bounded three ways, not one
 *
 * `APP5-S01` §11 forbids recursive timer infrastructure and aggressive polling,
 * so the wait is expressed as ordinary TanStack queries with a
 * `refetchInterval` **function**. It stops when the state is terminal
 * (`ACCEPTED`/`REJECTED`), when a per-asset attempt budget is spent, and — for
 * free, because these are queries and not timers — when the component unmounts.
 * A fourth stop is structural: the queries are keyed by challenge and disabled
 * without one, so a verification that is no longer usable takes its polling with
 * it rather than leaving a loop running against a dead scope.
 *
 * ## The file never enters the cache
 *
 * A `File` is held in a ref, keyed by slot, so a retry can re-send the same
 * bytes. It is not in query data, not in reducer state and not in a store — and
 * the idempotency key beside it is minted once per customer action and reused
 * across a retry of that action, which is what stops one retry from creating a
 * second stored asset.
 */
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeApiClientError } from '@embroidery/api-client';

import { readRequestAssetStatus, uploadRequestAsset } from '../api/custom-request.client';
import { customRequestQueryKeys } from '../model/custom-request-query-keys';
import {
  applyStatus,
  challengeCapReached,
  isPending,
  localFileFailure,
  roleCapReached,
  type AssetSlot,
  type CustomerAssetRole,
  type UploadFailureClass,
} from '../model/request-asset-slot';

/** Well inside the inspection turnaround, and not a business value. */
const POLL_INTERVAL_MS = 2_000;
/** ~2 minutes of waiting before the customer is offered a retry instead. */
const MAX_POLLS = 60;

const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const UNPROCESSABLE = 422;
const TOO_MANY_REQUESTS = 429;

/**
 * A refused upload, reduced to one of the bounded classes (§12).
 *
 * Mapped from the envelope code and the HTTP status only. No branch here reads
 * `message`, so no sentence the server writes can reach the screen.
 */
function uploadFailureOf(error: unknown): UploadFailureClass {
  const normalized = normalizeApiClientError(error);
  if (normalized.code === 'CUSTOMER_NOT_VERIFIED') return 'VERIFICATION_UNAVAILABLE';
  if (normalized.code === 'ASSET_QUOTA_EXCEEDED') return 'QUOTA';
  switch (normalized.httpStatus) {
    case PAYLOAD_TOO_LARGE:
      return 'TOO_LARGE';
    case UNSUPPORTED_MEDIA_TYPE:
      return 'UNSUPPORTED';
    case TOO_MANY_REQUESTS:
      return 'QUOTA';
    case UNPROCESSABLE:
      return 'PROCESSING_FAILED';
    default:
      return 'GENERIC';
  }
}

interface PendingUpload {
  readonly file: File;
  readonly role: CustomerAssetRole;
  /**
   * Minted once, when the customer chose this file, and reused by every retry
   * of that same choice. Regenerating it on retry is exactly how one action
   * becomes two stored assets, and `APP5-B02` publishes no delete to undo that.
   */
  readonly idempotencyKey: string;
}

export interface RequestUploads {
  readonly slots: readonly AssetSlot[];
  readonly addFiles: (role: CustomerAssetRole, files: readonly File[]) => void;
  readonly retry: (key: string) => void;
  readonly remove: (key: string) => void;
  readonly capReachedFor: (role: CustomerAssetRole) => boolean;
  readonly quotaReached: boolean;
  /** True while any slot is still on its way to a verdict. */
  readonly hasPending: boolean;
}

export function useRequestUploads(challengeId: string | undefined): RequestUploads {
  const [slots, setSlots] = useState<readonly AssetSlot[]>([]);
  const queryClient = useQueryClient();

  /** Bytes and idempotency key per slot. Never state, never cached. */
  const pendingRef = useRef(new Map<string, PendingUpload>());
  const pollCountRef = useRef(new Map<string, number>());
  const nextKeyRef = useRef(0);

  // A challenge change is a different world: slots uploaded under a spent or
  // restarted verification are not ours to submit, and their ids answer for
  // nobody.
  useEffect(() => {
    setSlots([]);
    pendingRef.current.clear();
    pollCountRef.current.clear();
  }, [challengeId]);

  const patch = useCallback((key: string, change: (slot: AssetSlot) => AssetSlot) => {
    setSlots((current) => current.map((slot) => (slot.key === key ? change(slot) : slot)));
  }, []);

  const upload = useMutation({
    mutationFn: async (key: string) => {
      const pending = pendingRef.current.get(key);
      if (pending === undefined || challengeId === undefined) {
        throw new Error('No pending upload for this slot.');
      }
      const receipt = await uploadRequestAsset({
        challengeId,
        file: pending.file,
        // The role is read from the pending record rather than from `slots`,
        // which this closure would only ever see a stale copy of.
        role: pending.role,
        idempotencyKey: pending.idempotencyKey,
      });
      return { key, assetId: receipt.assetId, state: receipt.state };
    },
    onSuccess: (result) => {
      patch(result.key, (slot) => ({
        ...slot,
        phase: 'TRACKING',
        assetId: result.assetId,
        state: result.state,
        bindable: false,
        failure: undefined,
      }));
    },
    onError: (error, key) => {
      patch(key, (slot) => ({ ...slot, phase: 'FAILED', failure: uploadFailureOf(error) }));
    },
    retry: false,
  });

  // One query per slot awaiting a verdict. `useQueries` rather than a query per
  // component so the whole set is described in one place and a slot that
  // reaches a terminal state simply stops being polled.
  const tracked = slots.filter((slot) => slot.assetId !== undefined && isPending(slot));
  useQueries({
    queries: tracked.map((slot) => ({
      queryKey: customRequestQueryKeys.assetStatus(challengeId ?? '', slot.assetId as string),
      queryFn: async () => {
        const key = slot.key;
        pollCountRef.current.set(key, (pollCountRef.current.get(key) ?? 0) + 1);
        const status = await readRequestAssetStatus(challengeId as string, slot.assetId as string);
        setSlots((current) =>
          current.map((entry) => (entry.key === key ? applyStatus(entry, status) : entry)),
        );
        return status;
      },
      enabled: challengeId !== undefined,
      gcTime: 0,
      retry: false,
      refetchInterval: () => {
        // Budget spent: stop asking and let the customer decide what to do.
        const polls = pollCountRef.current.get(slot.key) ?? 0;
        return polls >= MAX_POLLS ? false : POLL_INTERVAL_MS;
      },
    })),
  });

  const addFiles = useCallback(
    (role: CustomerAssetRole, files: readonly File[]) => {
      if (challengeId === undefined) return;

      // Built outside the state updater on purpose: the updater is a pure
      // function React may call more than once, and starting an upload from
      // inside it would send the same file twice under two different keys.
      const admitted: AssetSlot[] = [];
      const started: string[] = [];
      const projected = [...slots];

      for (const file of files) {
        if (roleCapReached(projected, role) || challengeCapReached(projected)) break;
        const key = `slot-${nextKeyRef.current}`;
        nextKeyRef.current += 1;

        // A client-side refusal never reaches the network, but it is still
        // shown through the same bounded classes: the server re-checks both.
        const local = localFileFailure(file);
        if (local !== undefined) {
          const slot = failedSlot(key, role, file.name, local);
          admitted.push(slot);
          projected.push(slot);
          continue;
        }

        pendingRef.current.set(key, { file, role, idempotencyKey: crypto.randomUUID() });
        const slot: AssetSlot = {
          key,
          role,
          fileName: file.name,
          phase: 'UPLOADING',
          assetId: undefined,
          state: undefined,
          bindable: false,
          failure: undefined,
        };
        admitted.push(slot);
        projected.push(slot);
        started.push(key);
      }

      if (admitted.length === 0) return;
      setSlots((current) => [...current, ...admitted]);
      for (const key of started) upload.mutate(key);
    },
    [challengeId, slots, upload],
  );

  const retry = useCallback(
    (key: string) => {
      // The same key: this is a retry of one customer action, so the arbiter
      // must see it as the same upload rather than as a second one.
      if (!pendingRef.current.has(key)) return;
      pollCountRef.current.delete(key);
      patch(key, (slot) => ({ ...slot, phase: 'UPLOADING', failure: undefined }));
      upload.mutate(key);
    },
    [patch, upload],
  );

  const remove = useCallback(
    (key: string) => {
      const slot = slots.find((entry) => entry.key === key);
      pendingRef.current.delete(key);
      pollCountRef.current.delete(key);
      if (slot?.assetId !== undefined && challengeId !== undefined) {
        // Dropping the tile stops its polling; the asset itself is left alone,
        // since `APP5-B02` publishes no delete and an unbound asset expires.
        queryClient.removeQueries({
          queryKey: customRequestQueryKeys.assetStatus(challengeId, slot.assetId),
        });
      }
      setSlots((current) => current.filter((entry) => entry.key !== key));
    },
    [challengeId, queryClient, slots],
  );

  return {
    slots,
    addFiles,
    retry,
    remove,
    capReachedFor: (role) => roleCapReached(slots, role),
    quotaReached: challengeCapReached(slots),
    hasPending: slots.some(isPending),
  };
}

function failedSlot(
  key: string,
  role: CustomerAssetRole,
  fileName: string,
  failure: UploadFailureClass,
): AssetSlot {
  return {
    key,
    role,
    fileName,
    phase: 'FAILED',
    assetId: undefined,
    state: undefined,
    bindable: false,
    failure,
  };
}
