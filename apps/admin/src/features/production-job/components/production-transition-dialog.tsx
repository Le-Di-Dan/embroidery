'use client';

import { useId } from 'react';

import type {
  AdminProductionJobDetailResponse,
  AdminProductionTransitionResultResponse,
} from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { presentProductionStatus } from '../../../shared/presentation/production-status';
import { CANCELLATION_REASON_MAX_LENGTH } from '../model/cancellation-reason';
import {
  requiresCancellationReason,
  type ProductionJobAction,
} from '../model/production-job-actions';
import { toReservationView } from '../model/production-job-reservation';
import { PRODUCTION_TRANSITION_COPY as COPY } from '../model/production-transition-copy';
import { useProductionTransition } from '../hooks/use-production-transition';
import { ProductionJobDialog } from './production-job-dialog';
import { ProductionTransitionEffects } from './production-transition-effects';
import {
  ProductionSubmittingNotes,
  ProductionTransitionNotes,
} from './production-transition-notes';

interface ProductionTransitionDialogProps {
  readonly job: AdminProductionJobDetailResponse;
  readonly action: ProductionJobAction;
  readonly onClose: () => void;
  readonly onCommitted: (result: AdminProductionTransitionResultResponse) => void;
}

/** The dialog heading for one action and phase (`786:180` renames it while sending). */
function headingOf(action: ProductionJobAction, fromStatus: string, submitting: boolean): string {
  if (action === 'start') return submitting ? COPY.start.submittingTitle : COPY.start.title;
  if (action === 'complete') {
    return submitting ? COPY.complete.submittingTitle : COPY.complete.title;
  }
  if (submitting) return COPY.cancel.submittingTitle;
  return fromStatus === 'STARTED' ? COPY.cancel.titleFromStarted : COPY.cancel.titleFromPlanned;
}

function confirmLabelOf(action: ProductionJobAction): string {
  if (action === 'start') return COPY.start.confirm;
  if (action === 'complete') return COPY.complete.confirm;
  return COPY.cancel.confirm;
}

/**
 * One guarded transition, from confirmation to commit or refusal (`786:3`,
 * `786:39`, `786:70`, `786:110`, `786:150`, `786:177`).
 *
 * ## Nothing is optimistic and nothing is resent
 *
 * The dialog shows the *read* state throughout. On success the hook re-reads the
 * job and invalidates the queue before the caller is told anything, so the pill
 * behind the dialog changes because the server said so. On a refusal it shows
 * one focused message chosen by the published code, reloads job truth, and
 * offers a way back to the form — never an automatic second attempt.
 *
 * ## Only cancellation has a field, and it is required
 *
 * Start and complete send exactly `{to}`: the contract refuses a `reason`
 * alongside either, which is why neither has an input rather than an optional
 * one. Cancellation sends `{to, reason}` and blocks a blank or whitespace-only
 * reason in place, because that request could only ever come back a `400`.
 */
