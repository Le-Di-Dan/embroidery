'use client';

import { useMemo, useState } from 'react';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { formValuesFromDetail } from '../model/product-form-values';
import { PRODUCT_MEDIA_COPY, PRODUCT_MEDIA_FAILURE_COPY } from '../model/product-media-copy';
import { classifyMediaFailure, isMediaVersionConflict } from '../model/product-media-failure';
import { hasSelectionChanged, selectionFromDetailMedia } from '../model/product-media-selection';
import { useCategoryInventoryQuery } from '../hooks/use-category-inventory-query';
import { useProductMediaMutation } from '../hooks/use-product-media-mutation';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { ProductConflictDialog, ProductUnsavedDialog } from './product-confirm-dialogs';
import { ProductFormFields } from './product-form-fields';
import { ProductMediaEditor } from './product-media-editor';
import { ProductMetadataRail } from './product-metadata-rail';

interface ProductPublishedMediaFormProps {
  readonly product: AdminProductDetailResponse;
  readonly onReload: () => void;
}

/**
 * The PUBLISHED product editor (`936:187` desktop, `948:355` mobile).
 *
 * Before `APP12-M01.B2` a published product's photograph could only be
 * corrected by unpublishing it, editing, and publishing again — which takes it
 * off Discover, drops its address out of the catalog and is visible to every
 * customer browsing at that moment. This screen is the alternative: the images
 * change and **nothing else does**, including the status.
 *
 * ## Why this is a separate component from the draft form
 *
 * Not styling. The two write through different contracts, and conflating them
 * would make the wrong one reachable:
 *
 * - the draft form sends `adminProduct_update`, a diffed PATCH of any generic
 *   field, which `PRODUCT_EDITABLE_STATES` still refuses for a published
 *   product;
 * - this one sends `adminProductMedia_replace` and can express nothing but the
 *   ordered image selection.
 *
 * Splitting them also keeps each under the file-size limit while every branch
 * inside one component would have had to be read to know which request a button
 * makes.
 *
 * ## What is locked, and what that means
 *
 * The commercial groups render, disabled, with a `Chỉ đọc` badge — the operator
 * needs to *see* the product they are curating images for, and a page that hid
 * its own name would be worse than one that shows it as text. They are
 * `<fieldset disabled>`, so the lock is programmatic and not merely grey.
 *
 * ## Conflict behaviour, chosen and stated
 *
 * A stale `expectedUpdatedAt` opens the reload dialog and **preserves the
 * staged selection**. Nothing was written — B2 refuses whole — so discarding
 * the operator's arrangement would be destroying work to report someone else's.
 * Reload is offered, never taken: it remounts this component against the fresh
 * record, which is when the staged order is deliberately dropped in favour of
 * the server's.
 */
