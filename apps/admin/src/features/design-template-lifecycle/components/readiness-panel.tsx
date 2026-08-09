'use client';

import { LIFECYCLE_COPY, withValue } from '../model/lifecycle-copy';
import type { ReadinessReport, ReadinessRow, ReadinessState } from '../model/lifecycle-readiness';

/**
 * The mark beside each condition.
 *
 * Three glyphs for three states, and the third one matters most: a condition
 * this client cannot decide gets `–`, never `✓`. The glyph is paired with text
 * in every row, so the state is never carried by colour alone.
 */
const MARK: Readonly<Record<ReadinessState, string>> = {
  READY: '✓',
  NOT_READY: '✕',
  CHECKED_ON_PUBLISH: '–',
};

function detailText(row: ReadinessRow): string {
  const template =
    LIFECYCLE_COPY.readiness.details[
      row.detailKey as keyof typeof LIFECYCLE_COPY.readiness.details
    ];
  return row.detailValue === undefined ? template : withValue(template, row.detailValue);
}

interface ReadinessPanelProps {
  readonly report: ReadinessReport;
}

/**
 * All seven `GRD-T01` conditions, always — including on an `ARCHIVED` Template
 * and including the ones this client cannot evaluate.
 *
 * Rendering a partial list would be the more dangerous simplification: an
 * operator who sees five rows has no way to know the server checks seven, and
 * the two it hid are exactly the ones most likely to refuse them.
 */
export function ReadinessPanel({ report }: ReadinessPanelProps) {
  return (
    <section className="template-lifecycle-readiness" aria-labelledby="lifecycle-readiness-title">
      <h2 className="template-lifecycle-readiness__title" id="lifecycle-readiness-title">
        {LIFECYCLE_COPY.readiness.title}
      </h2>
      <ul className="template-lifecycle-readiness__list" data-testid="readiness-rows">
        {report.rows.map((row) => (
          <li
            key={row.condition}
            className="template-lifecycle-readiness__row"
            data-state={row.state}
            data-condition={row.condition}
            data-testid={`readiness-${row.condition}`}
          >
            <span className="template-lifecycle-readiness__mark" aria-hidden="true">
              {MARK[row.state]}
            </span>
            <span className="template-lifecycle-readiness__text">
              <span className="template-lifecycle-readiness__label">
                {LIFECYCLE_COPY.readiness.labels[row.condition]}
              </span>
              <span className="template-lifecycle-readiness__detail">{detailText(row)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="template-lifecycle-readiness__footer">{LIFECYCLE_COPY.readiness.footer}</p>
    </section>
  );
}
