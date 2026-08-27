'use client';

import type { RefObject } from 'react';

import type { CustomerFinalPaymentResponse } from '@embroidery/api-client';

import { useFinalPaymentQr } from '../hooks/use-final-payment-qr';
import { useTransferEvidence } from '../hooks/use-transfer-evidence';
import type { SecureFinalPayment } from '../hooks/use-secure-final-payment';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import {
  evidenceIntakeOpen,
  finalPaymentSettled,
  type FinalPaymentPanel,
} from '../model/final-payment-state';
import { customerOrderLabel } from '../model/order-progress';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import { FinalPaymentNote } from './final-payment-note';
import { FinalPaymentPill } from './final-payment-pill';
import { FinalPaymentQrPanel } from './final-payment-qr-panel';
import { FinalPaymentStepUpDialog } from './final-payment-step-up-dialog';
import { NotPayableCard } from './not-payable-card';
import { OrderFactsCard } from './order-facts-card';
import { OrderProgressCard } from './order-progress-card';
import { PreAttemptCard } from './pre-attempt-card';
import { TransferEvidenceSection } from './transfer-evidence-section';
import { TransferInstructionsCard } from './transfer-instructions-card';

/**
 * The authorized branch of the secure-link shell: the balance itself.
 *
 * `APP9-D01` draws **one** Storefront route with five customer states —
 * `818:4`, `816:231`, `816:4` + `817:4`, `818:37`/`818:87`/`818:137`, and the
 * neutral fallback for a stored obligation state it drew no frame for. They are
 * one page whose panels change together, not five pages: `NEW_STOREFRONT_ROUTES
 * = 1` and `APP9-S02` does not exist. So this renders one page and asks
 * {@link SecureFinalPayment.panelOf} which state it is in, which keeps that
 * decision in a pure function a test can assert directly.
 *
 * ## The heading is the page's, and it never claims payment
 *
 * The shell hands `headingRef` down precisely so the authorized branch owns the
 * single `h1` rather than having a second one rendered above it. The badge
 * beside it is the *order's* state in the customer's words, taken from the
 * approved mapping at `820:4` — never a raw contract enum, never an attempt's
 * status and never an image's.
 *
 * ## QR and evidence are mounted by state, not by convenience
 *
 * The QR query is enabled only while the instructions panel is showing, which is
 * itself reachable only when the server said `payable`. A sensitive image is not
 * fetched for a screen that is not displaying one, and never for a balance the
 * server would refuse to encode.
 *
 * The evidence section appears only where an attempt exists — §12 binds evidence
 * to the attempt this session opened, and there is no attempt id before an
 * initiation returns one. After the balance is settled the *intake* closes while
 * the list stays visible as history.
 *
 * ## The waiting truth is part of the instructions, not a separate state
 *
 * `820:44` collapses *hướng dẫn đã mở* and *đang chờ xác nhận* because
 * `publicOrderFinalPayment_current` answers `PENDING` for both. So there is no
 * *tôi đã chuyển khoản* button anywhere in this feature and no third panel for
 * it to lead to — the instructions card carries the waiting sentence itself.
 */
interface FinalPaymentContentProps {
  readonly payment: CustomerFinalPaymentResponse;
  readonly controller: SecureFinalPayment;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

export function FinalPaymentContent({ payment, controller, headingRef }: FinalPaymentContentProps) {
  const panel: FinalPaymentPanel = controller.panelOf(payment);
  const settled = finalPaymentSettled(payment);
  const attempt = controller.attempt;

  const qr = useFinalPaymentQr({
    enabled: panel === 'INSTRUCTIONS',
    orderCode: payment.orderCode,
    runWithSecret: controller.runWithSecret,
  });

  const evidence = useTransferEvidence({
    attemptId: attempt?.attemptId,
    runWithSecret: controller.runWithSecret,
    onSessionEnded: controller.endSession,
  });

  const intakeOpen = evidenceIntakeOpen(
    payment,
    attempt,
    evidence.submittedCount,
    MAX_EVIDENCE_PER_ATTEMPT,
  );

  const statusLabel = customerOrderLabel(payment.orderStatus);

  return (
    <section className="secure-final-payment" aria-labelledby="final-payment-title">
      <p className="secure-final-payment__visually-hidden" aria-live="polite">
        {liveMessage()}
      </p>

      <div className="secure-final-payment__heading">
        <h1
          className="secure-final-payment__title"
          id="final-payment-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {titleOf()}
        </h1>
        {/*
          Absent for the three order states the approved package deliberately
          gives no customer label — see `model/order-progress.ts`. A badge is not
          invented to fill the slot.
        */}
        {statusLabel === undefined ? null : (
          <FinalPaymentPill tone={settled ? 'SUCCESS' : 'WAITING'} label={statusLabel} />
        )}
      </div>

      <p className="secure-final-payment__order-line">
        {`${COPY.order.prefix} ${payment.orderCode} · ${COPY.order.suffix}`}
      </p>

      {renderPanel()}

      {attempt === undefined ? null : (
        <TransferEvidenceSection evidence={evidence} intakeOpen={intakeOpen} />
      )}

      {controller.stepUpOpen ? (
        <FinalPaymentStepUpDialog
          onVerified={controller.stepUpVerified}
          onCancel={controller.cancelStepUp}
        />
      ) : null}
    </section>
  );

  function titleOf(): string {
    switch (panel) {
      case 'PRE_ATTEMPT':
        return COPY.preAttempt.title;
      case 'INSTRUCTIONS':
        return COPY.instructions.title;
      case 'SETTLED':
        return COPY.settled.title;
      case 'OTHER_STATE':
        return COPY.otherState.title;
      default:
        return COPY.notPayable.title;
    }
  }

  function liveMessage(): string {
    if (settled) return COPY.live.settled;
    if (controller.stepUpOpen) return COPY.live.stepUp;
    if (controller.initiating) return COPY.live.initiating;
    return COPY.live.authorized;
  }

  function renderPanel() {
    if (panel === 'SETTLED') {
      return (
        <>
          <OrderProgressCard payment={payment} />
          <OrderFactsCard payment={payment} settled />
        </>
      );
    }

    if (panel === 'OTHER_STATE') {
      return (
        <>
          <section className="secure-final-payment__card" aria-labelledby="final-payment-other">
            <h2 className="secure-final-payment__card-title" id="final-payment-other">
              {COPY.otherState.cardTitle}
            </h2>
            <FinalPaymentNote tone="INFO">{COPY.otherState.body}</FinalPaymentNote>
          </section>
          <OrderFactsCard payment={payment} settled={false} />
        </>
      );
    }

    if (panel === 'NOT_PAYABLE') {
      return (
        <>
          <NotPayableCard />
          <OrderFactsCard payment={payment} settled={false} />
        </>
      );
    }

    if (panel === 'PRE_ATTEMPT' || attempt === undefined) {
      return (
        <PreAttemptCard
          payment={payment}
          initiating={controller.initiating}
          failure={controller.initiateFailure}
          onStart={() => controller.startAttempt(payment)}
        />
      );
    }

    return (
      <div className="secure-final-payment__transfer">
        <div className="secure-final-payment__transfer-main">
          <TransferInstructionsCard payment={payment} attempt={attempt} />
        </div>
        <div className="secure-final-payment__transfer-aside">
          <FinalPaymentQrPanel qr={qr} />
        </div>
      </div>
    );
  }
}
