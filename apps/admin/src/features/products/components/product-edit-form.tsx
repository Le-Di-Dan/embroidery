'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { AdminProductDetailResponseStatus } from '@embroidery/api-client';
import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { isVersionConflict } from '../model/product-conflict';
import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import {
  buildUpdateBody,
  formValuesFromDetail,
  hasValidationErrors,
  isFormDirty,
  validateProductForm,
  type ProductFormValues,
} from '../model/product-form-values';
import { ADMIN_PRODUCTS_ROUTE } from '../model/product-route';
import { useProductUpdateMutation } from '../hooks/use-product-mutations';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { ProductConflictDialog, ProductUnsavedDialog } from './product-confirm-dialogs';
import { ProductFormFields } from './product-form-fields';
import { ProductMediaEditor } from './product-media-editor';
import { ProductMetadataRail } from './product-metadata-rail';
import type { ProductMediaRowData } from './product-media-row';
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
 */
export function ProductEditForm({ product, onReload }: ProductEditFormProps) {
  const router = useRouter();
  const initial = useMemo(() => formValuesFromDetail(product), [product]);
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Identity for every media id the screen can render: the product's own media
  // plus whatever the picker has loaded this session.
  const [learned, setLearned] = useState<ReadonlyMap<string, ProductMediaRowData>>(new Map());
  const knownMedia = useMemo(() => {
    const map = new Map<string, ProductMediaRowData>(learned);
    for (const item of product.media) {
      map.set(item.assetId, {
        assetId: item.assetId,
        mediaType: item.mediaType,
        byteSize: item.byteSize,
        createdAt: item.createdAt,
      });
    }
    return map;
  }, [learned, product.media]);

  const onLearnMedia = useCallback((media: readonly ProductMediaRowData[]) => {
    setLearned((current) => {
      const next = new Map(current);
      let changed = false;
      for (const item of media) {
        if (!next.has(item.assetId)) {
          next.set(item.assetId, item);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const mutation = useProductUpdateMutation();
  const dirty = isFormDirty(initial, values);
  const guard = useUnsavedChanges(dirty);
  const saving = mutation.isPending;
  const editable = product.status === AdminProductDetailResponseStatus.DRAFT;

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

  const saveFailed = mutation.isError && !conflict;

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
              disabled={saving || !editable}
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
          <p className="product-form__failure-title">{PRODUCT_FORM_COPY.edit.saveFailedTitle}</p>
          <p className="product-form__failure-body">{PRODUCT_FORM_COPY.edit.saveFailedBody}</p>
        </div>
      ) : null}

      <form id="product-edit-form" className="product-form__body" onSubmit={onSubmit} noValidate>
        <div className="product-form__column">
          <ProductFormFields
            values={values}
            errors={submitted ? errors : {}}
            disabled={saving || !editable}
            showPrice
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />

          <ProductMediaEditor
            selection={values.mediaAssetIds}
            knownMedia={knownMedia}
            disabled={saving || !editable}
            onChange={(mediaAssetIds) => setValues((current) => ({ ...current, mediaAssetIds }))}
            onLearnMedia={onLearnMedia}
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
