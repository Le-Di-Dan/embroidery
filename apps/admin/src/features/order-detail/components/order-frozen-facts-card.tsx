import Link from 'next/link';

import type { AdminOrderDetailResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { formatInstant } from '../../../shared/presentation/instant';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { DefinitionRow } from './definition-row';

interface OrderFrozenFactsCardProps {
  readonly order: AdminOrderDetailResponse;
}

/** The Admin request detail address `APP5-A01` owns; this screen only links to it. */
const ADMIN_REQUEST_DETAIL_PREFIX = '/requests';

/**
 * The order as it was frozen when the approved design was converted (`734:34`).
 *
 * Every value here is a column of the order itself. Nothing on this card reads
 * Catalog, and the capability imports no Catalog operation at all — so a
 * renamed product, a retired variant or a repriced SKU cannot change what an
 * order says it was, and no future edit to this file could make it, because
 * there is nothing in scope to call.
 *
 * The total is transported: `totalAmount` is grouped for reading beside the
 * order's own `currencyCode`, never re-summed from the lines and never converted
 * to a number.
 *
 * The three internal identifiers — customer, accepted quotation version,
 * approval snapshot — are shortened for the column with the full value kept in
 * `title`. `APP7-B02` publishes no display name for any of them, and an operator
 * reconciling against the database does need a handle; a full UUID in a
 * definition row is simply unreadable. The custom request is the one that has a
 * screen behind it, so it is the one that is a link.
 */
export function OrderFrozenFactsCard({ order }: OrderFrozenFactsCardProps) {
  return (
    <section className="order-card" aria-labelledby="order-facts-heading">
      <h2 className="order-card__title" id="order-facts-heading">
        {COPY.sections.frozenFacts}
      </h2>
      <p className="order-card__help">{COPY.sections.frozenFactsHelp}</p>

      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.fields.code} testId="order-detail-code">
          {order.code}
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.total} testId="order-detail-total">
          {formatAmountWithCurrency(order.totalAmount, order.currencyCode)}
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.createdAt}>
          <time dateTime={order.createdAt}>{formatInstant(order.createdAt)}</time>
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.updatedAt}>
          <time dateTime={order.updatedAt}>{formatInstant(order.updatedAt)}</time>
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.request}>
          <Link
            className="order-card__link"
            href={`${ADMIN_REQUEST_DETAIL_PREFIX}/${order.customRequestId}`}
          >
            {COPY.page.openRequest}
          </Link>
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.customer} title={order.customerId}>
          {truncateIdentifier(order.customerId)}
        </DefinitionRow>
        <DefinitionRow
          label={COPY.fields.acceptedQuotationVersion}
          title={order.acceptedQuotationVersionId}
        >
          {truncateIdentifier(order.acceptedQuotationVersionId)}
        </DefinitionRow>
        <DefinitionRow label={COPY.fields.approvalSnapshot} title={order.currentApprovalSnapshotId}>
          {truncateIdentifier(order.currentApprovalSnapshotId)}
        </DefinitionRow>
      </dl>
    </section>
  );
}
