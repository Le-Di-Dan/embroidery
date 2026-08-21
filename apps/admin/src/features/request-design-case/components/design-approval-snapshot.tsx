'use client';

import type { ApprovalEvidenceResponse } from '@embroidery/api-client';

import { presentInstant } from '../model/design-case-presentation';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';

interface DesignApprovalSnapshotProps {
  readonly approval: ApprovalEvidenceResponse;
}

/**
 * `697:3` — the immutable Approval Snapshot.
 *
 * ### It renders evidence, not current data
 *
 * Every value comes from the snapshot the server froze at approval: the product
 * name as it stood then, the placement labels as they stood then, the dimensions
 * and the quantity as they stood then, and the contacts as the customer was
 * reachable then. A product renamed afterwards does not rewrite this card,
 * because nothing here reads a current catalog, customer or request row — the
 * response has no such field to read.
 *
 * That is also why nothing on this card is editable. It is not a profile and not
 * a form; it is what was approved.
 *
 * ### Contacts arrive masked, and only masked
 *
 * The server masks them; this component renders what it was given. The unmasked
 * values are not withheld by this file — they are absent from the contract, so
 * there is no field here that could leak one.
 *
 * ### What is deliberately not shown
 *
 * No grant id, no step-up challenge id, no secure token, no customer id and no
 * agreement prose: `reverified` is the boolean the step-up evidence reduces to,
 * and the agreements are identified by the content hash `GRD-008` binds
 * acceptance to. The approved frame opens no terms text, so none is fetched.
 *
 * ### `APP7` has not run
 *
 * The card states plainly that no order, deposit or production job exists. It
 * offers no control for any of them, and the workbench publishes no route that
 * could reach one — the snapshot is handoff readiness, never a claim that the
 * handoff happened.
 */
export function DesignApprovalSnapshot({ approval }: DesignApprovalSnapshotProps) {
  const contacts = [approval.maskedEmail, approval.maskedPhone].filter(
    (value): value is string => value !== null && value !== '',
  );

  return (
    <section className="request-design-case__snapshot" data-testid="design-approval-snapshot">
      <h3 className="request-design-case__notice-title">{COPY.approval.title}</h3>
      <p className="request-design-case__hint">{COPY.approval.note}</p>

      <dl className="request-design-case__definitions">
        <Row label={COPY.approval.approvedAt} value={presentInstant(approval.approvedAt)} />
        <Row
          label={COPY.approval.documentHash}
          value={approval.documentHash}
          testId="design-approval-hash"
          mono
        />
        <Row
          label={COPY.approval.customer}
          value={approval.customerDisplayName ?? COPY.approval.customerUnknown}
        />
        <Row
          label={COPY.approval.contacts}
          value={contacts.length === 0 ? COPY.approval.contactsNone : contacts.join(' · ')}
          testId="design-approval-contacts"
        />
        <Row
          label={COPY.approval.reverified}
          value={approval.reverified ? COPY.approval.reverifiedYes : COPY.approval.reverifiedNo}
        />
        <Row label={COPY.approval.product} value={approval.productName} />
        <Row
          label={COPY.approval.variant}
          // Null on the customer-owned branch because a COP has no variant — not
          // because one could not be resolved.
          value={approval.variantLabel ?? COPY.approval.variantNone}
        />
        <Row label={COPY.approval.side} value={approval.sideName} />
        <Row label={COPY.approval.area} value={approval.areaName} />
        <Row
          label={COPY.approval.dimensions}
          value={COPY.selected.dimensionsValue(approval.physicalWidthMm, approval.physicalHeightMm)}
        />
        <Row label={COPY.approval.quantity} value={String(approval.quantityTotal)} />
      </dl>

      <h4 className="request-design-case__notice-title">{COPY.approval.agreements}</h4>
      {approval.agreements.length === 0 ? (
        <p className="request-design-case__hint">{COPY.approval.agreementsNone}</p>
      ) : (
        <ul className="request-design-case__agreements" data-testid="design-approval-agreements">
          {approval.agreements.map((agreement) => (
            <li key={`${agreement.agreementType}-${agreement.contentHash}`}>
              <span className="request-design-case__agreement-type">{agreement.agreementType}</span>
              <span className="request-design-case__mono">
                {`${COPY.approval.agreementHash}: ${agreement.contentHash}`}
              </span>
              <span className="request-design-case__review-meta">
                {presentInstant(agreement.acceptedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="request-design-case__hint" data-testid="design-approval-scope">
        {COPY.approval.scopeNote}
      </p>
    </section>
  );
}

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
  readonly mono?: boolean;
}

function Row({ label, value, testId, mono = false }: RowProps) {
  return (
    <div className="request-design-case__definition">
      <dt>{label}</dt>
      <dd className={mono ? 'request-design-case__mono' : undefined} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