export function ProductPublishedMediaForm({ product, onReload }: ProductPublishedMediaFormProps) {
  const initialSelection = useMemo(() => selectionFromDetailMedia(product.media), [product.media]);
  const [selection, setSelection] = useState<readonly string[]>(initialSelection);
  const [conflict, setConflict] = useState(false);

  // Read-only, and shown so the operator can see which category the product is
  // filed under rather than a bare slug or an empty select.
  const categories = useCategoryInventoryQuery();
  const values = useMemo(() => formValuesFromDetail(product), [product]);

  const mutation = useProductMediaMutation();
  const dirty = hasSelectionChanged(initialSelection, selection);
  const guard = useUnsavedChanges(dirty);
  const saving = mutation.isPending;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) {
      return;
    }
    mutation.mutate(
      {
        productId: product.productId,
        // The token the authoritative response last carried, never a remembered
        // one: the parent remounts this component on `updatedAt`, so `product`
        // is always the record the screen is showing.
        body: { expectedUpdatedAt: product.updatedAt, mediaAssetIds: selection },
      },
      {
        onSuccess: (updated) => {
          // Reconciling from the response is what clears the dirty state, moves
          // the concurrency token forward and proves the product is still
          // PUBLISHED — all three from the one payload the server returned.
          setSelection(selectionFromDetailMedia(updated.media));
        },
        onError: (error) => {
          if (isMediaVersionConflict(error)) {
            setConflict(true);
          }
        },
      },
    );
  };

  // While the conflict dialog is open it owns the outcome; the banner speaks for
  // every other refusal. Neither touches the staged selection.
  const failed = mutation.isError && !conflict;
  const failureCopy = PRODUCT_MEDIA_FAILURE_COPY[classifyMediaFailure(mutation.error)];

  return (
    <section className="product-form product-form--published">
      <header className="product-form__header">
        <div className="product-form__heading">
          <h1 className="product-form__title">{product.name}</h1>
          <p className="product-form__subtitle product-form__subtitle--wide">
            {PRODUCT_MEDIA_COPY.published.subtitle}
          </p>
          <p className="product-form__subtitle product-form__subtitle--narrow">
            {PRODUCT_MEDIA_COPY.published.subtitleNarrow}
          </p>
        </div>
        {dirty ? (
          <div className="product-form__header-actions">
            <button
              type="button"
              className="product-form__secondary"
              disabled={saving}
              onClick={() => setSelection(initialSelection)}
            >
              {PRODUCT_MEDIA_COPY.published.cancel}
            </button>
            <button
              type="submit"
              form="product-published-media-form"
              className="product-form__primary"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? PRODUCT_MEDIA_COPY.published.saving : PRODUCT_MEDIA_COPY.published.save}
            </button>
          </div>
        ) : null}
      </header>

      <div className="product-form__published-banner">
        <p className="product-form__published-title">{PRODUCT_MEDIA_COPY.published.bannerTitle}</p>
        <p className="product-form__published-body">{PRODUCT_MEDIA_COPY.published.bannerBody}</p>
      </div>

      {saving ? (
        <div className="product-saving" role="status" aria-live="polite">
          <p className="product-saving__title">{PRODUCT_MEDIA_COPY.published.savingTitle}</p>
        </div>
      ) : null}

      {failed ? (
        <div className="product-form__failure" role="alert">
          <p className="product-form__failure-title">{failureCopy.title}</p>
          <p className="product-form__failure-body">{failureCopy.body}</p>
        </div>
      ) : null}

      <form
        id="product-published-media-form"
        className="product-form__body"
        onSubmit={onSubmit}
        noValidate
      >
        <div className="product-form__column">
          <ProductFormFields
            values={values}
            errors={{}}
            disabled
            locked
            showPrice
            categories={categories.data ?? []}
            onChange={noop}
          />

          <ProductMediaEditor
            selection={selection}
            disabled={saving}
            requiresAtLeastOne
            emphasised
            onChange={setSelection}
          />
        </div>

        <ProductMetadataRail
          product={product}
          statusNote={PRODUCT_MEDIA_COPY.published.statusNote}
        />
      </form>

      {conflict ? (
        <ProductConflictDialog
          // The media wording, not the generic one: nothing on this screen edits
          // a field, so the operator needs to be told their *images* moved.
          title={PRODUCT_MEDIA_FAILURE_COPY['version-conflict'].title}
          body={PRODUCT_MEDIA_FAILURE_COPY['version-conflict'].body}
          onClose={() => setConflict(false)}
          onReload={() => {
            setConflict(false);
            onReload();
          }}
        />
      ) : null}

      {guard.prompting ? (
        <ProductUnsavedDialog onLeave={guard.confirmLeave} onStay={guard.cancelLeave} />
      ) : null}
    </section>
  );
}

/**
 * The locked fields never emit a change — they are inside a disabled
 * `<fieldset>` — so this is the honest handler rather than a state setter that
 * could never run. It is named so a reader does not go looking for the write it
 * implies.
 */
function noop(): void {
  /* the commercial fields are read-only on a published product */
}
