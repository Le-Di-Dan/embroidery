'use client';

import { useId, useRef } from 'react';

import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { EVIDENCE_MEDIA_TYPES, MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import type { TransferEvidence } from '../hooks/use-transfer-evidence';
import { DepositNote } from './deposit-note';
import { DepositStatusPill } from './deposit-status-pill';
import { EvidenceList } from './evidence-list';

/**
 * `748:3` through `748:144` — optional transfer evidence, in one panel.
 *
 * The approved package draws six frames here — empty, uploading, inspecting,
 * accepted, rejected and quota reached — and they are the *same* panel in six
 * states, not six panels. So this renders one and lets the server's list and the
 * upload's own state choose what it says.
 *
 * ## Optional is said three times, and never contradicted
 *
 * The badge beside the title, the *tiếp tục mà không gửi ảnh* line and the
 * closing note all say the same thing: a correct transfer with no image at all
 * is verified in exactly the same way. §12 forbids any wording implying the
 * opposite — there is no "tải ảnh để xác nhận thanh toán" here, and the panel
 * carries the approved warning that an image's status is the *image's* and
 * never the payment's.
 *
 * ## The quota is the server's count
 *
 * `n / 5` reads the length of the last status response. At five, the control is
 * replaced by a disabled button that says so and the existing rows are untouched
 * — §18 forbids both claiming the payment cannot be verified and offering a
 * client-side delete to make room. If the server refuses because the count was
 * stale, the hook re-reads the list rather than arguing with it.
 *
 * ## Errors are attached to the control that produced them
 *
 * `aria-describedby` points the file input at its own error note (`753:158`),
 * rather than floating a toast in a corner. Progress is announced politely with
 * the percentage as text (`753:161`), because a bar alone is invisible to a
 * screen reader.
 */
interface EvidencePanelProps {
  readonly evidence: TransferEvidence;
  /** False once the deposit is confirmed, the attempt is over, or five exist. */
  readonly intakeOpen: boolean;
  /** False on the confirmation, where the list is history rather than an ask. */
  readonly showReminder: boolean;
}

export function EvidencePanel({ evidence, intakeOpen, showReminder }: EvidencePanelProps) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quotaReached = evidence.submittedCount >= MAX_EVIDENCE_PER_ATTEMPT;

  return (
    <section className="secure-deposit__card" aria-labelledby="secure-deposit-evidence">
      <div className="secure-deposit__evidence-head">
        <h2 className="secure-deposit__card-title" id="secure-deposit-evidence">
          {COPY.evidence.title}
        </h2>
        <DepositStatusPill tone="NEUTRAL" label={COPY.evidence.optionalBadge} />
        <span className="secure-deposit__quota">
          {`${evidence.submittedCount} / ${MAX_EVIDENCE_PER_ATTEMPT}`}
        </span>
      </div>

      {showReminder ? (
        <div className="secure-deposit__reminder">
          <p className="secure-deposit__reminder-headline">{COPY.reminder.headline}</p>
          <p className="secure-deposit__body">{COPY.reminder.body}</p>
          <DepositNote tone="INFO">{COPY.reminder.optional}</DepositNote>
        </div>
      ) : null}

      <p className="secure-deposit__visually-hidden" aria-live="polite">
        {evidence.uploading ? uploadingAnnouncement() : ''}
      </p>

      {evidence.loading ? (
        <p className="secure-deposit__fine-print">{COPY.evidence.loading}</p>
      ) : (
        <EvidenceList items={evidence.items} />
      )}

      {evidence.uploading ? renderUploading() : null}
      {intakeOpen ? renderIntake() : renderClosedIntake()}
      {evidence.failure === undefined ? null : renderFailure()}

      <DepositNote tone="WARNING">{COPY.evidence.notPaymentNote}</DepositNote>
      <p className="secure-deposit__fine-print">{COPY.evidence.appendOnlyNote}</p>
    </section>
  );

  function uploadingAnnouncement(): string {
    return evidence.progress === undefined
      ? COPY.live.uploading
      : `${COPY.live.uploading} ${evidence.progress}%`;
  }

  function renderUploading() {
    return (
      <div className="secure-deposit__uploading">
        <DepositStatusPill tone="PROGRESS" label={COPY.evidence.uploadingBadge} />
        {evidence.progress === undefined ? null : (
          <span className="secure-deposit__uploading-percent">{`${evidence.progress}%`}</span>
        )}
        {evidence.pendingFileName === undefined ? null : (
          <span className="secure-deposit__uploading-name">{evidence.pendingFileName}</span>
        )}
        <DepositNote tone="INFO">{COPY.evidence.uploadingNote}</DepositNote>
      </div>
    );
  }

  function renderIntake() {
    const label = evidence.submittedCount === 0 ? COPY.evidence.choose : COPY.evidence.more;
    return (
      <div className="secure-deposit__dropzone">
        <p className="secure-deposit__dropzone-title">{COPY.evidence.dropzoneTitle}</p>
        <label className="secure-deposit__field-label" htmlFor={inputId}>
          {COPY.evidence.constraints}
        </label>
        <input
          className="secure-deposit__file-input"
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
          className="secure-deposit__button"
          disabled={evidence.uploading}
          onClick={() => inputRef.current?.click()}
        >
          {evidence.uploading ? COPY.evidence.uploadingDisabled : label}
        </button>
        <p className="secure-deposit__fine-print">
          <span className="secure-deposit__skip-title">{COPY.evidence.skipTitle}</span>{' '}
          {COPY.evidence.skipBody}
        </p>
      </div>
    );
  }

  function renderClosedIntake() {
    if (!quotaReached) {
      // Closed for a reason the surrounding panel already states — the deposit is
      // confirmed, or the attempt is over. Repeating it here would be a third
      // sentence about the same fact.
      return null;
    }
    return (
      <div className="secure-deposit__dropzone secure-deposit__dropzone--closed">
        <button type="button" className="secure-deposit__button" disabled>
          {COPY.evidence.quotaFull}
        </button>
        <DepositNote tone="WARNING">{COPY.evidence.quotaNote}</DepositNote>
      </div>
    );
  }

  function renderFailure() {
    const failure = evidence.failure;
    if (failure === undefined) return null;
    return (
      <div className="secure-deposit__evidence-error">
        <DepositNote tone="DANGER" id={errorId}>
          {COPY.uploadFailure[failure]}
        </DepositNote>
        {evidence.retryable ? (
          <button type="button" className="secure-deposit__button" onClick={evidence.retryUpload}>
            {COPY.uploadFailure.retry}
          </button>
        ) : null}
      </div>
    );
  }
}
