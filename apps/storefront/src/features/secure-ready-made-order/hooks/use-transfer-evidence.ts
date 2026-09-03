'use client';

/**
 * Optional transfer evidence: what has been submitted, and sending one more
 * (`APP12-S03` §21, §22, §23, §26, §33).
 *
 * ## It is bound to the attempt this session opened, and to no other (§23)
 *
 * `attemptId` comes from the accepted initiation and from nowhere else — never
 * from user input, never from a URL, never from a stored value. With no attempt
 * the query is disabled and the mutation rejects before it reaches the wire, so
 * the UI naturally requires initiation first rather than inventing an id to get
 * past the gate.
 *
 * The caller passes the attempt only while it still matches the live obligation,
 * so a shipping-fee correction that supersedes the obligation also withdraws the
 * attempt — and evidence cannot migrate across obligations (§24), because the
 * key it is stored under simply stops existing.
 *
 * The server is not relying on any of this. `APP7-B05`'s evidence authorizer
 * locks the attempt row and compares its **order** against the one the grant
 * names, so a foreign or fictional id is an indistinguishable 404 there
 * regardless, and cross-order evidence is impossible rather than merely
 * unattempted. This is the client half of the same rule.
 *
 * ## The route is the deposit lane's, and that is deliberate (§21)
 *
 * `APP12-B04` widened the evidence authorizer to accept a Ready-Made `FULL`
 * attempt rather than publishing a second endpoint, so these calls travel a
 * `deposit`-named path. No sentence this hook's panel renders repeats that
 * word: a Ready-Made order has no deposit at all.
 *
 * ## The list is the server's, always
 *
 * The status operation is the only thing that says how many images exist and
 * what became of them. Nothing here maintains a parallel tally, appends an
 * optimistic row, or decides locally that the quota is now full: the count that
 * gates the upload control is `items.length` from the last read, and when the
 * server refuses because that count was stale the answer is to read again
 * rather than to argue.
 *
 * ## One upload is one action, and it keeps its key
 *
 * The key is minted when the customer picks a file and is reused only for a
 * *retry of that same file* — the same logical upload, retried across a
 * transport failure, which is exactly what `Idempotency-Key` is for. Picking a
 * different file mints a new one. Nothing auto-retries: a financial surface is
 * the last place to fire a request nobody asked for (§32).
 *
 * ## Uploading is not paying (§22, §27)
 *
 * A successful upload refetches the evidence list and **nothing else**. It does
 * not re-read the obligation, does not touch the QR, and cannot move the screen
 * to a settled state. The invalidation names exactly one key, because §33
 * forbids widening it to "everything" because that is easier to write — nothing
 * else this route reads has any relationship to an image this customer just
 * sent, and the order's own status is the session's to re-read, not this hook's.
 */
import { useCallback, useRef, useState } from 'react';

import { normalizeApiClientError, type TransferEvidenceItemResponse } from '@embroidery/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newUploadIdempotencyKey } from '../../../shared/utils/upload-idempotency-key';
import {
  readTransferEvidence,
  uploadTransferEvidence,
} from '../api/secure-ready-made-order.client';
import {
  requiresEvidenceRefetch,
  uploadFailureOf,
  type NoticeableUploadFailure,
} from '../model/order-access-failure';
import { ORDER_ACCESS_QUERY_KEYS } from '../model/order-access-query-keys';
import { localFileRefusal, type LocalFileRefusal } from '../model/transfer-evidence';

/** Everything a refused upload can be, from either side of the wire. */
export type EvidenceFailure = NoticeableUploadFailure | LocalFileRefusal;

export interface TransferEvidence {
  readonly items: readonly TransferEvidenceItemResponse[];
  readonly loading: boolean;
  /** The server's count. The quota's only client-side reading. */
  readonly submittedCount: number;
  readonly uploading: boolean;
  /** Whole percent, when the browser reports a total. */
  readonly progress: number | undefined;
  /** The file the customer chose, for the uploading row's caption. */
  readonly pendingFileName: string | undefined;
  readonly failure: EvidenceFailure | undefined;
  /** Whether the failure is one a plain retry of the same file could clear. */
  readonly retryable: boolean;
  readonly chooseFile: (file: File) => void;
  readonly retryUpload: () => void;
}

export interface TransferEvidenceOptions {
  /** The current attempt the images belong to; absent before one is opened. */
  readonly attemptId: string | undefined;
  readonly runWithSecret: <TResult>(
    spend: (secret: string) => Promise<TResult>,
  ) => Promise<TResult>;
  /** Called when a refusal says the grant itself is gone. */
  readonly onSessionEnded: () => void;
}

