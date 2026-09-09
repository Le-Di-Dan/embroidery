'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { classifySaveFailure, isVersionConflict } from '../model/product-conflict';
import { PRODUCT_FORM_COPY, PRODUCT_SAVE_FAILURE_COPY } from '../model/product-form-copy';
import {
  buildUpdateBody,
  formValuesFromDetail,
  hasValidationErrors,
  isFormDirty,
  validateProductForm,
  type ProductFormValues,
} from '../model/product-form-values';
import { mediaStatusByAssetId } from '../model/product-media-selection';
import { ADMIN_PRODUCTS_ROUTE } from '../model/product-route';
import { useProductUpdateMutation } from '../hooks/use-product-mutations';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { ProductConflictDialog, ProductUnsavedDialog } from './product-confirm-dialogs';
import { useCategoryInventoryQuery } from '../hooks/use-category-inventory-query';
import { ProductFormFields } from './product-form-fields';
import { ProductMediaEditor } from './product-media-editor';
import { ProductMetadataRail } from './product-metadata-rail';
import { ProductSavingBanner, ProductValidationSummary } from './product-validation-summary';

interface ProductEditFormProps {
  readonly product: AdminProductDetailResponse;
  readonly onReload: () => void;
}

/**
 * Edit/detail mode (`434:20`, `436:37`, `436:140`, `438:90`).
 *
 * The form is seeded from the authoritative record and diffed against that same
 * seed, so a PATCH carries only fields the operator actually changed plus the
 * `expectedUpdatedAt` the record arrived with. Fields nobody touched stay out of
 * the request and therefore survive a concurrent edit by someone else.
 *
 * Success is never assumed. The screen shows the saving state, then replaces
 * its own state with the response — which is what refreshes the concurrency
 * token for the next save. A conflict opens the reload dialog and changes
 * nothing else: the operator's edits stay on screen until they choose.
 *
 * Remounting on `updatedAt` (see the parent) is what makes the seed
 * authoritative after a reload without this component tracking two versions of
 * the truth.
 *
 * **DRAFT only.** This component used to render for any status and disable
 * itself when the product was not a draft, which after `APP12-M01.B2` became
 * wrong in both directions: it locked a media section the contract now accepts,
 * and it kept a save button wired to a PATCH the server refuses. A published
 * product is now `ProductPublishedMediaForm`'s, and the choice is the detail
 * screen's, so neither component carries a branch for the other's contract.
 */
export function ProductEditForm({ product, onReload }: ProductEditFormProps) {
  const router = useRouter();
  const initial = useMemo(() => formValuesFromDetail(product), [product]);
  // Read-only, and never part of `values`: the form's state is what gets sent,
  // and an Asset's health is not something the operator is writing.
  const mediaStatus = useMemo(() => mediaStatusByAssetId(product.media), [product.media]);
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [conflict, setConflict] = useState(false);

  // The category options are the categories the database currently publishes
  // (`APP12-C01-C1`). Empty while the read is in flight, or if it fails: the
  // select then offers its placeholder alone rather than a remembered list.
  const categories = useCategoryInventoryQuery();

  const mutation = useProductUpdateMutation();
  const dirty = isFormDirty(initial, values);
  const guard = useUnsavedChanges(dirty);
  const saving = mutation.isPending;

  const errors = validateProductForm(
    values,
    {
      name: PRODUCT_FORM_COPY.validation.nameRequired,
      category: PRODUCT_FORM_COPY.validation.categoryRequired,
      price: PRODUCT_FORM_COPY.validation.priceInvalid,
    },
    { requirePrice: true },
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasValidationErrors(errors)) {
      return;
    }
    const body = buildUpdateBody(initial, values, product.updatedAt);
    if (body === null) {
      return;
    }
    mutation.mutate(
      { productId: product.productId, body },
      {
        onSuccess: (updated) => {
          // Reconcile from the authoritative response first: it clears the dirty
          // state, so the departure below is a save, not an abandonment.
          setValues(formValuesFromDetail(updated));
          setSubmitted(false);
          router.push(ADMIN_PRODUCTS_ROUTE);
        },
        onError: (error) => {
          if (isVersionConflict(error)) {
            setConflict(true);
          }
        },
      },
    );
  };

  // The banner speaks for every failure the dialog does not: while the conflict
  // dialog is open it owns the outcome, and what it leaves behind is the
  // generic message. The operator's edits are never touched by any of them.
  const saveFailed = mutation.isError && !conflict;
  const failureCopy = PRODUCT_SAVE_FAILURE_COPY[classifySaveFailure(mutation.error)];

  return (
    <section className="product-form">
      <header className="product-form__header">
        <div className="product-form__heading">
          <h1 className="product-form__title">{product.name}</h1>
          <p className="product-form__subtitle product-form__subtitle--wide">
            {PRODUCT_FORM_COPY.edit.subtitle}
          </p>
          <p className="product-form__subtitle product-form__subtitle--narrow">
            {PRODUCT_FORM_COPY.edit.subtitleNarrow}
          </p>
        </div>
        {/*
          Both actions exist only once there is something to act on. On an
          untouched record `Lưu thay đổi` would save nothing and `Huỷ thay đổi`
          would discard nothing, so offering them states a change is pending
          when none is. Leaving the screen without editing is the shell's job.
        */}
        {dirty ? (
          <div className="product-form__header-actions">
            <button
              type="button"
              className="product-form__secondary"
              disabled={saving}
              onClick={() => guard.requestNavigation(() => router.push(ADMIN_PRODUCTS_ROUTE))}
            >
              {PRODUCT_FORM_COPY.edit.cancel}
            </button>
            <button
              type="submit"
              form="product-edit-form"
              className="product-form__primary"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? PRODUCT_FORM_COPY.edit.saving : PRODUCT_FORM_COPY.edit.save}
            </button>
          </div>
        ) : null}
      </header>

      {submitted ? (
        <ProductValidationSummary
          title={PRODUCT_FORM_COPY.validation.summaryTitle}
          errors={errors}
        />
      ) : null}

      {saving ? <ProductSavingBanner /> : null}

      {saveFailed ? (
        <div className="product-form__failure" role="alert">
          <p className="product-form__failure-title">{failureCopy.title}</p>
          <p className="product-form__failure-body">{failureCopy.body}</p>
        </div>
      ) : null}

      <form id="product-edit-form" className="product-form__body" onSubmit={onSubmit} noValidate>
        <div className="product-form__column">
          <ProductFormFields
            values={values}
            errors={submitted ? errors : {}}
            disabled={saving}
            showPrice
            categories={categories.data ?? []}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />

          {/*
            One save, not two. The draft PATCH already carries `mediaAssetIds`
            as one of the fields it diffs, so the media grid feeds the same form
            state every other field does and `Lưu thay đổi` commits all of it
            atomically. Routing media through `adminProductMedia_replace` here
            would split one operator action into two independent HTTP writes and
            make a half-saved product reachable (`APP12-M01.A1` §3).

            `requiresAtLeastOne` is false: a draft with no images is a legal
            state, and the publication gate — not this screen — is where an
            empty gallery is refused.
          */}
          <ProductMediaEditor
            selection={values.mediaAssetIds}
            statusByAssetId={mediaStatus}
            disabled={saving}
            requiresAtLeastOne={false}
            onChange={(mediaAssetIds) => setValues((current) => ({ ...current, mediaAssetIds }))}
          />

          <p className="product-form__note">{PRODUCT_FORM_COPY.edit.savePublishNote}</p>
        </div>

        <ProductMetadataRail product={product} />
      </form>

      {conflict ? (
        <ProductConflictDialog
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
