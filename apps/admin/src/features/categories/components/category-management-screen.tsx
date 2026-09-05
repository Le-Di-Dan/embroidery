'use client';

import { useState } from 'react';

import { classifyCategoryFailure } from '../model/category-conflict';
import { CATEGORY_COPY, categoryFailureMessage } from '../model/category-copy';
import { useAdminCategoryInventoryQuery } from '../hooks/use-category-inventory-query';
import type { AdminCategory } from '../services/admin-category.service';
import { CategoryFormPanel } from './category-form-panel';
import { CategoryTable } from './category-table';

/**
 * The one category management screen (`915:342`).
 *
 * ## One route, three interactions
 *
 * List, create and edit all live at `/categories`. There is no
 * `/categories/new` and no `/categories/{id}`: the approved frames draw a table
 * and a form panel side by side, and a second address would be a screen nobody
 * designed. Selection is component state, not a URL parameter, because it
 * selects a panel rather than navigating.
 *
 * ## `adminCategory_list` is the only inventory
 *
 * Every row on this screen — and every row the Product form and filter offer —
 * comes from that one read. The screen holds no category array, no slug list
 * and no label map: the taxonomy is database data
 * (`CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE`), and a category the operator
 * creates appears here on the next reconciliation with no deployment.
 *
 * ## The selected row is re-read, never remembered
 *
 * The panel is handed the row out of the *current* query data by id rather than
 * a snapshot taken when it was clicked. After any successful write the
 * inventory is invalidated, the refetched row flows straight back into the
 * panel, and with it the fresh `updatedAt` the next save has to carry.
 */
export function CategoryManagementScreen() {
  const inventory = useAdminCategoryInventoryQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = inventory.data ?? [];
  const selected = categories.find((category) => category.id === selectedId) ?? null;
  const panelOpen = creating || selected !== null;

  const openCreate = () => {
    setSelectedId(null);
    setCreating(true);
  };

  const closePanel = () => {
    setSelectedId(null);
    setCreating(false);
  };

  return (
    <div className="categories">
      <header className="categories__header">
        <div className="categories__head">
          <h1 className="categories__title">{CATEGORY_COPY.page.title}</h1>
          <p className="categories__subtitle">{CATEGORY_COPY.page.subtitle}</p>
        </div>
        <button
          type="button"
          className="category-button category-button--primary"
          data-testid="category-create"
          onClick={openCreate}
        >
          {CATEGORY_COPY.page.create}
        </button>
      </header>

      <div className="categories__body">
        <div className="categories__list">
          <CategoryInventory
            categories={categories}
            selectedId={selected?.id ?? null}
            loading={inventory.isPending}
            error={inventory.error}
            onSelect={(category) => {
              setCreating(false);
              setSelectedId(category.id);
            }}
            onRetry={() => void inventory.refetch()}
          />
        </div>

        {panelOpen ? (
          <CategoryFormPanel
            key={selected === null ? 'create' : `${selected.id}:${selected.updatedAt}`}
            category={selected}
            onClose={closePanel}
            onReload={() => void inventory.refetch()}
            onCreated={(categoryId) => {
              // Land on the record the server just created, so publish is one
              // step away and the operator sees the DRAFT they actually made.
              setCreating(false);
              setSelectedId(categoryId);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

interface CategoryInventoryProps {
  readonly categories: readonly AdminCategory[];
  readonly selectedId: string | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly onSelect: (category: AdminCategory) => void;
  readonly onRetry: () => void;
}

/**
 * Loading, failure, empty or table — exactly one at a time.
 *
 * The failure state is classified rather than generic: an inventory too large
 * for the unpaged read is a different problem from a network failure, and
 * `CATEGORY_INVENTORY_TOO_LARGE` makes the whole list unavailable in a way
 * "thử lại" cannot fix. Nothing falls back to a remembered taxonomy.
 */
function CategoryInventory({
  categories,
  selectedId,
  loading,
  error,
  onSelect,
  onRetry,
}: CategoryInventoryProps) {
  if (loading) {
    return (
      <p className="categories__state" role="status">
        {CATEGORY_COPY.list.loading}
      </p>
    );
  }

  if (error !== null) {
    const failure = classifyCategoryFailure(error);
    const message =
      failure === 'inventory-too-large'
        ? CATEGORY_COPY.failure.inventoryTooLarge
        : (categoryFailureMessage(failure) ?? CATEGORY_COPY.list.failed);
    return (
      <div className="categories__state" role="alert" data-testid="category-list-error">
        <p>{message}</p>
        {failure === 'inventory-too-large' ? null : (
          <button type="button" className="category-button" onClick={onRetry}>
            {CATEGORY_COPY.list.retry}
          </button>
        )}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="categories__state" data-testid="category-list-empty">
        {CATEGORY_COPY.list.empty}
      </p>
    );
  }

  return <CategoryTable categories={categories} selectedId={selectedId} onSelect={onSelect} />;
}
