'use client';

/**
 * The image capability's controller (`APP3-S06`).
 *
 * One journey, and it is the checkpoint: choose a file → `APP3-B06B` accepts it
 * for inspection → the status projection is polled until there is a verdict →
 * on `READY`, an `APP3-P01` image element is built from the server's own
 * measurements and ruled on by `APP3-P02` before it may enter the working
 * document.
 *
 * ## What is state here, and what is not
 *
 * The working document stays `APP3-S03`'s and the server answers stay TanStack
 * Query's. What lives in this hook is strictly smaller and strictly transient:
 * which upload is in flight, its idempotency identity, its progress, whether it
 * is replacing an element, and the last refusal. None of it is document state,
 * none of it is a server replica, and none of it survives the component.
 *
 * ## The local revision
 *
 * `APP3-B06B` returns the Session revision after the upload, and it is kept —
 * the next mutation must present it or be refused as stale. Keeping it is not
 * saving: S06 still calls no autosave, sets no timer and shows no saved
 * indicator. `APP3-S10` owns persistence.
 *
 * ## One Asset per attempt
 *
 * The idempotency key is minted once, when the customer chooses a file, and
 * reused for the whole attempt. A transport retry of that attempt therefore
 * returns the original result rather than minting a second durable Asset. A new
 * *choice* is a new attempt and gets a new key, which is what makes "upload the
 * same photo twice deliberately" still work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesignDocument } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';
import { DesignSessionAssetStatusResponseState } from '@embroidery/api-client';

import {
  ruleOnImageCandidate,
  type ImageRefusal,
  type StudioImageMedia,
} from '../model/studio-image-authority';
import { ruleOnImageFile, type ImageFileRefusal } from '../model/studio-image-file';
import { withNewImage, withReplacedImage } from '../model/studio-image-placement';
import type { StudioAreaLimits } from '../model/studio-transform-authority';
import { uploadSessionImage } from '../services/studio-session-asset.client';
import { useSessionAssetStatus } from './use-session-asset-status';

/** Every way the capability can refuse, in one closed set. */
export type StudioImageFailure =
  ImageFileRefusal | 'upload-failed' | 'status-failed' | 'inspection-rejected' | ImageRefusal;

/** What the customer is currently waiting for, if anything. */
export type StudioImagePhase = 'idle' | 'uploading' | 'processing';

export interface UseStudioImageInput {
  readonly sessionId: string | null;
  readonly revision: number;
  readonly document: DesignDocument | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  /** The element a replacement targets, or `null` for a new placement. */
  readonly replacingElementId: string | null;
  readonly commit: (document: DesignDocument) => void;
  readonly onPlaced: (elementId: string) => void;
}

export interface UseStudioImageResult {
  readonly phase: StudioImagePhase;
  /** Fractional upload progress, or `null` when the transport reports no total. */
  readonly progress: number | null;
  readonly failure: StudioImageFailure | null;
  /**
   * Whether the failure above concerned a *replacement*.
   *
   * The same refusal means two different things to a customer: a new image that
   * would not fit was never added, while a replacement that would not fit left
   * their existing picture exactly where it was. One sentence for both would
   * tell half of them something untrue about their own design.
   */
  readonly failedReplacement: boolean;
  /** The Session revision this client currently believes. */
  readonly revision: number;
  readonly chooseFile: (file: File) => void;
  readonly dismissFailure: () => void;
}

interface PendingUpload {
  readonly assetId: string;
  /** The element being replaced, captured at choose time. */
  readonly replacingElementId: string | null;
}

