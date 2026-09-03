'use client';

import { useState } from 'react';

import { TransitionCategoryBodyAction } from '@embroidery/api-client';

import {
  classifyCategoryFailure,
  isSlugFieldFailure,
  type CategoryFailure,
} from '../model/category-conflict';
import { CATEGORY_COPY, categoryFailureMessage } from '../model/category-copy';
import {
  canArchiveCategory,
  canPublishCategory,
  isCategoryFieldEditable,
  isCategoryReadOnly,
} from '../model/category-editability';
import {
  EMPTY_CATEGORY_FORM,
  hasCategoryValidationError,
  isEmptyCategoryPatch,
  toCategoryFormValues,
  toCreateCategoryBody,
  toUpdateCategoryBody,
  validateCategoryForm,
  type CategoryFormValues,
} from '../model/category-form-values';
import {
  useCategoryCreateMutation,
  useCategoryTransitionMutation,
  useCategoryUpdateMutation,
} from '../hooks/use-category-mutations';
import type { AdminCategory } from '../services/admin-category.service';
import { CategoryArchiveRefusal } from './category-archive-refusal';
import { CategoryConflictAlert } from './category-conflict-alert';
import { CategoryFormFields } from './category-form-fields';

interface CategoryFormPanelProps {
  /** `null` in create mode; the selected row otherwise. */
  readonly category: AdminCategory | null;
  readonly onClose: () => void;
  /** Refetches the inventory — the only recovery from a version conflict. */
  readonly onReload: () => void;
  /** Called with the server's record after a create, so the list can select it. */
  readonly onCreated: (categoryId: string) => void;
}

/**
 * The category form (`916:347` DRAFT · `916:370` PUBLISHED · `916:391`
 * archive refused), rendered as the panel the frames draw rather than as a
 * modal over the table.
 *
 * ## What each state offers, and why nothing more
 *
 * - **Create** — `Lưu nháp` alone. `adminCategory_create` always yields
 *   `DRAFT`, there is no status picker, and there is deliberately no
 *   create-and-publish: publication is the moment a public URL comes into
 *   existence and it stays a separate, deliberate decision.
 * - **`DRAFT`** — everything editable, `Lưu nháp` and `Xuất bản` (`916:363`,
 *   `916:365`). Publish is `adminCategory_transition`, never a status PATCH.
 * - **`PUBLISHED`** — `Lưu` and `Lưu trữ` (`916:384`, `916:386`). The slug is
 *   locked and says so; name, indexability and order stay editable.
 * - **`ARCHIVED`** — read-only. No relist, no restore, no delete: the contract
 *   publishes none of them, so the screen offers none of them.
 *
 * ## The token is the server's
 *
 * Every write carries `expectedUpdatedAt` copied verbatim from the record this
 * panel was seeded with. It is never composed from a clock.
 *
 * ## Re-seeding is the parent's `key`, not an effect here
 *
 * The parent remounts this panel on `id:updatedAt` (the same pattern the
 * product form uses), so a write that advances the version produces a panel
 * seeded from the server's new truth with no local state carried over, and no
 * effect that has to remember to reset three things.
 *
 * That distinction matters most for a *refused* archive. The refusal
 * invalidates the inventory precisely so the blocking count is re-read — but
 * the transition failed, so `updatedAt` did not advance, the key is unchanged,
 * and the panel is not remounted. The refusal survives the refetch that gives
 * it its number. An effect keyed on the record object would have cleared the
 * refusal at the very moment it became accurate.
 */
