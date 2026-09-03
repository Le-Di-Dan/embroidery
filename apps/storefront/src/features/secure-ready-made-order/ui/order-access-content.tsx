'use client';

import type { RefObject } from 'react';

import type { ReadyMadeOrderAccessResponse } from '@embroidery/api-client';

import { useFullPayment } from '../hooks/use-full-payment';
import { useFullPaymentQr } from '../hooks/use-full-payment-qr';
import { useTransferEvidence } from '../hooks/use-transfer-evidence';
import type { SecureOrderSession } from '../hooks/use-secure-order-session';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { formatInstant } from '../model/order-display-format';
import {
  evidenceIntakeOpen,
  isPayable,
  orderVariantOf,
  showsPaymentBlock,
  variantToneOf,
} from '../model/order-access-state';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../model/transfer-evidence';
import { EvidenceSection } from './evidence-section';
import { NextActionCard } from './next-action-card';
import { OrderAmountCard } from './order-amount-card';
import { OrderNote } from './order-note';
import { OrderQrPanel } from './order-qr-panel';
import { OrderStatusPill } from './order-status-pill';
import { OrderStepUpDialog } from './order-step-up-dialog';
import { TransferInstructionsCard } from './transfer-instructions-card';

/**
 * The authorized branch of the secure-link shell: the order itself.
 *
 * `APP12-D01` draws **one** Storefront route with eight state variants —
 * `910:258` desktop, `911:366` mobile, `911:305` the state board — and states
 * the architecture rule in the design itself: *một trang · nhiều trạng thái …
 * không tạo 8 trang riêng*. So this renders one page and asks
 * {@link orderVariantOf} which state it is in, which keeps that decision in a
 * pure function a test can assert directly. `NEW_STOREFRONT_ROUTES = 1`.
 *
 * ## Three blocks change, and they are the three the board names
 *
 * ```text
 * pill                →  variantToneOf + COPY.states[variant].pill
 * next-action block   →  NextActionCard
 * payment / delivery  →  showsPaymentBlock(variant)
 * ```
 *
 * The heading and the order line are deliberately constant, because `911:306`
 * enumerates precisely what varies and neither is on the list. See
 * `model/order-access-copy.ts` for why that is followed literally rather than
 * expanded into eight titles, and for the follow-up it is recorded under.
 *
 * ## The shell owns the `h1`, and this branch owns the shell's `h1`
 *
 * `SecureLinkShell` hands `headingRef` down precisely so the authorized branch
 * renders the single `h1` rather than having a second one drawn above it (§38).
 * Focus lands there when the link settles.
 *
 * ## Nothing is fetched for a state that does not display it (§14, §21)
 *
 * The FULL obligation is read only while the order is `AWAITING_PAYMENT`; the
 * QR only while the payment block is showing *and* the server said `payable`;
 * evidence only once a current attempt exists. So `AWAITING_SHIPPING_FEE` makes
 * exactly one request — the order read — and a cancelled, expired, delivered or
 * completed order makes exactly one too. No predictable 404 is used as a
 * page-control mechanism, and no sensitive image is fetched for a panel that is
 * not on screen.
 *
 * ## Two facts about time, never conflated (§25)
 *
 * ```text
 * paymentDeadline   the reserved stock's own release instant, read from the
 *                   reservation and absent once none stands
 * accessExpiresAt   when this secure link stops opening the order
 * ```
 *
 * They are different facts with different sentences, and the deadline is shown
 * only where it still means something — while the order is payable and a live
 * reservation is what the customer is racing. Neither is computed, neither
 * counts down, and neither decides a state: expiry is `terminationReason`'s job
 * alone (§29).
 */
