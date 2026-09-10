'use client';

import type { AdminOrderDetailResponse } from '@embroidery/api-client';

import { useOrderPaymentsQuery, useOrderRefresh } from '../hooks/use-order-detail-queries';
import { useShippingDetailQuery } from '../hooks/use-order-fulfillment';
import { READY_MADE_DETAIL_COPY as COPY } from '../model/ready-made-detail-copy';
import { readyMadeMerchandiseOf } from '../model/ready-made-merchandise';
import { FullPaymentPanel } from './full-payment-panel';
import { OrderItemsTable } from './order-items-table';
import { ReadyMadeFrozenFactsCard } from './ready-made-frozen-facts-card';
import { ReadyMadeFulfillmentPanel } from './ready-made-fulfillment-panel';
import { ReadyMadeShippingFeeCard } from './ready-made-shipping-fee-card';

interface ReadyMadeOrderColumnsProps {
  readonly orderId: string;
  readonly order: AdminOrderDetailResponse;
}

/**
 * The Ready-Made branch of `/orders/{orderId}` (`913:337`).
 *
 * The **existing** two-column layout, filled with the Ready-Made composition:
 * frozen facts and the SKU lines on the left, the shipping-fee card, the single
 * `FULL` workbench and the fulfilment rail on the right. No new route, no
 * second detail application, and the same `order-detail__columns` grid the
 * custom branch uses.
 *
 * ## The custom-only panels are not mounted
 *
 * Not hidden, not disabled, not rendered empty — **absent**. There is no
 * quotation panel, no design-version panel, no approval snapshot, no production
 * panel, no `REMAINING` workflow and no custom-request provenance anywhere in
 * this subtree, because none of them is imported into it. The absence is
 * structural rather than conditional, and the frozen-facts card states in one
 * sentence which four sections are omitted (`BR-031`).
 *
 * ## Three reads, and the shipping one is always issued
 *
 * The order detail is the caller's. The payment read and the shipping read are
 * issued here. Unlike the custom rail — which withholds the shipping read until
 * `READY_FOR_DELIVERY` because there is nothing to show before it — a
 * Ready-Made order carries a delivery detail from creation (`APP12-B02`) and
 * the fee card needs it in the very first state, so it is read from the start.
 *
 * ## Invalidation is scoped, and it is the shared refresh
 *
 * `useOrderRefresh` is the delivered helper the deposit workbench uses. A fee
 * save re-reads the detail, the payment vertical and the shipping detail —
 * because one write moves the order's status, creates or supersedes the
 * obligation and rewrites the fee — and nothing else in the Admin cache is
 * touched. There is no polling.
 */
export function ReadyMadeOrderColumns({ orderId, order }: ReadyMadeOrderColumnsProps) {
  const payments = useOrderPaymentsQuery(orderId);
  const shipping = useShippingDetailQuery(orderId, true);
  const refresh = useOrderRefresh(orderId);

  const detail = shipping.data ?? null;

  return (
    <div className="order-detail__columns order-detail__columns--commerce">
      {/*
        Payment first, in the wide column (`V01-UX-010`, `APP12-V02` §23).

        The custom split gives the rail short lifecycle summaries; a Ready-Made
        order puts its whole commercial decision there, and V01 measured the
        result — the fee card, the FULL workbench and the fulfilment rail in a
        300px column running to y≈1590, beside a left column that ended at y≈810.
        Swapping the basis and the DOM order means the operator meets the
        required action before the record of what was bought, and a screen reader
        reads them in that order too.
      */}
      <div className="order-detail__payments">
        {payments.isPending ? (
          <p className="order-card__help" role="status" data-testid="ready-made-payments-loading">
            {COPY.failure.loading}
          </p>
        ) : payments.isError ? (
          <section className="order-card" role="alert" data-testid="ready-made-payments-error">
            <h2 className="order-card__title">{COPY.failure.unavailableTitle}</h2>
            <p className="order-card__help">{COPY.failure.unavailableBody}</p>
            <button
              type="button"
              className="order-card__action"
              onClick={() => {
                void payments.refetch();
              }}
            >
              {COPY.failure.retry}
            </button>
          </section>
        ) : (
          <>
            {detail === null ? null : (
              <ReadyMadeShippingFeeCard
                orderId={orderId}
                detail={detail}
                payments={payments.data}
                merchandiseAmount={readyMadeMerchandiseOf(order)}
                currencyCode={order.currencyCode}
                onSaved={() => {
                  void refresh.refreshAll();
                }}
              />
            )}

            <FullPaymentPanel
              orderId={orderId}
              payments={payments.data}
              onMetadataStale={() => {
                void refresh.refreshPayments();
              }}
            />
          </>
        )}

        <ReadyMadeFulfillmentPanel order={order} detail={detail} />
      </div>

      <div className="order-detail__frozen">
        <ReadyMadeFrozenFactsCard order={order} shipping={detail} />
        <OrderItemsTable items={order.items} />
      </div>
    </div>
  );
}