export function CategoryFormPanel({
  category,
  onClose,
  onReload,
  onCreated,
}: CategoryFormPanelProps) {
  const [values, setValues] = useState<CategoryFormValues>(() =>
    category === null ? EMPTY_CATEGORY_FORM : toCategoryFormValues(category),
  );
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<CategoryFailure | null>(null);

  const create = useCategoryCreateMutation();
  const update = useCategoryUpdateMutation();
  const transition = useCategoryTransitionMutation();
  const pending = create.isPending || update.isPending || transition.isPending;

  const status = category?.status;
  const readOnly = category !== null && isCategoryReadOnly(status);
  const slugEditable = category === null || isCategoryFieldEditable(status, 'slug');
  const errors = validateCategoryForm(values, { editableSlug: slugEditable });
  const invalid = hasCategoryValidationError(errors);

  const onFailed = (error: unknown) => setFailure(classifyCategoryFailure(error));

  const onSave = () => {
    setSubmitted(true);
    setFailure(null);
    if (invalid) return;

    if (category === null) {
      create.mutate(toCreateCategoryBody(values), {
        onSuccess: (record) => onCreated(record.id),
        onError: onFailed,
      });
      return;
    }

    const body = toUpdateCategoryBody(values, category, { editableSlug: slugEditable });
    // An empty patch would spend a write, advance the concurrency token and
    // invalidate every other operator's in-flight edit, all to change nothing.
    if (isEmptyCategoryPatch(body)) {
      onClose();
      return;
    }
    update.mutate({ categoryId: category.id, body }, { onError: onFailed });
  };

  const onTransition = (action: keyof typeof TransitionCategoryBodyAction) => {
    if (category === null) return;
    setFailure(null);
    transition.mutate(
      {
        categoryId: category.id,
        body: {
          action: TransitionCategoryBodyAction[action],
          expectedUpdatedAt: category.updatedAt,
        },
      },
      { onError: onFailed },
    );
  };

  const slugFieldError =
    failure !== null && isSlugFieldFailure(failure)
      ? (categoryFailureMessage(failure) ?? undefined)
      : undefined;
  const panelMessage =
    failure !== null && !isSlugFieldFailure(failure) ? categoryFailureMessage(failure) : null;

  return (
    <section
      className="category-panel"
      aria-label={category?.name ?? CATEGORY_COPY.form.createTitle}
    >
      <div className="category-panel__head">
        <h2 className="category-panel__title">
          {category?.name ?? CATEGORY_COPY.form.createTitle}
        </h2>
        <button type="button" className="category-panel__close" onClick={onClose}>
          {CATEGORY_COPY.form.cancel}
        </button>
      </div>

      {readOnly ? (
        <p className="category-panel__notice" data-testid="category-archived-notice">
          {CATEGORY_COPY.form.archivedNotice}
        </p>
      ) : null}

      {failure === 'version-conflict' ? (
        <CategoryConflictAlert onReload={onReload} onDismiss={() => setFailure(null)} />
      ) : null}

      {failure === 'archive-blocked' && category !== null ? (
        <CategoryArchiveRefusal
          publishedProductCount={category.publishedProductCount}
          categorySlug={category.slug}
        />
      ) : null}

      {panelMessage === null ? null : (
        <p className="category-panel__error" role="alert" data-testid="category-panel-error">
          {panelMessage}
        </p>
      )}

      <form
        className="category-panel__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset className="category-panel__fields" disabled={pending}>
          <CategoryFormFields
            values={values}
            errors={submitted ? errors : {}}
            slugEditable={slugEditable}
            readOnly={readOnly}
            {...(slugFieldError === undefined ? {} : { slugFieldError })}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
        </fieldset>

        {readOnly ? null : (
          <div className="category-panel__actions">
            <button
              type="submit"
              className={
                canPublishCategory(status) || category === null
                  ? 'category-button'
                  : 'category-button category-button--primary'
              }
              disabled={pending}
              data-testid="category-save"
            >
              {saveLabel(category, pending, create.isPending || update.isPending)}
            </button>

            {canPublishCategory(status) ? (
              <button
                type="button"
                className="category-button category-button--primary"
                disabled={pending}
                data-testid="category-publish"
                onClick={() => onTransition('PUBLISH')}
              >
                {transition.isPending ? CATEGORY_COPY.form.publishing : CATEGORY_COPY.form.publish}
              </button>
            ) : null}

            {canArchiveCategory(status) ? (
              <button
                type="button"
                className="category-button"
                disabled={pending}
                data-testid="category-archive"
                onClick={() => onTransition('ARCHIVE')}
              >
                {transition.isPending ? CATEGORY_COPY.form.archiving : CATEGORY_COPY.form.archive}
              </button>
            ) : null}
          </div>
        )}
      </form>
    </section>
  );
}

/**
 * `Lưu nháp` while the category is still a draft (`916:363`), `Lưu` once it is
 * published (`916:384`) — the frame's own distinction, and an accurate one:
 * saving a draft publishes nothing.
 */
function saveLabel(category: AdminCategory | null, pending: boolean, saving: boolean): string {
  if (pending && saving) return CATEGORY_COPY.form.saving;
  return category !== null && !canPublishCategory(category.status)
    ? CATEGORY_COPY.form.save
    : CATEGORY_COPY.form.saveDraft;
}
