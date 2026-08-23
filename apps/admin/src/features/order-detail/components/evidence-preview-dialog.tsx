'use client';

import { useCallback } from 'react';

import type { AdminPaymentEvidenceResponse } from '@embroidery/api-client';

import { formatInstant } from '../../../shared/presentation/instant';
import { useEvidencePreview } from '../hooks/use-evidence-preview';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { DefinitionRow } from './definition-row';
import { PaymentDialog } from './payment-dialog';

interface EvidencePreviewDialogProps {
  readonly orderId: string;
  /** Only the images the payment read marked eligible; nothing else is navigable. */
  readonly eligible: readonly AdminPaymentEvidenceResponse[];
  readonly index: number;
  readonly onNavigate: (index: number) => void;
  readonly onClose: () => void;
  readonly onMetadataStale: () => void;
}

/**
 * The evidence lightbox (`742:3`).
 *
 * ## The image is fetched by association id and rendered from a `blob:` URL
 *
 * `APP7-B06` streams the inspection-approved source the customer uploaded,
 * addressed by the `payment_transfer_evidence` id. Nothing in this component
 * builds a storage URL, exposes the binary endpoint, or offers a download: a
 * `download` link would hand a customer's private banking screenshot to the
 * operator's filesystem, outside every re-check the endpoint performs per
 * request, and the approved frame shows no such affordance.
 *
 * The object URL's whole lifetime is owned by `useEvidencePreview`: created
 * after a successful fetch, revoked when the image is replaced by navigation,
 * when the bytes go away, and on unmount — which is what closing this dialog
 * does. It is never written to storage, never logged, and never held anywhere it
 * could outlive the element rendering it.
 *
 * ## An unavailable image re-reads metadata and writes nothing
 *
 * `previewEligible` was computed when the payment read was taken and the
 * inspection verdict can move underneath it, so a 404 asks the caller to re-read
 * the metadata. It never mutates payment state — opening an image is a read, and
 * a failed read is not a reason to write. A 503 is temporary and gets the one
 * manual retry; a 404 does not, because `APP7-B06` will refuse it again.
 *
 * ## Alt text describes the image, not the id
 *
 * `753:120` asks for useful alternative text. The position within the eligible
 * sequence is what a person can act on ("ảnh giao dịch số 2"); an association id
 * would be noise, and the raw asset id does not exist here at all.
 */
export function EvidencePreviewDialog({
  orderId,
  eligible,
  index,
  onNavigate,
  onClose,
  onMetadataStale,
}: EvidencePreviewDialogProps) {
  const current = eligible[index];
  const evidenceId = current?.evidenceId ?? '';

  const handleUnavailable = useCallback(() => {
    onMetadataStale();
  }, [onMetadataStale]);

  const preview = useEvidencePreview({
    orderId,
    evidenceId,
    enabled: current !== undefined,
    onUnavailable: handleUnavailable,
  });

  if (current === undefined) {
    return null;
  }

  const position = index + 1;
  const hasPrevious = index > 0;
  const hasNext = index < eligible.length - 1;

  return (
    <PaymentDialog
      title={COPY.evidence.dialogTitle}
      describedBy="evidence-preview-meta"
      testId="evidence-preview-dialog"
      onDismiss={onClose}
    >
      <div className="evidence-preview__stage">
        {preview.objectUrl === null ? (
          <p className="evidence-preview__state" role="status" data-testid="evidence-preview-state">
            {preview.isLoading
              ? COPY.evidence.loading
              : preview.failure === 'temporary'
                ? COPY.evidence.temporary
                : COPY.evidence.unavailable}
          </p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- a blob: object
             URL for private bytes cannot go through the Next image optimizer,
             which would need a fetchable public address. */
          <img
            className="evidence-preview__image"
            src={preview.objectUrl}
            alt={COPY.evidence.imageAlt(position)}
            data-testid="evidence-preview-image"
          />
        )}
      </div>

      {preview.failure === 'temporary' ? (
        <button
          type="button"
          className="evidence-preview__retry"
          data-testid="evidence-preview-retry"
          onClick={preview.retry}
        >
          {COPY.evidence.retry}
        </button>
      ) : null}

      <dl className="order-card__definitions" id="evidence-preview-meta">
        <DefinitionRow label={COPY.evidence.metadataSubmittedAt}>
          <time dateTime={current.createdAt}>{formatInstant(current.createdAt)}</time>
        </DefinitionRow>
        <DefinitionRow label={COPY.evidence.metadataMediaType}>{current.mediaType}</DefinitionRow>
      </dl>

      <p className="order-card__note">{COPY.evidence.authorityNote}</p>

      <div className="evidence-preview__actions">
        {/* Real buttons with real labels, never a bare glyph (`753:175`). The
            chevron is decorative and the word carries the name. */}
        <button
          type="button"
          className="evidence-preview__nav"
          disabled={!hasPrevious}
          data-testid="evidence-preview-previous"
          onClick={() => onNavigate(index - 1)}
        >
          <span aria-hidden="true">{'‹ '}</span>
          {COPY.evidence.previousImage}
        </button>
        <span className="evidence-preview__position" data-testid="evidence-preview-position">
          {`${String(position)} / ${String(eligible.length)}`}
        </span>
        <button
          type="button"
          className="evidence-preview__nav"
          disabled={!hasNext}
          data-testid="evidence-preview-next"
          onClick={() => onNavigate(index + 1)}
        >
          {COPY.evidence.nextImage}
          <span aria-hidden="true">{' ›'}</span>
        </button>
        <button
          type="button"
          className="evidence-preview__close"
          data-testid="evidence-preview-close"
          onClick={onClose}
        >
          {COPY.evidence.dialogClose}
        </button>
      </div>
    </PaymentDialog>
  );
}
