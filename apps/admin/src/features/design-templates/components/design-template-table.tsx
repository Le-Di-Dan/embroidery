'use client';

import { formatDisplayInstant } from '@embroidery/i18n';
import Link from 'next/link';
import type { AdminDesignTemplateSummaryResponse } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import { adminDesignTemplateEditorRoute } from '../model/design-template-route';
import { scopeCell, scopeLabel, versionCell, versionLabel } from '../model/design-template-rows';
import { DesignTemplateStatusBadge } from './design-template-status-badge';

interface DesignTemplateTableProps {
  readonly items: readonly AdminDesignTemplateSummaryResponse[];
  readonly productNames: ReadonlyMap<string, string>;
}

/** Server order is the contract's order; nothing here re-sorts. */
export function DesignTemplateTable({ items, productNames }: DesignTemplateTableProps) {
  return (
    <table className="design-template-table" data-testid="template-table">
      <caption className="design-template-table__caption">
        {DESIGN_TEMPLATE_COPY.page.title}
      </caption>
      {/* Auto table layout gives the slack to the widest content, which here is
          the sentence explaining why the edit affordance is inert — so the
          template *name*, the one cell an operator scans by, ends up wrapped in
          the narrowest column. The colgroup states the intended proportions
          instead of letting the longest string decide them. */}
      <colgroup>
        <col className="design-template-table__col--name" />
        <col className="design-template-table__col--status" />
        <col className="design-template-table__col--scope" />
        <col className="design-template-table__col--version" />
        <col className="design-template-table__col--updated" />
        <col className="design-template-table__col--actions" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.name}</th>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.status}</th>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.scope}</th>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.version}</th>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.updated}</th>
          <th scope="col">{DESIGN_TEMPLATE_COPY.columns.actions}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.templateId} data-testid={`template-row-${item.templateId}`}>
            {/* `th scope="row"` so a screen reader announces the template name
                as the row's identity when reading any other cell. */}
            <th scope="row" className="design-template-table__name">
              {item.name}
            </th>
            <td>
              <DesignTemplateStatusBadge status={item.status} />
            </td>
            <td>{scopeLabel(scopeCell(item, productNames))}</td>
            <td>{versionLabel(versionCell(item))}</td>
            <td>
              {/* The instant is machine-readable in `dateTime` and human-readable
                  in the text; neither is derived from the other by guesswork. */}
              <time dateTime={item.updatedAt}>{formatInstant(item.updatedAt)}</time>
            </td>
            <td>
              {/*
                A real link now that `APP3-A03` exists. It was a disabled button
                with a stated reason until the route did, which is the same rule
                either way: never a control that leads nowhere.

                `<Link>`, not a button with a handler — the editor is a page, so
                it must be openable in a new tab and reachable by the browser's
                own navigation.
              */}
              <Link
                className="design-template-table__edit"
                href={adminDesignTemplateEditorRoute(item.templateId)}
                data-testid={`template-edit-${item.templateId}`}
              >
                {DESIGN_TEMPLATE_COPY.editAffordance.label}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The server's ISO instant in the operator's locale.
 *
 * `Intl` rather than a hand-rolled format, and the raw value is preserved in the
 * `dateTime` attribute either way — so an unparseable instant degrades to being
 * shown verbatim rather than to "Invalid Date".
 */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  // One instant format across both applications (`V01-UX-021`, `APP12-V02` §30):
  // the shared `dd/MM/yyyy · HH:mm` in `@embroidery/i18n`, in the workshop's
  // zone, rather than a per-feature `Intl` call with its own field styles.
  return formatDisplayInstant(at) ?? iso;
}
