/**
 * Turning `APP3-B03` summaries into what a row may truthfully say.
 *
 * This module exists because the honest answer for two of the columns is
 * neither the value nor "empty", and the distinction is easy to lose in JSX.
 *
 * ## Version
 *
 * The list projection calls `toSummaryView(template, undefined)` — it never
 * carries `currentVersion`, for **any** template. So an absent field on a list
 * row means *"not reported here"*, not *"this template has no version"*. Those
 * are different claims, and rendering the second would mislabel every published
 * template as unversioned.
 *
 * The type still declares the field optional, so this reads it defensively: if
 * a page ever does carry a version, the cell shows it. Nothing fabricates a
 * version 1, and nothing asserts an absence the list cannot observe.
 *
 * ## Scope
 *
 * A scope is present only as a complete product/side/area triple, so its absence
 * is a real, reportable fact — `noScope` is safe to say. When it *is* present,
 * only ids come back. The Product name is resolved from the filter options
 * already loaded for the toolbar, at zero extra cost; when the Product is not
 * among them the row states the fact without inventing a label, because
 * resolving one would cost a request per row.
 */
import type { AdminDesignTemplateSummaryResponse } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from './design-template-copy';

export type VersionCell =
  /** The list reported a version. */
  | { readonly kind: 'version'; readonly version: number; readonly published: boolean }
  /** The list does not carry version data at all. */
  | { readonly kind: 'not-in-list' };

export type ScopeCell =
  | { readonly kind: 'none' }
  | { readonly kind: 'product'; readonly productName: string }
  | { readonly kind: 'assigned' };

export function versionCell(summary: AdminDesignTemplateSummaryResponse): VersionCell {
  const current = summary.currentVersion;
  if (current === undefined) {
    return { kind: 'not-in-list' };
  }
  return {
    kind: 'version',
    version: current.version,
    published: current.publishedAt !== undefined,
  };
}

export function scopeCell(
  summary: AdminDesignTemplateSummaryResponse,
  productNames: ReadonlyMap<string, string>,
): ScopeCell {
  const scope = summary.scope;
  if (scope === undefined) return { kind: 'none' };

  const productName = productNames.get(scope.productId);
  return productName === undefined ? { kind: 'assigned' } : { kind: 'product', productName };
}

/**
 * The two cell labels, derived once so the desktop table and the mobile cards
 * cannot say different things about the same row.
 *
 * `not-in-list` is the case worth naming: it is **not** "no version". Saying
 * "Chưa có phiên bản" here would assert an absence the list cannot observe, and
 * would be wrong for every published template.
 */
export function versionLabel(cell: VersionCell): string {
  if (cell.kind === 'not-in-list') return DESIGN_TEMPLATE_COPY.row.versionNotInList;
  return `v${String(cell.version)}`;
}

export function scopeLabel(cell: ScopeCell): string {
  switch (cell.kind) {
    case 'none':
      return DESIGN_TEMPLATE_COPY.row.noScope;
    case 'product':
      return DESIGN_TEMPLATE_COPY.row.scopeOnProduct(cell.productName);
    default:
      return DESIGN_TEMPLATE_COPY.row.scopeAssigned;
  }
}

/**
 * Flattens accumulated cursor pages in server order, keeping the first
 * occurrence of each template id.
 *
 * Server order is preserved exactly — `created_at DESC, id DESC` is the
 * contract's ordering and re-sorting here would move rows under the operator's
 * cursor while claiming to show what the server returned. A concurrent create
 * can shift the keyset window and repeat a row across pages; rendering it twice
 * would misstate the collection.
 */
export function flattenTemplates(
  pages: readonly { readonly items: AdminDesignTemplateSummaryResponse[] }[],
): readonly AdminDesignTemplateSummaryResponse[] {
  const seen = new Set<string>();
  const items: AdminDesignTemplateSummaryResponse[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.templateId)) continue;
      seen.add(item.templateId);
      items.push(item);
    }
  }
  return items;
}

/**
 * The cursor for the next request, or `undefined` when the collection is
 * exhausted. Both parts of the contract must hold: `hasNext` alone is not a
 * cursor, and a stale `nextCursor` on a last page is not a continuation.
 */
export function resolveNextCursor(
  page: { readonly hasNext: boolean; readonly nextCursor?: string } | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) return undefined;
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
