'use client';

import { useMemo, type RefObject } from 'react';

import type { CustomerDesignReviewResponse } from '@embroidery/api-client';

import type { SecureDesignReview } from '../hooks/use-secure-design-review';
import { outstandingCount } from '../model/design-review-consent';
import { formatReviewDate } from '../model/design-review-instant';
import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import type { DecisionNotice, ReviewStageKind } from '../model/design-review-state';
import { buildReviewScene } from '../model/review-scene';
import { AgreementList } from './agreement-list';
import { ApproveConfirmDialog } from './approve-confirm-dialog';
import { ApprovedOutcome } from './approved-outcome';
import { DesignPreview } from './design-preview';
import { ReviewActions } from './review-actions';
import { ReviewAlert, type AlertTone } from './review-alert';
import { ReviewStepUpDialog } from './review-step-up-dialog';
import { RevisionFormDialog } from './revision-form-dialog';
import { RevisionRequestedOutcome } from './revision-requested-outcome';

/**
 * The authorized branch of the secure-link shell: the design review itself.
 *
 * The approved package draws one card whose badge, headline, sub-line, banner
 * and controls change together — `707:3`, `709:3`, `709:84`, `709:164`,
 * `710:203` and `713:3` are the same card in six states, not six screens. So
 * this renders one card and lets the stage decide what it says.
 *
 * The artwork, the exact-version strip and the terms are shown in **every**
 * state, including after a decision has committed: a customer looking at an
 * approved design still needs to see what they approved. What changes is
 * whether there is anything to press.
 *
 * ## The exact version is stated on the page, not only in a request body
 *
 * `707:30` puts the version number, the document schema version and the stored
 * document hash beside the artwork, and `APP6-D01` records that the version id
 * and hash sit beside the approve button. They are display of server facts —
 * the hash is read off the response and is never recomputed here — and they are
 * what makes "you are approving *this*" checkable by a person rather than only
 * by a transaction.
 */
const NOTICE_TONE: Readonly<Record<DecisionNotice, AlertTone>> = {
  TRANSIENT: 'WARNING',
  INVALID_TRANSITION: 'WARNING',
  DUPLICATE_OPERATION: 'INFO',
  IDEMPOTENCY_CONFLICT: 'WARNING',
  POLICY_UNAVAILABLE: 'WARNING',
};

