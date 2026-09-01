'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import {
  buildCreateBody,
  EMPTY_CREATE_VALUES,
  hasValidationErrors,
  isCreateFormDirty,
  validateProductForm,
  type ProductFormValues,
  type ProductValidationErrors,
} from '../model/product-form-values';
import { ADMIN_PRODUCTS_ROUTE, adminProductDetailRoute } from '../model/product-route';
import { useProductCreateMutation } from '../hooks/use-product-mutations';
import { useUnsavedChanges } from '../hooks/use-unsaved-changes';
import { ProductUnsavedDialog } from './product-confirm-dialogs';
import { useCategoryInventoryQuery } from '../hooks/use-category-inventory-query';
import { ProductFormFields } from './product-form-fields';
import { ProductValidationSummary } from './product-validation-summary';

/**
 * Create mode — `/products/new` (`521:284` — Chế độ Tạo).
 *
 * Exactly the three fields `adminProduct_create` accepts. Price, media, slug
 * and status are absent because the POST body cannot carry them and the record
 * does not exist yet; rendering a disabled price box here would suggest a value
 * is being captured when nothing would be sent.
 *
 * One request. The draft is created and the operator is taken to its detail
 * route using the `productId` the server returned — never an id guessed from a
 * list refetch, and never a second PATCH hidden behind the same button.
 */
export function ProductCreateScreen() {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(EMPTY_CREATE_VALUES);
  const [submitted, setSubmitted] = useState(false);
  const mutation = useProductCreateMutation();
  // The category options are the categories the database currently publishes
  // (`APP12-C01-C1`). Empty while the read is in flight, or if it fails: the
  // select then offers its placeholder alone rather than a remembered list.
  const categories = useCategoryInventoryQuery();

  const dirty = isCreateFormDirty(values) && !mutation.isSuccess;
  const guard = useUnsavedChanges(dirty);

  const errors: ProductValidationErrors = validateProductForm(
    values,
    {
      name: PRODUCT_FORM_COPY.validation.nameRequired,
      category: PRODUCT_FORM_COPY.validation.categoryRequired,
      price: PRODUCT_FORM_COPY.validation.priceInvalid,
    },
    { requirePrice: false },
  );

  const submitting = mutation.isPending;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasValidationErrors(errors)) {
      return;
    }
    const body = buildCreateBody(values);
    if (body === null) {
      return;
    }
    mutation.mutate(body, {
      onSuccess: (product) => {
        router.push(adminProductDetailRoute(product.productId));
      },
    });
  };

  return (
    <section className="product-form">
      <header className="product-form__header">
        <div className="product-form__heading">
          <h1 className="product-form__title">{PRODUCT_FORM_COPY.create.title}</h1>
          <p className="product-form__subtitle">{PRODUCT_FORM_COPY.create.subtitle}</p>
        </div>
      </header>

      {submitted ? (
        <ProductValidationSummary
          title={PRODUCT_FORM_COPY.validation.createSummaryTitle}
          errors={errors}
        />
      ) : null}

      {mutation.isError ? (
        <div className="product-form__failure" role="alert">
          <p className="product-form__failure-title">{PRODUCT_FORM_COPY.create.failedTitle}</p>
          <p className="product-form__failure-body">{PRODUCT_FORM_COPY.create.failedBody}</p>
        </div>
      ) : null}

      <p className="product-form__sr-status" role="status" aria-live="polite">
        {mutation.isSuccess ? PRODUCT_FORM_COPY.create.created : ''}
      </p>

      <form className="product-form__body" onSubmit={onSubmit} noValidate>
        <div className="product-form__column">
          <ProductFormFields
            values={values}
            errors={submitted ? errors : {}}
            disabled={submitting}
            showPrice={false}
            categories={categories.data ?? []}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
        </div>

        <div className="product-form__actions">
          <button
            type="button"
            className="product-form__secondary"
            disabled={submitting}
            onClick={() => guard.requestNavigation(() => router.push(ADMIN_PRODUCTS_ROUTE))}
          >
            {PRODUCT_FORM_COPY.create.cancel}
          </button>
          <button
            type="submit"
            className="product-form__primary"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? PRODUCT_FORM_COPY.create.submitting : PRODUCT_FORM_COPY.create.submit}
          </button>
        </div>
      </form>

      {guard.prompting ? (
        <ProductUnsavedDialog onLeave={guard.confirmLeave} onStay={guard.cancelLeave} />
      ) : null}
    </section>
  );
}
