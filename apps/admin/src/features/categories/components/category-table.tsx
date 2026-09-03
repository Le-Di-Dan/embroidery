'use client';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { CATEGORY_COPY } from '../model/category-copy';
import { presentCategoryStatus } from '../model/category-status';
import { AdminCategoryResponseStatus } from '@embroidery/api-client';
import type { AdminCategory } from '../services/admin-category.service';

interface CategoryTableProps {
  readonly categories: readonly AdminCategory[];
  readonly selectedId: string | null;
  readonly onSelect: (category: AdminCategory) => void;
}

/**
 * The category table (`915:374`), in the Product list's table language
 * (`498:272`): the same head tint, the same row rhythm, the same 1px rules.
 *
 * ## Every state is rendered
 *
 * Draft, published and archived rows all appear, in the order the server sent
 * them (`displayOrder` then `slug`). Nothing is hidden and nothing is
 * re-sorted: the ordering is the operator's editorial authority, and an
 * archived row that vanished from the Admin would leave the products still
 * filed under it unreachable from here.
 *
 * ## `categoryId` is identity, never copy
 *
 * The UUID is the React key and the mutation path parameter. It is never
 * rendered: an operator addresses a category by its name and its slug, and a
 * UUID on screen is a transport detail leaking into a business surface.
 */
export function CategoryTable({ categories, selectedId, onSelect }: CategoryTableProps) {
  return (
    <table className="category-table">
      <caption className="category-table__caption">{CATEGORY_COPY.table.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{CATEGORY_COPY.table.name}</th>
          <th scope="col">{CATEGORY_COPY.table.slug}</th>
          <th scope="col">{CATEGORY_COPY.table.status}</th>
          <th scope="col">{CATEGORY_COPY.table.publishedProducts}</th>
          <th scope="col">{CATEGORY_COPY.table.indexable}</th>
        </tr>
      </thead>
      <tbody>
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            selected={category.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}

interface CategoryRowProps {
  readonly category: AdminCategory;
  readonly selected: boolean;
  readonly onSelect: (category: AdminCategory) => void;
}

/**
 * One row. The name is the control that opens the form (`915:382` — drawn in
 * the action colour), and it is a real `<button>`: it changes what the panel
 * beside the table shows, which is not a navigation and so is not a link.
 */
function CategoryRow({ category, selected, onSelect }: CategoryRowProps) {
  const status = presentCategoryStatus(category.status);

  return (
    <tr
      className={selected ? 'category-table__row category-table__row--selected' : undefined}
      data-testid={`category-row-${category.slug}`}
    >
      <th scope="row" className="category-table__name-cell">
        <button
          type="button"
          className="category-table__name"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(category)}
        >
          {category.name}
        </button>
      </th>
      <td className="category-table__slug">{category.slug}</td>
      <td className="category-table__status">
        <AdminStatusBadge
          token={status.token}
          label={status.label}
          tone={status.tone}
          symbol={status.symbol}
          testId={`category-status-${category.slug}`}
        />
      </td>
      <td className="category-table__count" data-testid={`category-count-${category.slug}`}>
        {category.publishedProductCount}
      </td>
      <td className="category-table__indexable">{indexableLabel(category)}</td>
    </tr>
  );
}

/**
 * `Có` / `Không` for a published category; `—` otherwise (`915:389`,
 * `915:407`, `915:416`, `915:425`).
 *
 * Indexability only ever takes effect once a category is public, so printing
 * `Có` on a draft would state a sitemap promise nothing is keeping. The dash
 * says "not applicable yet", which is the truth for both other states.
 */
function indexableLabel(category: AdminCategory): string {
  if (category.status !== AdminCategoryResponseStatus.PUBLISHED) {
    return CATEGORY_COPY.table.indexableNotApplicable;
  }
  return category.isIndexable ? CATEGORY_COPY.table.indexableYes : CATEGORY_COPY.table.indexableNo;
}