export function useStudioImage({
  sessionId,
  revision,
  document,
  scope,
  limits,
  replacingElementId,
  commit,
  onPlaced,
}: UseStudioImageInput): UseStudioImageResult {
  const [phase, setPhase] = useState<StudioImagePhase>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<StudioImageFailure | null>(null);
  const [failedReplacement, setFailedReplacement] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [localRevision, setLocalRevision] = useState(revision);
  const [placedAssetId, setPlacedAssetId] = useState<string | null>(null);

  /**
   * The identity of the newest attempt.
   *
   * An upload finishes *later*, so it is the thing that can land in a world that
   * has moved on: a slow response arriving after the customer chose a different
   * file, or after the Session changed. Every attempt carries the counter's
   * value at the moment it started and writes nothing unless it is still the
   * newest — the same bounded, allocation-free cancellation `APP3-S05-C1` uses
   * for a font request.
   */
  const attempt = useRef(0);

  // The Session's revision is the server's; a new snapshot supersedes whatever
  // an upload left here. Adjusted during render, which is React's sanctioned way
  // to react to a changed input and the only placement that guarantees no
  // handler can send a superseded revision.
  const [boundRevision, setBoundRevision] = useState(revision);
  if (boundRevision !== revision) {
    setBoundRevision(revision);
    setLocalRevision(revision);
  }

  // A Session change abandons everything in flight: an upload belongs to the
  // Session it was made against, and a status answer for one must never place a
  // picture in another.
  const [boundSession, setBoundSession] = useState(sessionId);
  if (boundSession !== sessionId) {
    setBoundSession(sessionId);
    setPending(null);
    setPhase('idle');
    setProgress(null);
    setFailure(null);
    setPlacedAssetId(null);
    attempt.current += 1;
  }

  const address =
    sessionId !== null && pending !== null ? { sessionId, assetId: pending.assetId } : undefined;
  const status = useSessionAssetStatus(address);

  /**
   * The verdict, and the inputs it will be applied to, as one value.
   *
   * Held in a ref so the effect below can read the *current* document and scope
   * without listing them as dependencies. Listing them would re-run the effect
   * on every commit — including its own — and the placement would be attempted
   * again against the document it just produced.
   */
  const inputs = useRef({ document, scope, limits, commit, onPlaced });
  inputs.current = { document, scope, limits, commit, onPlaced };

  const verdict = status.status;
  const pendingAssetId = pending?.assetId ?? null;
  const settled = verdict !== null && isSettled(verdict.state);

  /*
   * Placing the image, once and only once.
   *
   * In an effect, not during render. `commit` writes the working document, which
   * is a *different* component's state — React refuses that during render, and
   * it is right to: the parent would be re-rendering from a store the child
   * mutated mid-tree. (The render-time adjustments above are this hook's own
   * state, which is the sanctioned case.)
   *
   * `placedAssetId` is what makes it once. The effect can legitimately run more
   * than once for one upload — a re-render, a second poll answer arriving in the
   * same tick — and without the guard each of those would append another copy of
   * the same picture. It is set before anything is built, so no path through
   * here can place twice.
   */
  useEffect(() => {
    if (!settled || verdict === null || pendingAssetId === null) return;
    if (placedAssetId === pendingAssetId) return;
    const current = pending;
    if (current === null) return;
    const { document: liveDocument, scope: liveScope, limits: liveLimits } = inputs.current;
    if (liveDocument === null || liveScope === null) return;

    setPlacedAssetId(pendingAssetId);
    setPending(null);
    setPhase('idle');

    if (verdict.state === DesignSessionAssetStatusResponseState.REJECTED) {
      setFailedReplacement(current.replacingElementId !== null);
      setFailure('inspection-rejected');
      return;
    }

    const outcome = place(verdict, current, liveDocument, liveScope, liveLimits);
    if (outcome.ok) {
      setFailure(null);
      inputs.current.commit(outcome.document);
      inputs.current.onPlaced(outcome.elementId);
      return;
    }
    setFailedReplacement(current.replacingElementId !== null);
    setFailure(outcome.refusal);
    // `pending` is read through `current` only after the guard, and the guard is
    // keyed on the asset id — which is what the effect is actually about, so the
    // object itself is deliberately not a dependency.
  }, [settled, verdict, pendingAssetId, placedAssetId]);

  // A status read that failed is not a verdict about the image. The upload
  // exists; what failed is asking about it, so the wait ends with a retryable
  // sentence rather than a rejection the server never issued.
  if (status.failure !== null && pending !== null && failure === null) {
    setPending(null);
    setPhase('idle');
    setFailedReplacement(pending.replacingElementId !== null);
    setFailure('status-failed');
  }

  const chooseFile = useCallback(
    (file: File) => {
      const refused = ruleOnImageFile(file);
      setFailedReplacement(replacingElementId !== null);
      if (refused !== null) {
        setFailure(refused);
        return;
      }
      if (sessionId === null) {
        setFailure('upload-failed');
        return;
      }

      const started = (attempt.current += 1);
      // Minted once, here, and reused for the whole attempt — including a
      // transport retry of it. A key minted per request would let one retry
      // create a second durable Asset.
      const idempotencyKey = crypto.randomUUID();
      const replacing = replacingElementId;

      setFailure(null);
      setPhase('uploading');
      setProgress(null);
      setPending(null);
      setPlacedAssetId(null);

      void uploadSessionImage({
        sessionId,
        file,
        expectedRevision: localRevision,
        idempotencyKey,
        onProgress: (fraction) => {
          if (started !== attempt.current) return;
          setProgress(fraction);
        },
      })
        .then((accepted) => {
          if (started !== attempt.current) return;
          // The revision the server reports after the upload, kept so the next
          // mutation is not refused as stale. Not a save.
          setLocalRevision(accepted.sessionRevision);
          setProgress(null);
          setPhase('processing');
          setPending({ assetId: accepted.assetId, replacingElementId: replacing });
        })
        .catch(() => {
          if (started !== attempt.current) return;
          setProgress(null);
          setPhase('idle');
          setFailure('upload-failed');
        });
    },
    [localRevision, replacingElementId, sessionId],
  );

  return {
    phase,
    progress,
    failure,
    failedReplacement,
    revision: localRevision,
    chooseFile,
    dismissFailure: useCallback(() => {
      setFailure(null);
    }, []),
  };
}

