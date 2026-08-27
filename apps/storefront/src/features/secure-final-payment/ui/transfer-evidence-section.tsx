'use client';

import { useId, useRef } from 'react';

import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { EVIDENCE_MEDIA_TYPES, MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import type { TransferEvidence } from '../hooks/use-transfer-evidence';
import { EvidenceList } from './evidence-list';
import { FinalPaymentNote } from './final-payment-note';
import { FinalPaymentPill } from './final-payment-pill';

/**
 * `817:16` (not sent) and `817:31` (sent) — optional transfer evidence, in one
 * section.
 *
 * The approved package draws two frames here and they are the *same* section in
 * two states, not two sections. So this renders one and lets the server's list
 * and the upload's own state choose what it says.
 *
 * ## The wording is neutral, and that is the checkpoint's rule
 *
 * `APP9-S01` §11 is explicit: the reused backend route is literally named
 * `/public/orders/deposit/evidence` (`FU-APP9-B02-01`), and that wording may not
 * reach the UI. Every sentence here comes from this feature's own catalog, which
 * contains no occurrence of *đặt cọc*. `817:24` fixes the intake's own words —
 * *Tải ảnh giao dịch (không bắt buộc)* — and `817:18` the heading, *Ảnh xác nhận
 * chuyển khoản*.
 *
 * ## Optional is said three times, and never contradicted
 *
 * The badge beside the title, the lead line and the closing note all say the
 * same thing: a correct transfer with no image at all is verified in exactly the
 * same way. There is no *tải ảnh để xác nhận thanh toán* here, and `817:29`'s
 * warning — that sending an image is not the payment being confirmed — is
 * rendered as part of the section rather than as an aside somewhere else.
 *
 * ## The section only exists once an attempt does
 *
 * Evidence is addressed by `attemptId` and §12 forbids trusting an arbitrary
 * one, so the caller mounts this only after an initiation has returned. That is
 * the "naturally require initiation first" §12 asks for: there is no code path
 * here that could construct an id, and no input through which one could be
 * supplied.
 *
 * ## The quota is the server's count
 *
 * `n / 5` reads the length of the last status response. At five, the control is
 * replaced by a disabled button that says so and the existing rows are untouched
 * — there is no client-side delete to make room, because the set is append-only.
 * If the server refuses because the count was stale, the hook re-reads the list
 * rather than arguing with it.
 *
 * ## Errors are attached to the control that produced them
 *
 * `aria-describedby` points the file input at its own error note, rather than
 * floating a toast in a corner. Progress is announced politely with the
 * percentage as text, because a bar alone is invisible to a screen reader.
 */
interface TransferEvidenceSectionProps {
  readonly evidence: TransferEvidence;
  /** False once the balance is settled, or five images already exist. */
  readonly intakeOpen: boolean;
}

export function TransferEvidenceSection({ evidence, intakeOpen }: TransferEvidenceSectionProps) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quotaReached = evidence.submittedCount >= MAX_EVIDENCE_PER_ATTEMPT;

  return (
    <section className="secure-final-payment__card" aria-labelledby="final-payment-evidence">
      <div className="secure-final-payment__evidence-head">
        <h2 className="secure-final-payment__card-title" id="final-payment-evidence">
          {COPY.evidence.title}
        </h2>
        <FinalPaymentPill tone="NEUTRAL" label={COPY.evidence.optionalBadge} />
        <span className="secure-final-payment__quota">
          {`${evidence.submittedCount} / ${MAX_EVIDENCE_PER_ATTEMPT}`}
        </span>
      </div>

      <p className="secure-final-payment__body">{COPY.evidence.lead}</p>

      <p className="secure-final-payment__visually-hidden" aria-live="polite">
        {evidence.uploading ? uploadingAnnouncement() : ''}
      </p>

      {evidence.loading ? (
        <p className="secure-final-payment__fine-print">{COPY.evidence.loading}</p>
      ) : (
        <EvidenceList items={evidence.items} />
      )}

      {evidence.uploading ? renderUploading() : null}
      {intakeOpen ? renderIntake() : renderClosedIntake()}
      {evidence.failure === undefined ? null : renderFailure()}

      <FinalPaymentNote tone="WARNING">{COPY.evidence.notProof}</FinalPaymentNote>
      <p className="secure-final-payment__fine-print">{COPY.evidence.appendOnlyNote}</p>
    </section>
  );

  function uploadingAnnouncement(): string {
    return evidence.progress === undefined
      ? COPY.live.uploading
      : `${COPY.live.uploading} ${evidence.progress}%`;
  }

  function renderUploading() {
    return (
      <div className="secure-final-payment__uploading">
        <FinalPaymentPill tone="PROGRESS" label={COPY.evidence.uploadingBadge} />
        {evidence.progress === undefined ? null : (
          <span className="secure-final-payment__uploading-percent">{`${evidence.progress}%`}</span>
        )}
        {evidence.pendingFileName === undefined ? null : (
          <span className="secure-final-payment__uploading-name">{evidence.pendingFileName}</span>
        )}
        <FinalPaymentNote tone="INFO">{COPY.evidence.uploadingNote}</FinalPaymentNote>
      </div>
    );
  }

  function renderIntake() {
    const label = evidence.submittedCount === 0 ? COPY.evidence.choose : COPY.evidence.more;
    return (
      <div className="secure-final-payment__dropzone">
        <p className="secure-final-payment__dropzone-title">{COPY.evidence.dropzoneTitle}</p>
        <p className="secure-final-payment__fine-print">{COPY.evidence.dropzoneHint}</p>
        <label className="secure-final-payment__field-label" htmlFor={inputId}>
          {COPY.evidence.constraints}
        </label>
        <input
          className="secure-final-payment__file-input"
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
            // otherwise press it and see nothing happen.
            event.target.value = '';
            if (file !== undefined) evidence.chooseFile(file);
          }}
        />
        <button
          type="button"
          className="secure-final-payment__button"
          disabled={evidence.uploading}
          onClick={() => inputRef.current?.click()}
        >
          {evidence.uploading ? COPY.evidence.uploadingDisabled : label}
        </button>
      </div>
    );
  }

  function renderClosedIntake() {
    if (!quotaReached) {
      // Closed for a reason the surrounding page already states — the balance is
      // settled. Repeating it here would be a third sentence about the same fact.
      return null;
    }
    return (
      <div className="secure-final-payment__dropzone secure-final-payment__dropzone--closed">
        <button type="button" className="secure-final-payment__button" disabled>
          {COPY.evidence.quotaFull}
        </button>
        <FinalPaymentNote tone="WARNING">{COPY.evidence.quotaNote}</FinalPaymentNote>
      </div>
    );
  }

  function renderFailure() {
    const failure = evidence.failure;
    if (failure === undefined) return null;
    return (
      <div className="secure-final-payment__evidence-error">
        <FinalPaymentNote tone="DANGER" id={errorId}>
          {COPY.uploadFailure[failure]}
        </FinalPaymentNote>
        {evidence.retryable ? (
          <button
            type="button"
            className="secure-final-payment__button"
            onClick={evidence.retryUpload}
          >
            {COPY.uploadFailure.retry}
          </button>
        ) : null}
      </div>
    );
  }
}
