'use client';

import { useId, useRef } from 'react';

import type { TransferEvidence } from '../hooks/use-transfer-evidence';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { EVIDENCE_MEDIA_TYPES, MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import { EvidenceList } from './evidence-list';
import { OrderNote } from './order-note';
import { OrderStatusPill } from './order-status-pill';

/**
 * `910:330`…`910:334` — optional transfer evidence, in one section.
 *
 * ## The wording is neutral, and that is the checkpoint's rule (§21)
 *
 * The reused backend route is literally named `/public/orders/deposit/evidence`
 * (`FU-APP9-B02-01`), and that wording may not reach the UI. Every sentence
 * here comes from this feature's own catalog, which contains no occurrence of
 * *đặt cọc* — a Ready-Made order has exactly one obligation and no deposit at
 * all (`BR-029`).
 *
 * ## Optional is said twice, and never contradicted
 *
 * The badge beside the title and the lead line (`910:332`) say the same thing:
 * a correct transfer with no image at all is verified in exactly the same way.
 * There is no *gửi ảnh để xác nhận thanh toán* here, and §22's rule — that
 * sending an image is not the payment being confirmed — is rendered as part of
 * the section rather than as an aside somewhere else.
 *
 * ## The section only exists once a current attempt does (§23)
 *
 * Evidence is addressed by `attemptId` and an arbitrary one may never be
 * trusted, so the caller mounts this only after an initiation has returned an
 * attempt that still matches the live obligation. There is no code path here
 * that could construct an id, and no input through which one could be supplied
 * — which is what makes cross-order evidence impossible from this screen rather
 * than merely unattempted.
 *
 * ## The quota is the server's count
 *
 * `n / 5` reads the length of the last status response. At five the control is
 * replaced by a line that says so and the existing rows are untouched — there
 * is no client-side delete to make room, because the set is append-only. If the
 * server refuses because the count was stale, the hook re-reads the list rather
 * than arguing with it. The `5` is `APP7-B05`'s own limit, inherited under
 * `917:420`'s *cùng giới hạn* directive rather than transcribed from the mock's
 * `(tối đa 3)` — see `model/transfer-evidence.ts`.
 *
 * ## Errors are attached to the control that produced them
 *
 * `aria-describedby` points the file input at its own error note, rather than
 * floating a toast in a corner. Progress is announced politely with the
 * percentage as text, because a bar alone is invisible to a screen reader.
 */
interface EvidenceSectionProps {
  readonly evidence: TransferEvidence;
  /** False once the payment block closes, or five images already exist. */
  readonly intakeOpen: boolean;
}

export function EvidenceSection({ evidence, intakeOpen }: EvidenceSectionProps) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quotaReached = evidence.submittedCount >= MAX_EVIDENCE_PER_ATTEMPT;

  return (
    <section className="secure-order__card" aria-labelledby="secure-order-evidence">
      <div className="secure-order__evidence-head">
        <h2 className="secure-order__card-title" id="secure-order-evidence">
          {COPY.evidence.title}
        </h2>
        <OrderStatusPill tone="NEUTRAL" label={COPY.evidence.optionalBadge} />
        <span className="secure-order__quota">
          {`${evidence.submittedCount} / ${MAX_EVIDENCE_PER_ATTEMPT}`}
        </span>
      </div>

      <p className="secure-order__body">{COPY.evidence.lead}</p>

      <p className="secure-order__visually-hidden" aria-live="polite">
        {announcement()}
      </p>

      {renderIntake()}

      <EvidenceList items={evidence.items} />

      {/* §22 — rendered inside the section, never as fine print elsewhere. */}
      <OrderNote tone="WARNING">{COPY.evidence.truth}</OrderNote>
    </section>
  );

  function announcement(): string {
    if (evidence.uploading) {
      return evidence.progress === undefined
        ? COPY.evidence.uploading
        : `${COPY.evidence.uploading} ${evidence.progress}%`;
    }
    return '';
  }

  function renderIntake() {
    if (!intakeOpen) {
      // The list above stays as history; only the control goes away. A disabled
      // file input would still read as an affordance on a settled or cancelled
      // order, which §30 forbids.
      return quotaReached ? (
        <p className="secure-order__fine-print">{COPY.evidence.quotaReached}</p>
      ) : null;
    }

    return (
      <div className="secure-order__uploader">
        <p className="secure-order__fine-print">
          {`${COPY.evidence.choosePrefix} ${MAX_EVIDENCE_PER_ATTEMPT}${COPY.evidence.chooseSuffix}`}
        </p>
        {/*
          The label is the visible control and the input is clipped behind it
          (`V01-UX-014`, §18). It is still a real file input: still focusable,
          still opening the browser's own dialog, still carrying its `accept`
          list and its label association. Only the painted box is replaced,
          because the native one reads `Choose File` — in English, on the
          Vietnamese payment surface.
        */}
        <label className="secure-order__uploader-label" htmlFor={inputId}>
          {COPY.evidence.chooseAction}
        </label>
        <input
          className="secure-order__uploader-input"
          id={inputId}
          ref={inputRef}
          type="file"
          accept={EVIDENCE_MEDIA_TYPES.join(',')}
          disabled={evidence.uploading}
          {...(evidence.failure === undefined ? {} : { 'aria-describedby': errorId })}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // The input is cleared so choosing the *same* file again still fires
            // a change event — a customer retrying after a refusal would
            // otherwise press the control and have nothing happen.
            event.target.value = '';
            if (file !== undefined) evidence.chooseFile(file);
          }}
        />
        <p className="secure-order__fine-print">{COPY.evidence.constraint}</p>

        {/*
          The selected-file state §18 asks for. The native control said which
          file had been chosen — in English, and only until the page moved on —
          and clipping it took that away, so the surface says it instead.
        */}
        {evidence.pendingFileName === undefined ? null : (
          <p className="secure-order__uploader-selection">
            {evidence.uploading
              ? `${COPY.evidence.uploading} ${evidence.pendingFileName}`
              : COPY.evidence.selectedFile(evidence.pendingFileName)}
          </p>
        )}

        {evidence.uploading && evidence.pendingFileName === undefined ? (
          <p className="secure-order__body">{COPY.evidence.uploading}</p>
        ) : null}

        {evidence.failure === undefined ? null : (
          <>
            <OrderNote tone="DANGER" id={errorId}>
              {COPY.evidenceFailure[evidence.failure]}
            </OrderNote>
            {evidence.retryable ? (
              <button type="button" className="secure-order__button" onClick={evidence.retryUpload}>
                {COPY.evidenceFailure.retry}
              </button>
            ) : null}
          </>
        )}
      </div>
    );
  }
}