/** Whether an answer ends the wait. Both terminal states do; nothing else. */
function isSettled(state: string): boolean {
  return (
    state === DesignSessionAssetStatusResponseState.READY ||
    state === DesignSessionAssetStatusResponseState.REJECTED
  );
}

/** Builds the candidate and rules on it. Never commits; never repairs. */
function place(
  ready: {
    readonly assetId: string;
    readonly derivativeId?: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mediaType?: string;
    readonly byteSize?: number;
  },
  pending: PendingUpload,
  document: DesignDocument,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): ReturnType<typeof ruleOnImageCandidate> {
  const media = mediaOf(ready);
  // `READY` without the whole quartet is a contract the server does not publish;
  // treating a partial one as placeable would build an element from a number
  // nobody measured.
  if (media === null) return { ok: false, refusal: 'ineligible-media' };

  if (pending.replacingElementId !== null) {
    return ruleOnImageCandidate(
      withReplacedImage(document, pending.replacingElementId, media),
      pending.replacingElementId,
      media,
      scope,
      limits,
    );
  }

  const elementId = crypto.randomUUID();
  // `null` means the authority admits no positive box at all — a degenerate Area
  // or an unusable scale, not merely an Area tighter than its own rectangle,
  // which `APP3-S06-C1` places at the smaller valid size. Nothing is inserted,
  // and the refusal is the one the customer already understands.
  const candidate = withNewImage(document, elementId, media, scope, limits);
  if (candidate === null) return { ok: false, refusal: 'too-large-for-area' };

  return ruleOnImageCandidate(candidate, elementId, media, scope, limits);
}

function mediaOf(ready: {
  readonly assetId: string;
  readonly derivativeId?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly mediaType?: string;
  readonly byteSize?: number;
}): StudioImageMedia | null {
  const { assetId, derivativeId, widthPx, heightPx, mediaType, byteSize } = ready;
  if (derivativeId === undefined || mediaType === undefined) return null;
  if (widthPx === undefined || heightPx === undefined || byteSize === undefined) return null;
  return { assetId, derivativeId, widthPx, heightPx, mediaType, byteSize };
}
