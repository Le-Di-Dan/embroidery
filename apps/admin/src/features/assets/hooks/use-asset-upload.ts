'use client';

/**
 * The upload intent state machine.
 *
 * It owns exactly one selected `File`, one `AbortController` and one
 * `Idempotency-Key`, and it is the only place any of the three exists. None of
 * them is written to the query cache, a store, the URL or web storage.
 *
 * The rule that shapes everything here: a client abort can race server
 * completion, and there is no delete API. So an ambiguous outcome never
 * regenerates the key and never re-sends on its own — it refreshes the
 * authoritative list, tells the operator plainly what is and is not known, and
 * waits for an explicit retry that reuses the same key.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeLocalRejection, describeUnknownFailure } from '../model/asset-failure';
import { resolveAssetTitle } from '../model/asset-identity';
import { assetQueryKeys } from '../model/asset-query-keys';
import { isReconciliationPending, parseAssetStatus } from '../model/asset-status';
import { validateSelectedFiles } from '../model/asset-upload-policy';
import { createUploadIntent, type UploadIntent } from '../model/upload-intent';
import type { UploadState } from '../model/upload-state';
import { uploadAsset } from '../services/asset-upload.service';
import { useAssetProcessingQuery } from './use-asset-processing-query';

/** Progress never reaches 100 while bytes are in flight — only success does. */
const MAX_IN_FLIGHT_PERCENT = 99;

export interface AssetUploadController {
  readonly state: UploadState;
  /** Shared by the file input and the drop target — one validation path. */
  readonly select: (files: readonly File[]) => void;
  /** Sends the staged intent. */
  readonly submit: () => void;
  /** Aborts the in-flight transport; the outcome stays honestly ambiguous. */
  readonly cancel: () => void;
  /** Re-sends the same file under the same idempotency key. */
  readonly retry: () => void;
  /** Clears a finished or failed attempt without starting a new one. */
  readonly dismiss: () => void;
}

function toPercent(loaded: number, totalBytes: number): number | null {
  if (!Number.isFinite(loaded) || loaded < 0 || totalBytes <= 0) {
    return null;
  }
  const percent = Math.floor((loaded / totalBytes) * 100);
  return Math.min(Math.max(percent, 0), MAX_IN_FLIGHT_PERCENT);
}

export function useAssetUpload(): AssetUploadController {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ kind: 'idle' });

  /**
   * The staged intent: file + key. It is released at the authoritative server
   * answer (202) — the point at which the local filename stops being the truth
   * about the asset and no repeat of this request can exist any more.
   */
  const intentRef = useRef<UploadIntent | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: assetQueryKeys.list() });
  }, [queryClient]);

  const releaseTransport = useCallback(() => {
    controllerRef.current = null;
  }, []);

  const send = useCallback(
    async (intent: UploadIntent) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ kind: 'uploading', file: intent.file, percent: 0 });

      try {
        const receipt = await uploadAsset({
          intent,
          signal: controller.signal,
          onProgress: (loaded) => {
            setState((current) =>
              current.kind === 'uploading'
                ? { ...current, percent: toPercent(loaded, intent.file.size) }
                : current,
            );
          },
        });
        // Authoritative success: the server owns this asset's identity now, so
        // the local file is released here rather than at the terminal state.
        intentRef.current = null;
        releaseTransport();
        setState({
          kind: 'processing',
          assetId: receipt.assetId,
          title: resolveAssetTitle(receipt.mediaType),
        });
        invalidateList();
      } catch (error: unknown) {
        releaseTransport();
        if (controller.signal.aborted) {
          // The abort may have landed after the server stored the asset, so the
          // list is refreshed and no claim is made about what was written.
          setState({ kind: 'cancelled', file: intent.file });
          invalidateList();
          return;
        }
        const failure = describeUnknownFailure(error);
        setState({
          kind: 'failed',
          message: failure.message,
          retryable: failure.retryable,
          file: intent.file,
        });
      }
    },
    [invalidateList, releaseTransport],
  );

  const select = useCallback((files: readonly File[]) => {
    if (controllerRef.current !== null) {
      return;
    }
    const result = validateSelectedFiles(files);
    if (!result.ok) {
      intentRef.current = null;
      const failure = describeLocalRejection(result.reason);
      setState({ kind: 'failed', message: failure.message, retryable: false, file: null });
      return;
    }
    try {
      // A replaced file is a new intent, so it gets a new key — the only time
      // a key is ever regenerated.
      intentRef.current = createUploadIntent(result.file);
      setState({ kind: 'selected', file: result.file });
    } catch (error: unknown) {
      intentRef.current = null;
      const failure = describeUnknownFailure(error);
      setState({ kind: 'failed', message: failure.message, retryable: false, file: null });
    }
  }, []);

  const submit = useCallback(() => {
    const intent = intentRef.current;
    if (intent === null || controllerRef.current !== null) {
      return;
    }
    void send(intent);
  }, [send]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const dismiss = useCallback(() => {
    if (controllerRef.current !== null) {
      return;
    }
    const intent = intentRef.current;
    setState(intent === null ? { kind: 'idle' } : { kind: 'selected', file: intent.file });
  }, []);

  // Reconciliation: poll the authoritative detail resource for the one asset
  // this session just uploaded, and stop at the first non-pending answer.
  const processingAssetId = state.kind === 'processing' ? state.assetId : null;
  const processingTitle = state.kind === 'processing' ? state.title : '';
  const processing = useAssetProcessingQuery(processingAssetId);
  const processingStatus = processing.data?.status;
  const processingFailed = processing.isError;

  useEffect(() => {
    if (processingAssetId === null) {
      return;
    }
    if (processingFailed) {
      setState({ kind: 'indeterminate', title: processingTitle });
      return;
    }
    if (processingStatus === undefined) {
      return;
    }
    const presentation = parseAssetStatus(processingStatus);
    if (isReconciliationPending(presentation)) {
      return;
    }
    if (presentation === 'READY') {
      setState({ kind: 'accepted', title: processingTitle });
    } else if (presentation === 'REJECTED') {
      setState({ kind: 'rejected', title: processingTitle });
    } else {
      setState({ kind: 'indeterminate', title: processingTitle });
    }
    invalidateList();
  }, [processingAssetId, processingFailed, processingStatus, processingTitle, invalidateList]);

  // Unmount: stop the transport. The intent refs are dropped with the hook, so
  // no file, key or controller outlives the screen.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  const retry = useCallback(() => {
    const intent = intentRef.current;
    if (intent === null || controllerRef.current !== null) {
      return;
    }
    // Same file, same key: B01 recognises the repeat instead of storing a
    // second asset.
    void send(intent);
  }, [send]);

  return { state, select, submit, cancel, retry, dismiss };
}
