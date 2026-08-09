'use client';

import Link from 'next/link';
import type { AdminDesignTemplateSummaryResponse } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import { adminDesignTemplateEditorRoute } from '../model/design-template-route';
import { scopeCell, scopeLabel, versionCell, versionLabel } from '../model/design-template-rows';
import { DesignTemplateStatusBadge } from './design-template-status-badge';
import { formatInstant } from './design-template-table';

interface DesignTemplateCardListProps {
  readonly items: readonly AdminDesignTemplateSummaryResponse[];
  readonly productNames: ReadonlyMap<string, string>;
}

/**
 * The mobile adaptation (`FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT`).
 *
 * A card list rather than a horizontally scrolling table: the approved design
 * has a card adaptation, and pushing a six-column table sideways on a phone
 * hides the columns that matter behind a gesture nobody discovers.
 *
 * Rendered alongside the table and switched by the stylesheet, which is the
 * convention `APP2-A02` set — `display: none` also removes the hidden one from
 * the accessibility tree, so exactly one is ever announced.
 *
 * Every card is a real heading plus a definition list, so the same facts the
 * table's column headers carry are still associated with their values.
 */
export function DesignTemplateCardList({ items, productNames }: DesignTemplateCardListProps) {
  return (
    <ul className="design-template-cards" data-testid="template-cards">
      {items.map((item) => (
        <li key={item.templateId} className="design-template-cards__item">
          <article aria-labelledby={`template-card-${item.templateId}`}>
            <header className="design-template-cards__header">
              <h2 className="design-template-cards__name" id={`template-card-${item.templateId}`}>
                {item.name}
              </h2>
              <DesignTemplateStatusBadge status={item.status} />
            </header>

            <dl className="design-template-cards__facts">
              <dt>{DESIGN_TEMPLATE_COPY.columns.scope}</dt>
              <dd>{scopeLabel(scopeCell(item, productNames))}</dd>

              <dt>{DESIGN_TEMPLATE_COPY.columns.version}</dt>
              <dd>{versionLabel(versionCell(item))}</dd>

              <dt>{DESIGN_TEMPLATE_COPY.columns.updated}</dt>
              <dd>
                <time dateTime={item.updatedAt}>{formatInstant(item.updatedAt)}</time>
              </dd>
            </dl>

            {/* A real link now that `APP3-A03` exists; a disabled button with a
                stated reason until it did. */}
            <Link
              className="design-template-cards__edit"
              href={adminDesignTemplateEditorRoute(item.templateId)}
              data-testid={`template-card-edit-${item.templateId}`}
            >
              {DESIGN_TEMPLATE_COPY.editAffordance.label}
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