const NO_ITEMS: readonly TransferEvidenceItemResponse[] = [];

/** The two refusals a second attempt at the same bytes could plausibly clear. */
const RETRYABLE: ReadonlySet<EvidenceFailure> = new Set<EvidenceFailure>([
  'TRANSIENT',
  'IN_PROGRESS',
]);

export function useTransferEvidence({
  attemptId,
  runWithSecret,
  onSessionEnded,
}: TransferEvidenceOptions): TransferEvidence {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [failure, setFailure] = useState<EvidenceFailure | undefined>(undefined);
  const [pendingFileName, setPendingFileName] = useState<string | undefined>(undefined);

  /** The exact bytes and identity of the upload in hand, for a retry of it. */
  const pendingFileRef = useRef<File | undefined>(undefined);
  const idempotencyKeyRef = useRef('');
  const inFlightRef = useRef(false);

  const list = useQuery({
    queryKey: ORDER_ACCESS_QUERY_KEYS.evidence(attemptId ?? ''),
    queryFn: () => {
      // `enabled` already makes this unreachable; narrowing rather than asserting
      // keeps it that way if a future edit widens the gate.
      if (attemptId === undefined) return Promise.reject(new Error('NO_ATTEMPT'));
      return runWithSecret((secret) => readTransferEvidence(secret, attemptId));
    },
    enabled: attemptId !== undefined,
  });

  const refetchList = useCallback(() => {
    if (attemptId === undefined) return;
    // Exactly one key. Nothing else this route reads has changed.
    void queryClient.invalidateQueries({
      queryKey: ORDER_ACCESS_QUERY_KEYS.evidence(attemptId),
    });
  }, [attemptId, queryClient]);

  const upload = useMutation({
    // No variables: the credential is reached through `runWithSecret`, and the
    // file and key are read from refs, so nothing TanStack retains can hold the
    // secret or the key.
    mutationFn: () => {
      const file = pendingFileRef.current;
      if (file === undefined || attemptId === undefined) {
        return Promise.reject(new Error('NO_PENDING_EVIDENCE'));
      }
      return runWithSecret((secret) =>
        uploadTransferEvidence({
          token: secret,
          attemptId,
          file,
          idempotencyKey: idempotencyKeyRef.current,
          onProgress: setProgress,
        }),
      );
    },
    onSuccess: () => {
      // The image is recorded and inspection is queued. Nothing about the
      // payment moved, so the only thing re-read is the list this changed.
      pendingFileRef.current = undefined;
      setPendingFileName(undefined);
      setFailure(undefined);
      refetchList();
    },
    onError: (error: unknown) => {
      const refused = uploadFailureOf(normalizeApiClientError(error));
      if (refused === 'UNAVAILABLE') {
        onSessionEnded();
        return;
      }
      // The existing list is deliberately left alone: a refused upload is not a
      // reason to hide images that were accepted earlier.
      setFailure(refused);
      if (requiresEvidenceRefetch(refused)) refetchList();
    },
    onSettled: () => {
      inFlightRef.current = false;
      setProgress(undefined);
      upload.reset();
    },
    retry: false,
  });

  const send = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setFailure(undefined);
    upload.mutate();
  }, [upload]);

  const chooseFile = useCallback(
    (file: File) => {
      if (inFlightRef.current) return;
      const refused = localFileRefusal(file);
      if (refused !== undefined) {
        // Refused before a byte leaves the browser. The server would refuse it
        // too; this only spares the customer a 10 MiB round trip to be told so.
        pendingFileRef.current = undefined;
        setPendingFileName(undefined);
        setFailure(refused);
        return;
      }
      pendingFileRef.current = file;
      setPendingFileName(file.name);
      idempotencyKeyRef.current = newUploadIdempotencyKey();
      send();
    },
    [send],
  );

  const retryUpload = useCallback(() => {
    // The same file and the same key: one logical upload, tried again. A new key
    // here would let a request the server already committed become a second
    // image.
    if (pendingFileRef.current === undefined) return;
    send();
  }, [send]);

  const items = list.data?.evidence ?? NO_ITEMS;

  return {
    items,
    loading: list.isPending && attemptId !== undefined,
    submittedCount: items.length,
    uploading: upload.isPending,
    progress,
    pendingFileName,
    failure,
    retryable:
      failure !== undefined && RETRYABLE.has(failure) && pendingFileRef.current !== undefined,
    chooseFile,
    retryUpload,
  };
}