interface DesignReviewContentProps {
  readonly review: CustomerDesignReviewResponse;
  readonly controller: SecureDesignReview;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

function liveMessage(kind: ReviewStageKind): string {
  if (kind === 'APPROVING') return COPY.live.approving;
  if (kind === 'REVISION_SUBMITTING') return COPY.live.revisionSubmitting;
  if (kind === 'RECONCILING') return COPY.live.reconciling;
  if (kind === 'STEP_UP') return COPY.stepUp.live;
  if (kind === 'APPROVED') return COPY.approved.live;
  if (kind === 'REVISION_REQUESTED') return COPY.revisionRequested.live;
  if (kind === 'VERSION_MISMATCH') return COPY.mismatch.live;
  if (kind === 'TERMS_CHANGED') return COPY.termsChanged.live;
  return '';
}

function titleOf(kind: ReviewStageKind, version: number): { title: string; subtitle: string } {
  if (kind === 'APPROVED') {
    return { title: COPY.titles.approved, subtitle: COPY.subtitles.approved(version) };
  }
  if (kind === 'REVISION_REQUESTED') {
    return {
      title: COPY.titles.revisionRequested,
      subtitle: COPY.subtitles.revisionRequested(version),
    };
  }
  if (kind === 'VERSION_MISMATCH') {
    return {
      title: COPY.titles.versionMismatch,
      subtitle: COPY.subtitles.versionMismatch(version),
    };
  }
  return { title: COPY.titles.review, subtitle: '' };
}

function badgeOf(kind: ReviewStageKind): string {
  if (kind === 'APPROVED') return COPY.badges.approved;
  if (kind === 'REVISION_REQUESTED') return COPY.badges.revisionRequested;
  if (kind === 'VERSION_MISMATCH') return COPY.badges.versionMismatch;
  if (kind === 'APPROVING' || kind === 'REVISION_SUBMITTING' || kind === 'RECONCILING') {
    return COPY.badges.approving;
  }
  return COPY.badges.review;
}

export function DesignReviewContent({ review, controller, headingRef }: DesignReviewContentProps) {
  const { stage } = controller;
  const kind = stage.kind;
  const previewRenderable = useMemo(() => buildReviewScene(review.document).ok, [review.document]);
  const outstanding = outstandingCount(controller.consent, review.agreements);
  const { title, subtitle } = titleOf(kind, review.version);
  const busy = kind === 'APPROVING' || kind === 'REVISION_SUBMITTING' || kind === 'RECONCILING';

  return (
    <section
      className="secure-design-review"
      aria-labelledby="secure-design-review-title"
      aria-busy={busy}
      data-stage={kind}
    >
      <p className="secure-design-review__visually-hidden" aria-live="polite">
        {liveMessage(kind)}
      </p>

      <p className="secure-design-review__badge">{badgeOf(kind)}</p>
      <h1
        className="secure-design-review__title"
        id="secure-design-review-title"
        ref={headingRef}
        tabIndex={-1}
      >
        {title}
      </h1>
      <p className="secure-design-review__subtitle">
        {subtitle === ''
          ? COPY.subtitles.review(review.version, formatReviewDate(review.sentAt))
          : subtitle}
      </p>

      {renderAlert()}

      <DesignPreview document={review.document} />

      <section className="secure-design-review__exact" aria-label={COPY.exactVersion.legend}>
        <h2 className="secure-design-review__section-title">{COPY.exactVersion.legend}</h2>
        <dl className="secure-design-review__exact-facts">
          <div>
            <dt>{COPY.exactVersion.version(review.version)}</dt>
            <dd>{COPY.exactVersion.schema(review.documentSchemaVersion)}</dd>
          </div>
          <div>
            <dt>{COPY.exactVersion.hashLabel}</dt>
            <dd className="secure-design-review__hash" data-testid="design-review-document-hash">
              {review.documentHash}
            </dd>
          </div>
        </dl>
        <p className="secure-design-review__note">{COPY.exactVersion.note}</p>
      </section>

      <AgreementList
        agreements={review.agreements}
        consent={controller.consent}
        disabled={busy || kind === 'APPROVED' || kind === 'REVISION_REQUESTED'}
        onToggle={controller.setConsent}
      />

      {stage.approved === undefined ? null : (
        <ApprovedOutcome
          outcome={stage.approved}
          acceptedAgreements={stage.intent?.acceptedAgreements ?? []}
        />
      )}
      {stage.revisionRequested === undefined ? null : (
        <RevisionRequestedOutcome outcome={stage.revisionRequested} />
      )}

      <ReviewActions
        stageKind={kind}
        canApprove={controller.consentComplete(review.agreements)}
        outstandingAgreements={outstanding}
        previewRenderable={previewRenderable}
        onApprove={() => {
          controller.requestApprove(review);
        }}
        onRequestRevision={controller.openRevisionForm}
        onReviewLatest={controller.reviewMismatch}
      />

      {renderDialog()}
    </section>
  );

  function renderAlert() {
    if (kind === 'VERSION_MISMATCH') {
      return <ReviewAlert tone="WARNING" title={COPY.mismatch.title} body={COPY.mismatch.body} />;
    }
    if (kind === 'TERMS_CHANGED') {
      return (
        <ReviewAlert tone="WARNING" title={COPY.termsChanged.title} body={COPY.termsChanged.body} />
      );
    }
    if (kind === 'APPROVING') {
      return <ReviewAlert tone="INFO" title={COPY.approving.title} body={COPY.approving.body} />;
    }
    if (stage.notice === undefined) return null;
    const notice = COPY.notices[stage.notice];
    return <ReviewAlert tone={NOTICE_TONE[stage.notice]} title={notice.title} body={notice.body} />;
  }

  function renderDialog() {
    if ((kind === 'APPROVE_CONFIRM' || kind === 'APPROVING') && stage.intent !== undefined) {
      return (
        <ApproveConfirmDialog
          intent={stage.intent}
          onConfirm={controller.confirmApprove}
          onCancel={controller.dismissDecision}
        />
      );
    }
    if (kind === 'STEP_UP') {
      return (
        <ReviewStepUpDialog
          onVerified={controller.stepUpVerified}
          onCancel={controller.dismissDecision}
        />
      );
    }
    if (kind === 'REVISION_FORM' || kind === 'REVISION_SUBMITTING') {
      return (
        <RevisionFormDialog
          versionId={review.designVersionId}
          submitting={kind === 'REVISION_SUBMITTING'}
          onSubmit={controller.submitRevision}
          onCancel={controller.dismissDecision}
        />
      );
    }
    return null;
  }
}
