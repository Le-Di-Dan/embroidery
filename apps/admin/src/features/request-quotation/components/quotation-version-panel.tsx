'use client';

import type {
  AdminQuotationLineItemResponse,
  AdminQuotationVersionResponse,
} from '@embroidery/api-client';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import { formatExactMoney, formatExactPercent } from '../model/exact-money';
import {
  presentInstant,
  presentLineKind,
  presentVersionStatus,
} from '../model/quotation-presentation';

interface VersionPanelProps {
  readonly version: AdminQuotationVersionResponse;
  readonly lineItems: readonly AdminQuotationLineItemResponse[];
  readonly customerCurrent: boolean;
}

/**
 * One exact version: its frozen lines, its recorded totals and its lifecycle
 * timestamps (`687:3`, `689:162`).
 *
 * ### Nothing on this panel is computed
 *
 * Every figure is rendered from the field the server stored. `lineTotalAmount`
 * is displayed as recorded and is **not** re-derived from quantity × unit price:
 * the contract says so explicitly, and a version priced under an older rule must
 * keep reading as what it was. The same holds for `depositPercent` — the share
 * *this* version was priced at, never today's policy — and for the remainder,
 * which the server obtained by subtraction so the two halves sum exactly.
 *
 * ### A sent version is read-only, structurally
 *
 * There is no editor here for any of it. Immutability is not enforced by
 * disabling inputs — there are no inputs to disable — and a re-price is a new
 * version created by the form elsewhere on the screen.
 */
export function QuotationVersionPanel({ version, lineItems, customerCurrent }: VersionPanelProps) {
  const immutable = version.status !== 'DRAFT';

  return (
    <section className="request-quotation__version" data-testid="quotation-version-panel">
      <header className="request-quotation__version-header">
        <h2 className="request-quotation__section-heading">
          {COPY.version.label(version.version)}
        </h2>
        <span
          className="request-quotation__badge"
          data-testid="quotation-version-status"
          data-status={version.status}
        >
          {presentVersionStatus(version.status)}
        </span>
        {customerCurrent ? (
          <span className="request-quotation__badge request-quotation__badge--current">
            {COPY.version.current}
          </span>
        ) : null}
      </header>

      {immutable ? (
        <p className="request-quotation__notice" data-testid="quotation-readonly-notice">
          {COPY.version.readOnlyNotice}
        </p>
      ) : null}

      <h3 className="request-quotation__subheading">{COPY.sections.lines}</h3>
      <div className="request-quotation__table-scroll">
        <table className="request-quotation__table">
          <caption className="request-quotation__table-caption">
            {COPY.version.label(version.version)}
          </caption>
          <thead>
            <tr>
              <th scope="col">{COPY.lines.position}</th>
              <th scope="col">{COPY.lines.kind}</th>
              <th scope="col">{COPY.lines.description}</th>
              <th scope="col">{COPY.lines.quantity}</th>
              <th scope="col">{COPY.lines.unitPrice}</th>
              <th scope="col">{COPY.lines.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 ? (
              <tr>
                <td colSpan={6}>{COPY.lines.empty}</td>
              </tr>
            ) : (
              lineItems.map((line) => (
                <tr key={`${String(line.position)}-${line.description}`}>
                  <td>{String(line.position)}</td>
                  <td>{presentLineKind(line.lineKind)}</td>
                  <td>{line.description}</td>
                  <td>{String(line.quantity)}</td>
                  <td>{formatExactMoney(line.unitPriceAmount)}</td>
                  {/* As frozen — never quantity × unit price recomputed here. */}
                  <td>{formatExactMoney(line.lineTotalAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="request-quotation__subheading">{COPY.sections.totals}</h3>
      <p className="request-quotation__notice">{COPY.totals.serverComputed}</p>
      <dl className="request-quotation__totals" data-testid="quotation-totals">
        <Total label={COPY.totals.subtotal} value={formatExactMoney(version.subtotalAmount)} />
        <Total
          label={COPY.totals.manualAdjustment}
          value={formatExactMoney(version.manualAdjustmentAmount)}
        />
        <Total label={COPY.totals.shipping} value={formatExactMoney(version.shippingFeeAmount)} />
        <Total
          label={COPY.totals.total}
          value={formatExactMoney(version.totalAmount)}
          emphasis
          testId="quotation-total"
        />
        <Total
          label={COPY.totals.depositPercent}
          value={formatExactPercent(version.depositPercent)}
        />
        <Total label={COPY.totals.deposit} value={formatExactMoney(version.depositAmount)} />
        <Total label={COPY.totals.remaining} value={formatExactMoney(version.remainingAmount)} />
        <Total label={COPY.totals.quantityTotal} value={String(version.quantityTotal)} />
        {version.stitchCount === null ? null : (
          <Total label={COPY.totals.stitchCount} value={String(version.stitchCount)} />
        )}
      </dl>

      {version.adjustmentReason === null ? null : (
        <div className="request-quotation__note" data-testid="quotation-adjustment-reason">
          <h3 className="request-quotation__subheading">{COPY.totals.adjustmentReason}</h3>
          <p>{version.adjustmentReason}</p>
        </div>
      )}

      <h3 className="request-quotation__subheading">{COPY.sections.validity}</h3>
      <dl className="request-quotation__definitions">
        <Definition label={COPY.version.createdAt} value={presentInstant(version.createdAt)} />
        <Definition label={COPY.version.validFrom} value={presentInstant(version.validFrom)} />
        <Definition label={COPY.version.validUntil} value={presentInstant(version.validUntil)} />
        <Definition label={COPY.version.sentAt} value={presentInstant(version.sentAt)} />
        <Definition label={COPY.version.acceptedAt} value={presentInstant(version.acceptedAt)} />
        <Definition
          label={COPY.version.supersededAt}
          value={presentInstant(version.supersededAt)}
        />
        <Definition label={COPY.version.expiredAt} value={presentInstant(version.expiredAt)} />
      </dl>
    </section>
  );
}

function Total({
  label,
  value,
  emphasis,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
  readonly testId?: string;
}) {
  return (
    <div
      className={
        emphasis === true
          ? 'request-quotation__total request-quotation__total--emphasis'
          : 'request-quotation__total'
      }
    >
      <dt>{label}</dt>
      <dd {...(testId === undefined ? {} : { 'data-testid': testId })}>{value}</dd>
    </div>
  );
}

function Definition({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="request-quotation__definition">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
