'use client';

/**
 * The image inspector (`APP3-S06`, `608:343` / `608:393` / `608:441` / `608:503`).
 *
 * Four states, and the whole point is that they are four rather than one: the
 * four approved frames are *uploading*, *normalizing*, *ready and placed* and
 * *failed inspection*, and a panel that collapsed them would leave a customer
 * unable to tell a slow upload from an image the server refused.
 *
 * Two of those states are only distinguishable because `APP3-S06` added the
 * status projection. `APP3-B06C` answers one indistinguishable 404 for every
 * private miss — correctly, because a delivery route that explained itself would
 * be an enumeration oracle — so nothing here polls it for progress.
 *
 * ## What this panel offers, and what it does not
 *
 * Choose an image, and replace the selected one. That is `APP3-D01`'s whole S06
 * assignment. There is no crop, no flip, no opacity, no background removal and no
 * filter control: the Studio spec lists them as eventual image capabilities and
 * none of them is delivered here, so offering a disabled one would promise a
 * checkpoint nobody has reviewed. There is no delete either — removing an element
 * belongs with the layer controls `APP3-S04` owns.
 *
 * Nothing here saves. No autosave call, no revision badge, no saved indicator:
 * an upload changes the in-memory working document and the client's idea of the
 * Session revision, and `APP3-S10` owns persistence.
 */
import { useRef } from 'react';

import type { StudioImageFailure, UseStudioImageResult } from '../hooks/use-studio-image';
import { STUDIO_IMAGE_COPY } from '../model/studio-image-copy';
import { UPLOADABLE_IMAGE_ACCEPT } from '../model/studio-image-file';

/**
 * The upload controller is a **prop**, not a hook call here.
 *
 * It has to be, and a real browser is what proved it. The tier decides which of
 * this component's two mounts renders, so resizing past a breakpoint unmounts
 * one and mounts the other — and a controller owned by the component went with
 * it, taking the Session revision the last upload returned. The next upload then
 * presented the revision the Session was bootstrapped with and `APP3-B06B`
 * refused it `409 CONFLICT`, correctly.
 *
 * A local revision is Session state, not inspector state, so it is owned above
 * the tier switch by `StudioStageScreen` — exactly where the transform
 * controller already lives — and every mount reads the same one.
 */
export interface StudioImageInspectorProps {
  readonly image: UseStudioImageResult;
  /** Whether the current selection is an image this panel may replace. */
  readonly replaceable: boolean;
  readonly sessionId: string | null;
}

const STATUS_ID = 'studio-image-status';

export function StudioImageInspector({ image, replaceable, sessionId }: StudioImageInspectorProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const busy = image.phase !== 'idle';

  return (
    <section className="studio-image" aria-label={STUDIO_IMAGE_COPY.panelLabel}>
      <h2 className="studio-image__heading">{STUDIO_IMAGE_COPY.panelLabel}</h2>

      {/*
        A real file input, labelled by the button that opens it. The input is
        visually hidden rather than absent: a hidden-but-present input keeps the
        native picker, the `accept` filter and keyboard activation, while a
        custom control drawn over an absent one has none of them.
      */}
      <input
        ref={input}
        type="file"
        className="studio-image__file"
        data-testid="studio-image-file"
        accept={UPLOADABLE_IMAGE_ACCEPT}
        disabled={busy || sessionId === null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The value is cleared so choosing the *same* file twice fires a second
          // change event. Without it, retrying after a refusal silently does
          // nothing, which reads as a broken button.
          event.target.value = '';
          if (file !== undefined) image.chooseFile(file);
        }}
      />

      <button
        type="button"
        className="studio-image__choose"
        data-testid="studio-image-choose"
        disabled={busy || sessionId === null}
        aria-describedby={STATUS_ID}
        onClick={() => input.current?.click()}
      >
        {replaceable ? STUDIO_IMAGE_COPY.replaceLabel : STUDIO_IMAGE_COPY.chooseLabel}
      </button>

      <p className="studio-image__hint">{STUDIO_IMAGE_COPY.chooseHint}</p>

      {/*
        One live region for the whole journey. `role="status"` rather than
        `alert` for progress, because an assertive announcement on every poll
        would interrupt a screen-reader user repeatedly; the refusal below is the
        one that interrupts.
      */}
      <p
        className="studio-image__status"
        id={STATUS_ID}
        role="status"
        data-testid="studio-image-status"
      >
        {statusCopy(image.phase, image.progress)}
      </p>

      {image.phase === 'processing' ? (
        <p className="studio-image__hint" data-testid="studio-image-processing-hint">
          {STUDIO_IMAGE_COPY.processingHint}
        </p>
      ) : null}

      {image.failure === null ? null : (
        <p className="studio-image__refusal" role="alert" data-testid="studio-image-refusal">
          {refusalCopy(image.failure, image.failedReplacement)}
        </p>
      )}
    </section>
  );
}

/** What the customer is waiting for. Never a fabricated percentage. */
function statusCopy(phase: 'idle' | 'uploading' | 'processing', progress: number | null): string {
  if (phase === 'uploading') {
    return progress === null
      ? STUDIO_IMAGE_COPY.uploading
      : STUDIO_IMAGE_COPY.uploadingPercent(Math.round(progress * 100));
  }
  if (phase === 'processing') return STUDIO_IMAGE_COPY.processing;
  return '';
}

/**
 * One sentence per refusal, because they are different facts.
 *
 * The inspection rejection is deliberately generic: the server publishes no safe
 * reason code for a Session upload, and naming one would be inventing it. The
 * decode error, the file name and the worker's message never reach here at all.
 */
function refusalCopy(failure: StudioImageFailure, replacing: boolean): string {
  switch (failure) {
    case 'type':
      return STUDIO_IMAGE_COPY.rejectedType;
    case 'size':
      return STUDIO_IMAGE_COPY.rejectedSize;
    case 'inspection-rejected':
      return STUDIO_IMAGE_COPY.rejectedInspection;
    case 'status-failed':
      return STUDIO_IMAGE_COPY.statusFailed;
    case 'outside-embroidery-area':
    case 'too-large-for-area':
    case 'ineligible-media':
    case 'too-many-elements':
    case 'invalid-candidate':
    case 'unreadable-candidate':
      // The design is untouched either way; what differs is what that means.
      return replacing ? STUDIO_IMAGE_COPY.replacementRefused : STUDIO_IMAGE_COPY.placementRefused;
    default:
      return STUDIO_IMAGE_COPY.uploadFailed;
  }
}
