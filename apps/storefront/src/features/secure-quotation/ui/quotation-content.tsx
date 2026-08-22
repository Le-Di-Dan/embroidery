'use client';

import { useRef, type RefObject } from 'react';

import type { CustomerQuotationResponse } from '@embroidery/api-client';

import { quotationPresentation } from '../model/quotation-presentation';
import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import type { DecisionNotice, QuoteUiState } from '../model/secure-quotation-state';
import type { SecureQuotation } from '../hooks/use-secure-quotation';
import { AcceptConfirmDialog } from './accept-confirm-dialog';
import { AcceptedOutcome } from './accepted-outcome';
import { QuotationActions } from './quotation-actions';
import { QuotationAlert, type AlertTone } from './quotation-alert';
import { QuotationLines } from './quotation-lines';
import { QuotationTotals } from './quotation-totals';
import { QuoteStepUpDialog } from './quote-step-up-dialog';
import { RejectConfirmDialog } from './reject-confirm-dialog';
import { RejectedOutcome } from './rejected-outcome';

/**
 * The authorized branch of the secure-link shell: the quotation itself.
 *
 * The approved package draws one card whose badge, headline, sub-line, banner,
 * small print and controls change together — `700:3`, `701:88`, `701:147`,
 * `702:3`, `702:65` and `702:129` are the same card in six states, not six
 * screens. So this renders one card and asks
 * {@link quotationPresentation} what it says, which keeps the words in a pure
 * function a test can assert directly.
 *
 * The figures are always shown, in every state. A customer looking at a lapsed
 * or superseded offer still needs to see what was quoted; what changes is
 * whether there is anything to press, and on `EXPIRED` the answer is nothing at
 * all — not a disabled button (§13).
 *
 * `now` is sampled once per render rather than ticked. Nothing on this screen
 * counts down: the badge's *còn N ngày* is a courtesy, expiry itself is the
 * server's verdict from the read, and a per-second timer here would be the
 * polling §13 forbids.
 */
const NOTICE_TONE: Readonly<Record<DecisionNotice, AlertTone>> = {
  TRANSIENT: 'WARNING',
  INVALID_TRANSITION: 'WARNING',
  DUPLICATE_OPERATION: 'INFO',
  IDEMPOTENCY_CONFLICT: 'WARNING',
  POLICY_UNAVAILABLE: 'WARNING',
};

interface QuotationContentProps {
  readonly quote: CustomerQuotationResponse;
  readonly controller: SecureQuotation;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

function liveMessage(uiState: QuoteUiState): string {
  if (uiState === 'ACCEPTING') return COPY.live.accepting;
  if (uiState === 'REJECTING') return COPY.live.rejecting;
  if (uiState === 'RECONCILING') return COPY.live.reconciling;
  if (uiState === 'STALE') return COPY.stale.live;
  if (uiState === 'EXPIRED') return COPY.expired.live;
  if (uiState === 'ACCEPTED') return COPY.accepted.live;
  if (uiState === 'REJECTED') return COPY.rejected.live;
  if (uiState === 'STEP_UP') return COPY.stepUp.live;
  return '';
}

export function QuotationContent({ quote, controller, headingRef }: QuotationContentProps) {
  const { stage } = controller;
  const uiState = controller.uiStateOf(quote);
  const nowRef = useRef(Date.now());
  const decidedAt = stage.accepted?.acceptedAt ?? stage.rejected?.rejectedAt;
  const presentation = quotationPresentation(quote, uiState, nowRef.current, decidedAt);

  return (
    <section className="secure-quotation" aria-labelledby="secure-quotation-title">
      <p className="secure-quotation__visually-hidden" aria-live="polite">
        {liveMessage(uiState)}
      </p>

      <p
        className={`secure-quotation__badge secure-quotation__badge--${presentation.badgeTone.toLowerCase()}`}
      >
        {presentation.badge}
      </p>
      <h1
        className="secure-quotation__title"
        id="secure-quotation-title"
        ref={headingRef}
        tabIndex={-1}
      >
        {presentation.title}
      </h1>
      <p className="secure-quotation__subtitle">{presentation.subtitle}</p>

      {renderAlert()}

      <QuotationLines lines={presentation.lines} />
      <QuotationTotals presentation={presentation} />

      <p className="secure-quotation__note">{presentation.note}</p>

      {stage.accepted === undefined ? null : <AcceptedOutcome outcome={stage.accepted} />}
      {stage.rejected === undefined ? null : <RejectedOutcome outcome={stage.rejected} />}

      <QuotationActions
        uiState={uiState}
        onAccept={() => controller.requestAccept(quote.versionId)}
        onReject={() => controller.requestReject(quote.versionId)}
        onViewLatest={controller.reviewStale}
      />

      {renderDialog()}
    </section>
  );

  function renderAlert() {
    if (uiState === 'STALE') {
      return <QuotationAlert tone="WARNING" title={COPY.stale.title} body={COPY.stale.body} />;
    }
    if (uiState === 'EXPIRED') {
      return <QuotationAlert tone="ERROR" title={COPY.expired.title} body={COPY.expired.body} />;
    }
    if (stage.notice === undefined) return null;
    const notice = COPY.notices[stage.notice];
    return (
      <QuotationAlert tone={NOTICE_TONE[stage.notice]} title={notice.title} body={notice.body} />
    );
  }

  function renderDialog() {
    if (uiState === 'ACCEPT_CONFIRM') {
      return (
        <AcceptConfirmDialog
          total={presentation.totalAmount}
          onConfirm={controller.confirmAccept}
          onCancel={controller.dismissDecision}
        />
      );
    }
    if (uiState === 'REJECT_CONFIRM') {
      return (
        <RejectConfirmDialog
          onConfirm={controller.confirmReject}
          onCancel={controller.dismissDecision}
        />
      );
    }
    if (uiState === 'STEP_UP') {
      return (
        <QuoteStepUpDialog
          onVerified={controller.stepUpVerified}
          onCancel={controller.dismissDecision}
        />
      );
    }
    return null;
  }
}
