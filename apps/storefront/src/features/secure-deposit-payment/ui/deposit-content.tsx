'use client';

import type { RefObject } from 'react';

import type { CustomerDepositResponse } from '@embroidery/api-client';

import { useDepositQr } from '../hooks/use-deposit-qr';
import { useTransferEvidence } from '../hooks/use-transfer-evidence';
import type { SecureDeposit } from '../hooks/use-secure-deposit';
import {
  depositConfirmed,
  evidenceIntakeOpen,
  type DepositPanel,
} from '../model/deposit-payment-state';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import { AttemptReviewCard } from './attempt-review-card';
import { AttemptTerminalCard } from './attempt-terminal-card';
import { AttemptUndrawnCard } from './attempt-undrawn-card';
import { DepositConfirmedCard } from './deposit-confirmed-card';
import { DepositInstructionsCard } from './deposit-instructions-card';
import { DepositNote } from './deposit-note';
import { DepositPreAttemptCard } from './deposit-pre-attempt-card';
import { DepositQrPanel } from './deposit-qr-panel';
import { DepositStatusPill } from './deposit-status-pill';
import { DepositStepUpDialog } from './deposit-step-up-dialog';
import { EvidencePanel } from './evidence-panel';

/**
 * The authorized branch of the secure-link shell: the deposit itself.
 *
 * `APP7-D01` draws one route with six states — `747:3`, `745:3`, `749:3`,
 * `749:26`, `749:50` and the neutral fallback from `751:174`. They are one page
 * whose panels change together, not six pages, and `APP7-R00` deliberately
 * merged the confirmation into this flow rather than splitting it onto a second
 * customer route. So this renders one page and asks
 * {@link SecureDeposit.panelOf} which state it is in, which keeps that decision
 * in a pure function a test can assert directly.
 *
 * ## The heading is the page's, and it never claims payment
 *
 * The shell hands `headingRef` down precisely so the authorized branch owns the
 * single `h1` rather than having a second one rendered above it. The badge beside
 * it is the *order's* state — *chờ xác nhận tiền cọc* until the workshop
 * confirms, *đã xác nhận tiền cọc* after — and never an attempt's or an image's.
 *
 * ## Evidence and QR are mounted by state, not by convenience
 *
 * The QR query is enabled only while the instructions panel is showing: a
 * sensitive image is not fetched for a screen that is not displaying one. The
 * evidence panel appears wherever an attempt exists — including on the
 * reconciliation card and after confirmation, where `749:91` keeps the list
 * visible as history — while the *intake* closes according to
 * {@link evidenceIntakeOpen}. The reminder is shown only where an upload is
 * still being invited.
 *
 * ## The waiting block is the honest half of PENDING
 *
 * `745:387` states it: this system cannot know the customer went to their bank.
 * So the instructions panel ends with an explanation of why there is no *tôi đã
 * chuyển khoản* button, and that button does not exist anywhere in this feature.
 */
interface DepositContentProps {
  readonly deposit: CustomerDepositResponse;
  readonly controller: SecureDeposit;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

export function DepositContent({ deposit, controller, headingRef }: DepositContentProps) {
  const panel: DepositPanel = controller.panelOf(deposit);
  const confirmed = depositConfirmed(deposit);
  const attempt = controller.attempt;

  const qr = useDepositQr({
    enabled: panel === 'INSTRUCTIONS',
    orderCode: deposit.orderCode,
    runWithSecret: controller.runWithSecret,
  });

  const evidence = useTransferEvidence({
    attemptId: attempt?.attemptId,
    runWithSecret: controller.runWithSecret,
    onSessionEnded: controller.endSession,
  });

  const intakeOpen = evidenceIntakeOpen(
    deposit,
    attempt,
    evidence.submittedCount,
    MAX_EVIDENCE_PER_ATTEMPT,
  );

  return (
    <section className="secure-deposit" aria-labelledby="secure-deposit-title">
      <p className="secure-deposit__visually-hidden" aria-live="polite">
        {liveMessage()}
      </p>

      <div className="secure-deposit__heading">
        <h1
          className="secure-deposit__title"
          id="secure-deposit-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {confirmed ? COPY.confirmed.title : COPY.instructions.title}
        </h1>
        {confirmed ? null : (
          <DepositStatusPill
            tone={panel === 'PRE_ATTEMPT' ? 'NEUTRAL' : 'WAITING'}
            label={panel === 'PRE_ATTEMPT' ? COPY.preAttempt.badge : COPY.instructions.badge}
          />
        )}
      </div>

      {confirmed ? null : (
        <p className="secure-deposit__order-line">
          {`${COPY.instructions.orderPrefix} ${deposit.orderCode} · ${COPY.instructions.orderLine}`}
        </p>
      )}

      {renderPanel()}

      {attempt === undefined ? null : (
        <EvidencePanel evidence={evidence} intakeOpen={intakeOpen} showReminder={intakeOpen} />
      )}

      {controller.stepUpOpen ? (
        <DepositStepUpDialog
          onVerified={controller.stepUpVerified}
          onCancel={controller.cancelStepUp}
        />
      ) : null}
    </section>
  );

  function liveMessage(): string {
    if (confirmed) return COPY.live.confirmed;
    if (controller.stepUpOpen) return COPY.live.stepUp;
    if (controller.initiating) return COPY.live.initiating;
    return COPY.live.authorized;
  }

  function renderPanel() {
    if (panel === 'CONFIRMED') {
      return <DepositConfirmedCard deposit={deposit} attempt={attempt} />;
    }
    if (panel === 'PRE_ATTEMPT' || attempt === undefined) {
      return (
        <DepositPreAttemptCard
          deposit={deposit}
          initiating={controller.initiating}
          failure={controller.initiateFailure}
          onStart={controller.startAttempt}
        />
      );
    }
    if (panel === 'REVIEW') return <AttemptReviewCard />;
    if (panel === 'TERMINAL') {
      return (
        <AttemptTerminalCard
          attempt={attempt}
          starting={controller.initiating}
          onStartNew={controller.startAttempt}
        />
      );
    }
    if (panel === 'UNDRAWN') return <AttemptUndrawnCard attempt={attempt} />;

    return (
      <div className="secure-deposit__transfer">
        <DepositInstructionsCard deposit={deposit} attempt={attempt} />
        <DepositQrPanel qr={qr} />
        <section className="secure-deposit__card" aria-labelledby="secure-deposit-waiting">
          <h2 className="secure-deposit__card-title" id="secure-deposit-waiting">
            {COPY.instructions.waitingTitle}
          </h2>
          <p className="secure-deposit__body">{COPY.instructions.waitingBody}</p>
          <DepositNote tone="INFO">{COPY.instructions.waitingNoButton}</DepositNote>
        </section>
      </div>
    );
  }
}
