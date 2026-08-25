'use client';

import type { AdminProductionSpecificationResponse } from '@embroidery/api-client';

import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import {
  productionParametersOf,
  toSpecificationFields,
} from '../model/production-job-specification';

interface ProductionSpecificationCardProps {
  readonly specification: AdminProductionSpecificationResponse | undefined;
}

/**
 * The frozen specification, rendered as a locked read-only card (`784:47`).
 *
 * Every value on it comes from the detail response. Nothing here is an input,
 * a select or a form control — the frame is explicit that this must not read as
 * an editable catalog form (`784:55`) — and there is no download, no storage key
 * and no artifact payload anywhere: `documentHash` is shown as provenance only
 * (`784:80`).
 *
 * `specification` is optional on the contract solely as an unreachable-state
 * fallback, and its absence is reported as an absence rather than papered over
 * with a live Catalog read. A rebuilt figure would be a different product's.
 */
export function ProductionSpecificationCard({ specification }: ProductionSpecificationCardProps) {
  if (specification === undefined) {
    return (
      <section
        className="job-card job-card--warning"
        role="alert"
        data-testid="production-job-specification"
      >
        <h2 className="job-card__title">{COPY.specification.title}</h2>
        <p className="job-card__body">{COPY.specification.missingTitle}</p>
        <p className="job-card__note">{COPY.specification.missingBody}</p>
      </section>
    );
  }

  const fields = toSpecificationFields(specification);
  const parameters = productionParametersOf(specification);

  return (
    <section className="job-card" data-testid="production-job-specification">
      <h2 className="job-card__title">{COPY.specification.title}</h2>
      <p className="job-card__source">{COPY.specification.source}</p>

      <div className="job-frozen">
        <span className="job-frozen__mark" aria-hidden="true">
          🔒
        </span>
        <div>
          <p className="job-frozen__title">{COPY.specification.frozenTitle}</p>
          <p className="job-frozen__body">{COPY.specification.frozenBody}</p>
        </div>
      </div>

      <dl className="job-spec-grid">
        {fields.map((field) => (
          <div className="job-spec-grid__cell" key={field.label}>
            <dt className="job-spec-grid__label">{field.label}</dt>
            <dd
              className={
                field.absent
                  ? 'job-spec-grid__value job-spec-grid__value--absent'
                  : 'job-spec-grid__value'
              }
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="job-spec-hash">
        <p className="job-spec-hash__label">{COPY.specification.documentHash}</p>
        <p className="job-spec-hash__value" data-testid="production-job-document-hash">
          {specification.documentHash}
        </p>
        <p className="job-card__note">{COPY.specification.documentHashNote}</p>
      </div>

      <div className="job-spec-params">
        <p className="job-spec-hash__label">{parameters.label}</p>
        <p
          className={
            parameters.absent
              ? 'job-spec-params__value job-spec-params__value--absent'
              : 'job-spec-params__value'
          }
        >
          {parameters.value}
        </p>
      </div>
    </section>
  );
}