interface OrderAccessContentProps {
  readonly order: ReadyMadeOrderAccessResponse;
  readonly session: SecureOrderSession;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

export function OrderAccessContent({ order, session, headingRef }: OrderAccessContentProps) {
  const payment = useFullPayment({
    order,
    runWithSecret: session.runWithSecret,
    onSessionEnded: session.endSession,
  });

  const attempt = payment.attempt;

  // The server's own answer, and the only gate on every payable control. It is
  // derived there from both the order state and the obligation state and is
  // deliberately not re-derived from `orderStatus` here (§15, §21).
  const payable = isPayable(payment.current);

  const qr = useFullPaymentQr({
    enabled: payable,
    orderCode: order.orderCode,
    runWithSecret: session.runWithSecret,
  });

  const evidence = useTransferEvidence({
    attemptId: attempt?.attemptId,
    runWithSecret: session.runWithSecret,
    onSessionEnded: session.endSession,
  });

  // The variant is decided last because `PAYMENT_UNDER_REVIEW` is the one
  // presentation that depends on what this session has actually done (§12C).
  // Only a **count** crosses into the decision — no `assetStatus` and no
  // attempt status — so an image can never select a payment variant (§22).
  const variant = orderVariantOf(order, {
    attemptOpened: attempt !== undefined,
    evidenceSubmitted: evidence.submittedCount > 0,
  });
  const paymentBlock = showsPaymentBlock(variant);

  const intakeOpen = evidenceIntakeOpen(
    variant,
    attempt?.attemptId,
    evidence.submittedCount,
    MAX_EVIDENCE_PER_ATTEMPT,
  );

  return (
    <section className="secure-order" aria-labelledby="secure-order-title">
      <p className="secure-order__visually-hidden" aria-live="polite">
        {liveMessage()}
      </p>

      <div className="secure-order__heading">
        <h1 className="secure-order__title" id="secure-order-title" ref={headingRef} tabIndex={-1}>
          {COPY.title}
        </h1>
        <OrderStatusPill tone={variantToneOf(variant)} label={COPY.states[variant].pill} />
      </div>

      <p className="secure-order__order-line">
        {`${COPY.order.prefix} ${order.orderCode} · ${COPY.order.suffix}`}
      </p>

      <NextActionCard variant={variant} payment={payment} payable={payable} />

      {/*
        One grid, four children, two approved arrangements.

        `910:290` puts the QR in a 420 aside beside a 836 main; `911:415` puts it
        between the amount card and the transfer details in a single column. Both
        are reached by **placing** one QR panel, never by mounting two and hiding
        one: two instances would put two identical images in the accessibility
        tree, two download buttons in the tab order, and two `<img>` elements on
        the same object URL. The stylesheet owns which arrangement applies, so
        there is no JavaScript media query and no second source of truth.
      */}
      <div className="secure-order__columns">
        <div className="secure-order__cell secure-order__cell--amount">
          <OrderAmountCard order={order} full={payment.current} showsTotal={paymentBlock} />
        </div>

        {payable && payment.current !== undefined ? (
          <>
            <div className="secure-order__cell secure-order__cell--qr">
              <OrderQrPanel qr={qr} />
            </div>
            <div className="secure-order__cell secure-order__cell--transfer">
              <TransferInstructionsCard full={payment.current} />
            </div>
          </>
        ) : null}

        {attempt === undefined && evidence.items.length === 0 ? null : (
          <div className="secure-order__cell secure-order__cell--evidence">
            <EvidenceSection evidence={evidence} intakeOpen={intakeOpen} />
          </div>
        )}
      </div>

      {renderDeadline()}

      {/* `910:335` — the access-expiry band, at the foot of the page. */}
      <OrderNote tone="INFO">
        {`${COPY.access.expiryPrefix} ${formatInstant(order.accessExpiresAt)}${COPY.access.expirySuffix}`}
      </OrderNote>

      {payment.stepUpOpen ? (
        <OrderStepUpDialog onVerified={payment.stepUpVerified} onCancel={payment.cancelStepUp} />
      ) : null}
    </section>
  );

  function renderDeadline() {
    const deadline = order.paymentDeadline;
    // Absent once no live reservation stands — the window lapsed, the stock was
    // released, or it was consumed at dispatch — which is exactly when a
    // deadline must stop being shown. Shown only while something is still owed.
    if (deadline === undefined || !paymentBlock) return null;
    return (
      <OrderNote tone="WARNING">
        {`${COPY.deadline.prefix} ${formatInstant(deadline)}${COPY.deadline.suffix}`}
      </OrderNote>
    );
  }

  function liveMessage(): string {
    if (payment.stepUpOpen) return COPY.live.stepUp;
    if (payment.initiating) return COPY.live.initiating;
    return COPY.live.authorized;
  }
}
