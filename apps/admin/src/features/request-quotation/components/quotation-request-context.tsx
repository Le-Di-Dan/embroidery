'use client';

import type {
  AdminCatalogSubjectResponse,
  AdminCustomerOwnedSubjectResponse,
  AdminCustomRequestDetailResponse,
} from '@embroidery/api-client';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import { presentInstant, type SubjectKind } from '../model/quotation-presentation';

interface ContextPanelProps {
  readonly detail: AdminCustomRequestDetailResponse;
  readonly subjectKind: SubjectKind;
}

/**
 * The request context rail (`682:3` Catalog, `684:3` customer-owned).
 *
 * It renders only what `APP5-B04` already publishes about the request. No extra
 * catalog authority is fetched to decorate it: the approved design names the
 * product and the variant, and both are on the detail response — a second read
 * would be a wider aggregate loaded to display four strings.
 *
 * The branch comes from the `kind` discriminator, never from sniffing which
 * nullable field happens to be present. A catalog product whose labels no longer
 * resolve publishes every label absent, and a sniffing reader would render the
 * customer-owned panel for a store product.
 */
export function QuotationRequestContext({ detail, subjectKind }: ContextPanelProps) {
  return (
    <aside className="request-quotation__context" data-testid="quotation-context">
      <h2 className="request-quotation__section-heading">{COPY.sections.context}</h2>

      <dl className="request-quotation__definitions">
        <div className="request-quotation__definition">
          <dt>{COPY.context.status}</dt>
          <dd data-testid="quotation-context-status">{detail.status}</dd>
        </div>
        <div className="request-quotation__definition">
          <dt>{COPY.context.submittedAt}</dt>
          <dd>{presentInstant(detail.submittedAt)}</dd>
        </div>
        <div className="request-quotation__definition">
          <dt>{COPY.context.totalQuantity}</dt>
          <dd>{String(detail.totalQuantity)}</dd>
        </div>
      </dl>

      {subjectKind === 'CATALOG' ? (
        <CatalogSubject subject={detail.subject as AdminCatalogSubjectResponse} />
      ) : null}
      {subjectKind === 'CUSTOMER_OWNED' ? (
        <CustomerOwnedSubject subject={detail.subject as AdminCustomerOwnedSubjectResponse} />
      ) : null}
      {subjectKind === 'UNKNOWN' ? (
        <p className="request-quotation__notice">{COPY.context.unnamedSubject}</p>
      ) : null}

      <div className="request-quotation__note">
        <h3 className="request-quotation__subheading">{COPY.context.customerNote}</h3>
        <p>{detail.customerNote ?? COPY.context.noCustomerNote}</p>
      </div>
    </aside>
  );
}

function CatalogSubject({ subject }: { readonly subject: AdminCatalogSubjectResponse }) {
  const variant = [subject.variantColorName, subject.variantSizeLabel]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');

  return (
    <section className="request-quotation__subject" data-testid="quotation-subject-catalog">
      <h3 className="request-quotation__subheading">{COPY.context.catalogHeading}</h3>
      <dl className="request-quotation__definitions">
        <div className="request-quotation__definition">
          <dt>{COPY.context.productName}</dt>
          <dd>{subject.productName ?? COPY.context.unnamedSubject}</dd>
        </div>
        {variant === '' ? null : (
          <div className="request-quotation__definition">
            <dt>{COPY.context.variant}</dt>
            <dd>{variant}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * The customer-owned branch.
 *
 * The notice is not decoration: it states why the authoring form below offers no
 * product line. The customer supplies the garment, so there is no SKU to price
 * and none is invented.
 */
function CustomerOwnedSubject({
  subject,
}: {
  readonly subject: AdminCustomerOwnedSubjectResponse;
}) {
  const width = subject.physicalWidthMm;
  const height = subject.physicalHeightMm;
  const dimensions =
    width === undefined || height === undefined ? undefined : `${width} × ${height}`;

  return (
    <section className="request-quotation__subject" data-testid="quotation-subject-cop">
      <h3 className="request-quotation__subheading">{COPY.context.copHeading}</h3>
      <dl className="request-quotation__definitions">
        <div className="request-quotation__definition">
          <dt>{COPY.context.copName}</dt>
          <dd>{subject.name}</dd>
        </div>
        {subject.description === undefined ? null : (
          <div className="request-quotation__definition">
            <dt>{COPY.context.copDescription}</dt>
            <dd>{subject.description}</dd>
          </div>
        )}
        {dimensions === undefined ? null : (
          <div className="request-quotation__definition">
            <dt>{COPY.context.copDimensions}</dt>
            <dd>{dimensions}</dd>
          </div>
        )}
      </dl>
      <p className="request-quotation__notice" data-testid="quotation-cop-notice">
        {COPY.context.copNotice}
      </p>
    </section>
  );
}
