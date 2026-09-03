import type { CustomerDepositResponse, DepositAttemptResponse } from '@embroidery/api-client';

import { formatExactAmount } from '../../../shared/money/exact-money';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositNote } from './deposit-note';
import { DepositStatusPill } from './deposit-status-pill';

/**
 * `749:50` / `750:415` — the one authoritative success on this route.
 *
 * ## It renders on server truth alone
 *
 * The panel selector reaches this card only when `depositStatus` is `SATISFIED`
 * or `orderStatus` is `DEPOSIT_PAID` — both of which only an Admin verification
 * produces. Nothing the customer did got them here: not the QR, not the
 * transfer, not five accepted images. There is no client-side boolean anywhere
 * in this feature that could have been flipped to reach it.
 *
 * ## What it deliberately does not claim
 *
 * `749:90` lists the sentences forbidden on this screen: *đang sản xuất*, *đã
 * giữ tồn kho*, *đã bắt đầu thêu*, *sẵn sàng giao hàng*. Those states belong to
 * APP8 and APP9 and do not exist anywhere in this system yet, so writing one
 * would be telling the customer something untrue. The forward-looking sentence
 * says only that the workshop continues, which is the strongest true statement
 * available.
 *
 * There is likewise no remaining-payment figure and no refund control here.
 *
 * ## The two rows that are not drawn
 *
 * The approved frame shows *Tổng giá trị đơn hàng* and *Xác nhận lúc*.
 * `publicOrderDeposit_current` publishes neither — it has no order total and no
 * verification timestamp, and there is no customer operation that does. §39
 * requires simplifying to actual backend truth and recording the discrepancy
 * rather than deriving a figure or reaching for an Admin route, so both rows are
 * absent and the completion report names them.
 *
 * The transfer reference is shown because the deposit read publishes it on
 * `bankInstructions`, and it is what a customer needs when matching this order
 * against their own bank statement later.
 */
interface DepositConfirmedCardProps {
  readonly deposit: CustomerDepositResponse;
  /** Present only when this session opened one; the card never requires it. */
  readonly attempt: DepositAttemptResponse | undefined;
}

export function DepositConfirmedCard({ deposit, attempt }: DepositConfirmedCardProps) {
  const amount = attempt?.amount ?? deposit.depositAmount;
  const currency = attempt?.currencyCode ?? deposit.currencyCode;

  return (
    <>
      <section
        className="secure-deposit__hero-confirmed"
        aria-labelledby="secure-deposit-confirmed"
      >
        <p className="secure-deposit__confirmed-mark" aria-hidden="true">
          ✓
        </p>
        <h2 className="secure-deposit__confirmed-title" id="secure-deposit-confirmed">
          {COPY.confirmed.title}
        </h2>
        <p className="secure-deposit__lead">{COPY.confirmed.lead}</p>
        <p className="secure-deposit__pill-row">
          <DepositStatusPill tone="SUCCESS" label={COPY.confirmed.orderBadge} />
          <DepositStatusPill tone="SUCCESS" label={COPY.confirmed.depositBadge} />
        </p>
      </section>

      <section className="secure-deposit__card" aria-labelledby="secure-deposit-identity">
        <h2 className="secure-deposit__card-title" id="secure-deposit-identity">
          {COPY.confirmed.identityTitle}
        </h2>
        <dl className="secure-deposit__facts">
          <div className="secure-deposit__fact">
            <dt className="secure-deposit__fact-label">{COPY.confirmed.orderCodeLabel}</dt>
            <dd className="secure-deposit__fact-value">{deposit.orderCode}</dd>
          </div>
          <div className="secure-deposit__fact">
            <dt className="secure-deposit__fact-label">{COPY.confirmed.depositLabel}</dt>
            <dd className="secure-deposit__fact-value">
              {formatExactAmount(amount)} {currency}
            </dd>
          </div>
          <div className="secure-deposit__fact">
            <dt className="secure-deposit__fact-label">{COPY.confirmed.referenceLabel}</dt>
            <dd className="secure-deposit__fact-value">
              <span className="secure-deposit__reference">
                {deposit.bankInstructions.transferReference}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="secure-deposit__card" aria-labelledby="secure-deposit-next">
        <h2 className="secure-deposit__card-title" id="secure-deposit-next">
          {COPY.confirmed.nextTitle}
        </h2>
        <p className="secure-deposit__body">{COPY.confirmed.nextBody}</p>
        <DepositNote tone="INFO">{COPY.confirmed.evidenceNote}</DepositNote>
      </section>
    </>
  );
}
