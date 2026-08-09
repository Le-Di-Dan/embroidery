'use client';

import { useMemo } from 'react';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import { ALL_FILTER_VALUE, type DesignTemplateFilters } from '../model/design-template-filters';
import { isCursorRejected } from '../model/design-template-failure';
import { flattenTemplates } from '../model/design-template-rows';
import { useDesignTemplateListQuery } from '../hooks/use-design-template-list-query';
import type { TemplateProductOptions } from '../hooks/use-template-product-options';
import { DesignTemplateCardList } from './design-template-card-list';
import { DesignTemplatePagination } from './design-template-pagination';
import { DesignTemplateSkeleton } from './design-template-skeleton';
import { DesignTemplateTable } from './design-template-table';

interface DesignTemplateCollectionProps {
  readonly filters: DesignTemplateFilters;
  readonly products: TemplateProductOptions;
  readonly onCreate: () => void;
}

/**
 * The collection and its four approved states (`596:8`).
 *
 * Owns the query so the screen above it holds no data and no derived list
 * state. The filters arrive as a value and go straight into the query key, which
 * is what makes a filter change start a fresh collection rather than merge into
 * the previous one.
 *
 * The empty state distinguishes "nothing exists yet" from "nothing matches this
 * filter". They need different advice — one offers creation, the other offers
 * widening — and collapsing them tells an operator who filtered to ARCHIVED that
 * they have no templates at all.
 */
export function DesignTemplateCollection({
  filters,
  products,
  onCreate,
}: DesignTemplateCollectionProps) {
  const query = useDesignTemplateListQuery(filters);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const items = useMemo(() => flattenTemplates(pages), [pages]);
  const loadedPageCount = pages.length;

  if (query.isPending) {
    return <DesignTemplateSkeleton />;
  }

  // A first page that failed leaves nothing to show, so the whole collection is
  // the error. A later page that failed is handled by the pagination control,
  // which keeps the loaded rows on screen.
  if (query.isError && loadedPageCount === 0) {
    const rejected = isCursorRejected(query.error);
    return (
      <div className="design-template-collection__failure" role="alert">
        <p className="design-template-collection__failure-title">
          {rejected
            ? DESIGN_TEMPLATE_COPY.states.cursorErrorTitle
            : DESIGN_TEMPLATE_COPY.states.errorTitle}
        </p>
        <p className="design-template-collection__failure-body">
          {rejected
            ? DESIGN_TEMPLATE_COPY.states.cursorErrorBody
            : DESIGN_TEMPLATE_COPY.states.errorBody}
        </p>
        <button
          type="button"
          className="design-template-collection__action"
          data-testid="template-list-retry"
          onClick={() => {
            void query.refetch();
          }}
        >
          {DESIGN_TEMPLATE_COPY.actions.retry}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    const filtered = filters.status !== ALL_FILTER_VALUE || filters.productId !== ALL_FILTER_VALUE;
    return (
      <div className="design-template-collection__empty" data-testid="template-empty">
        <p className="design-template-collection__empty-title">
          {filtered
            ? DESIGN_TEMPLATE_COPY.states.emptyFilteredTitle
            : DESIGN_TEMPLATE_COPY.states.emptyTitle}
        </p>
        <p className="design-template-collection__empty-body">
          {filtered
            ? DESIGN_TEMPLATE_COPY.states.emptyFilteredBody
            : DESIGN_TEMPLATE_COPY.states.emptyBody}
        </p>
        <button
          type="button"
          className="design-template-collection__action"
          data-testid="template-empty-create"
          onClick={onCreate}
        >
          {DESIGN_TEMPLATE_COPY.actions.create}
        </button>
      </div>
    );
  }

  return (
    <div className="design-template-collection">
      {/* Both are rendered; the stylesheet shows exactly one per breakpoint. */}
      <DesignTemplateTable items={items} productNames={products.names} />
      <DesignTemplateCardList items={items} productNames={products.names} />

      <DesignTemplatePagination
        hasNext={query.hasNextPage}
        loading={query.isFetchingNextPage}
        failed={query.isError}
        cursorRejected={query.isError && isCursorRejected(query.error)}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
        onReload={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