export function ProductionTransitionDialog({
  job,
  action,
  onClose,
  onCommitted,
}: ProductionTransitionDialogProps) {
  const controller = useProductionTransition({ jobId: job.jobId, action, onCommitted });
  const describedBy = useId();
  const reasonId = useId();
  const reasonErrorId = useId();

  const submitting = controller.phase === 'submitting';
  const refused = controller.phase === 'refused';
  const summary = job.reservationSummary;
  const customerOwnedOnly =
    summary !== undefined && toReservationView(summary).mode === 'customerOwned';
  const statusLabel = presentProductionStatus(job.status).label;
  const shortJobId = truncateIdentifier(job.jobId);

  const subtitle = submitting
    ? COPY.common.submittingSubtitle(shortJobId)
    : action === 'cancel'
      ? COPY.common.subtitleWithStatus(shortJobId, statusLabel)
      : COPY.common.subtitleWithOrder(shortJobId, job.orderCode);

  const refusalCopy = controller.refusal === null ? null : COPY.refusals[controller.refusal];

  return (
    <ProductionJobDialog
      title={headingOf(action, job.status, submitting)}
      subtitle={subtitle}
      describedBy={describedBy}
      testId={`production-transition-dialog-${action}`}
      // Dismissal is ignored while the command is in flight: the server's
      // answer is the only thing that says whether the job moved.
      onDismiss={submitting ? () => undefined : onClose}
    >
      {refusalCopy === null ? (
        <>
          <ProductionTransitionEffects action={action} fromStatus={job.status} />
          {submitting ? (
            <ProductionSubmittingNotes />
          ) : (
            <ProductionTransitionNotes
              action={action}
              fromStatus={job.status}
              customerOwnedOnly={customerOwnedOnly}
            />
          )}

          {requiresCancellationReason(action) && !submitting ? (
            <div className="job-field">
              <label className="job-field__label" htmlFor={reasonId}>
                {COPY.cancel.reasonLabel}
                <span className="job-field__required">{COPY.cancel.reasonRequiredBadge}</span>
              </label>
              <textarea
                id={reasonId}
                className={
                  controller.reasonError === null
                    ? 'job-field__input'
                    : 'job-field__input job-field__input--invalid'
                }
                value={controller.reason}
                maxLength={CANCELLATION_REASON_MAX_LENGTH}
                rows={3}
                aria-invalid={controller.reasonError !== null}
                aria-describedby={controller.reasonError === null ? undefined : reasonErrorId}
                data-testid="production-cancel-reason"
                onChange={(event) => {
                  controller.setReason(event.target.value);
                }}
              />
              {controller.reasonError === null ? (
                <p className="job-field__help">{COPY.cancel.reasonHelp}</p>
              ) : (
                <p className="job-field__error" id={reasonErrorId} role="alert">
                  {controller.reasonError === 'required'
                    ? COPY.cancel.reasonMissing
                    : COPY.cancel.reasonTooLong(CANCELLATION_REASON_MAX_LENGTH)}
                </p>
              )}
              {controller.reasonError === 'required' ? (
                <div className="job-note job-note--error">
                  <p className="job-note__title">{COPY.cancel.blockedTitle}</p>
                  <p className="job-note__body">{COPY.cancel.blockedBody}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="job-dialog__footer">
            <button
              type="button"
              className="job-dialog__button"
              disabled={submitting}
              data-testid="production-transition-dismiss"
              onClick={onClose}
            >
              {requiresCancellationReason(action) ? COPY.common.back : COPY.common.dismiss}
            </button>
            <button
              type="button"
              className={
                action === 'cancel'
                  ? 'job-dialog__button job-dialog__button--destructive'
                  : 'job-dialog__button job-dialog__button--primary'
              }
              disabled={submitting}
              aria-busy={submitting}
              data-testid="production-transition-confirm"
              onClick={controller.submit}
            >
              {submitting ? COPY.common.submitting : confirmLabelOf(action)}
            </button>
          </div>
          <p className="job-dialog__live" role="status" aria-live="polite">
            {submitting ? COPY.common.submitting : ''}
          </p>
        </>
      ) : (
        <div className="job-refusal" role="alert" data-testid="production-transition-refusal">
          <p className="job-refusal__title">{refusalCopy.title}</p>
          <p className="job-refusal__body">{refusalCopy.body}</p>
          <p className="job-refusal__reload">{COPY.conflict.reloadedNote}</p>
          <div className="job-dialog__footer">
            <button
              type="button"
              className="job-dialog__button"
              data-testid="production-transition-refusal-close"
              onClick={onClose}
            >
              {COPY.conflict.close}
            </button>
            {refused && controller.refusal === 'reasonRequired' ? (
              <button
                type="button"
                className="job-dialog__button job-dialog__button--primary"
                data-testid="production-transition-refusal-edit"
                onClick={controller.dismissRefusal}
              >
                {COPY.common.back}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </ProductionJobDialog>
  );
}
