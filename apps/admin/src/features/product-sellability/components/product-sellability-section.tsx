'use client';

import { useState } from 'react';

import type { AdminProductVariantResponse, AdminVariantSkuResponse } from '@embroidery/api-client';

import {
  useCreateSkuMutation,
  useCreateVariantMutation,
  useUpdateSkuMutation,
  useUpdateVariantMutation,
} from '../hooks/use-sellability-mutations';
import { useProductVariantsQuery } from '../hooks/use-product-variants-query';
import { useSellabilityDialogs } from '../hooks/use-sellability-dialogs';
import { SELLABILITY_SECTION_ID } from '../model/sellability-anchor';
import { SELLABILITY_COPY } from '../model/sellability-copy';
import { classifySellabilityWriteFailure } from '../model/sellability-failure';
import { toCreateSkuBody, toSkuActivationBody, toUpdateSkuBody } from '../model/sku-form';
import type { SkuFormValues } from '../model/sku-form';
import {
  toCreateVariantBody,
  toUpdateVariantBody,
  toVariantActivationBody,
} from '../model/variant-form';
import type { VariantFormValues } from '../model/variant-form';
import { isLastActiveVariant, isLastOrderEligibleSku } from '../model/variant-presentation';
import { SellabilityDialogHost } from './sellability-dialog-host';
import { VariantCard } from './variant-card';

interface ProductSellabilitySectionProps {
  readonly productId: string;
  /** The authoritative product status. Only `PUBLISHED` gets the structural confirmations. */
  readonly status: string;
  /** The product's base price, which every inheriting SKU sells at. */
  readonly basePriceAmount: string;
  /** Refreshes the publication readiness report, which this feature does not key. */
  readonly onStructureChanged: () => void;
}

const PUBLISHED = 'PUBLISHED';

/**
 * `Phiên bản & SKU` — the Ready-Made sellability authoring section
 * (`971:187`, `972:187`, `973:187`, `978:187`, `979:187`, `979:222`).
 *
 * One bounded capability added to the existing product editor. It adds no
 * route, no top-level screen and no API operation: it is the section that was
 * missing between "this product exists" and "a customer can buy it".
 *
 * ### It is editable on a published product, and unlocks nothing else
 *
 * Name, description, category and base price stay behind the existing
 * read-only lock, and `M01`'s media curation stays exactly as delivered. This
 * section is independently editable because a live product with no orderable
 * variant has to be repairable **in place** — an `unpublish → edit → republish`
 * cycle would take a working storefront page down to fix a problem the customer
 * cannot see.
 *
 * ### Two structural changes pass a confirmation, and only on a published product
 *
 * Deactivating the last active variant, or the last order-eligible SKU, is what
 * makes a published product unbuyable. On a draft, both are ordinary edits and
 * the readiness checklist is where the consequence is reported. Neither ever
 * auto-unpublishes, and neither is described as `hết hàng`.
 *
 * ### Nothing is optimistic and nothing retries
 *
 * Every write settles against the server and is followed by an authoritative
 * re-read, which is also what makes a lost response harmless. Inactive variants
 * and inactive SKUs stay visible as history; there is no delete anywhere in
 * this subtree.
 */
export function ProductSellabilitySection({
  productId,
  status,
  basePriceAmount,
  onStructureChanged,
}: ProductSellabilitySectionProps) {
  const query = useProductVariantsQuery(productId);
  const dialogs = useSellabilityDialogs();
  // Exactly one variant expanded at a time (`D01` §D). Held here rather than in
  // the card, because "one at a time" is a fact about the list.
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  const context = { productId, onStructureChanged };
  const createVariant = useCreateVariantMutation(context);
  const updateVariant = useUpdateVariantMutation(context);
  const createSku = useCreateSkuMutation(context);
  const updateSku = useUpdateSkuMutation(context);

  const copy = SELLABILITY_COPY.section;
  const variants: readonly AdminProductVariantResponse[] = query.data?.variants ?? [];
  const pending =
    createVariant.isPending ||
    updateVariant.isPending ||
    createSku.isPending ||
    updateSku.isPending;

  const onVariantError = (error: unknown) =>
    dialogs.fail(classifySellabilityWriteFailure(error, 'variant'));
  const onSkuError = (error: unknown) =>
    dialogs.fail(classifySellabilityWriteFailure(error, 'sku'));

  const submitVariant = (values: VariantFormValues) => {
    dialogs.clearFailure();
    const state = dialogs.state;
    if (state.kind === 'variantCreate') {
      createVariant.mutate(
        { body: toCreateVariantBody(values) },
        { onSuccess: dialogs.close, onError: onVariantError },
      );
      return;
    }
    if (state.kind === 'variantEdit') {
      updateVariant.mutate(
        { variantId: state.variantId, body: toUpdateVariantBody(values) },
        { onSuccess: dialogs.close, onError: onVariantError },
      );
    }
  };

  const submitSku = (values: SkuFormValues) => {
    dialogs.clearFailure();
    const state = dialogs.state;
    if (state.kind === 'skuCreate') {
      createSku.mutate(
        { variantId: state.variantId, body: toCreateSkuBody(values) },
        { onSuccess: dialogs.close, onError: onSkuError },
      );
      return;
    }
    if (state.kind === 'skuEdit') {
      updateSku.mutate(
        { skuId: state.skuId, body: toUpdateSkuBody(values) },
        { onSuccess: dialogs.close, onError: onSkuError },
      );
    }
  };

  const deactivateVariant = (variantId: string) => {
    updateVariant.mutate(
      { variantId, body: toVariantActivationBody(false) },
      { onSuccess: dialogs.close, onError: onVariantError },
    );
  };

  const setSkuSelling = (skuId: string, isActive: boolean) => {
    updateSku.mutate(
      { skuId, body: toSkuActivationBody(isActive) },
      { onSuccess: dialogs.close, onError: onSkuError },
    );
  };

  const confirmStructureBreak = () => {
    dialogs.clearFailure();
    const state = dialogs.state;
    if (state.kind === 'confirmVariantDeactivate') deactivateVariant(state.variantId);
    else if (state.kind === 'confirmSkuDeactivate') setSkuSelling(state.skuId, false);
  };

  const toggleVariantActive = (variant: AdminProductVariantResponse) => {
    if (!variant.isActive) {
      updateVariant.mutate(
        { variantId: variant.variantId, body: toVariantActivationBody(true) },
        { onSuccess: dialogs.close, onError: onVariantError },
      );
      return;
    }
    if (status === PUBLISHED && isLastActiveVariant(variants, variant.variantId)) {
      dialogs.open({ kind: 'confirmVariantDeactivate', variantId: variant.variantId });
      return;
    }
    deactivateVariant(variant.variantId);
  };

  const toggleSkuActive = (sku: AdminVariantSkuResponse) => {
    if (sku.isActive && status === PUBLISHED && isLastOrderEligibleSku(variants, sku.skuId)) {
      dialogs.open({ kind: 'confirmSkuDeactivate', skuId: sku.skuId });
      return;
    }
    setSkuSelling(sku.skuId, !sku.isActive);
  };

  return (
    <section className="product-sellability" id={SELLABILITY_SECTION_ID}>
      <div className="product-sellability__header">
        <h3 className="product-sellability__title">{copy.title}</h3>
        {/*
          The section has a different save model from the form around it:
          dialogs commit immediately, the header's save button never touches a
          variant. A screen with two save models that does not say which is
          which is a defect waiting to be filed (`D01` §D).
        */}
        <p className="product-sellability__help">{copy.help}</p>
      </div>

      {query.isPending ? (
        <p className="product-sellability__status" role="status">
          {copy.loading}
        </p>
      ) : null}

      {query.isError ? (
        <div className="product-sellability__failure" role="alert">
          <p className="product-sellability__failure-title">{copy.failureTitle}</p>
          <p className="product-sellability__failure-body">{copy.failureBody}</p>
          <button
            type="button"
            className="product-sellability__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}

      {query.data === undefined ? null : (
        <>
          {variants.length === 0 ? (
            <div className="product-sellability__empty" data-testid="sellability-empty">
              <p className="product-sellability__empty-title">{copy.emptyTitle}</p>
              <p className="product-sellability__empty-body">{copy.emptyBody}</p>
            </div>
          ) : (
            <>
              <p className="product-sellability__count">{copy.variantCount(variants.length)}</p>
              <ul className="product-sellability__variants">
                {variants.map((variant) => (
                  <VariantCard
                    key={variant.variantId}
                    variant={variant}
                    basePriceAmount={basePriceAmount}
                    expanded={expandedVariantId === variant.variantId}
                    disabled={pending}
                    onToggleExpanded={() =>
                      setExpandedVariantId((current) =>
                        current === variant.variantId ? null : variant.variantId,
                      )
                    }
                    onEditVariant={() =>
                      dialogs.open({ kind: 'variantEdit', variantId: variant.variantId })
                    }
                    onToggleVariantActive={() => toggleVariantActive(variant)}
                    onAddSku={() =>
                      dialogs.open({ kind: 'skuCreate', variantId: variant.variantId })
                    }
                    onEditSku={(sku) =>
                      dialogs.open({
                        kind: 'skuEdit',
                        variantId: variant.variantId,
                        skuId: sku.skuId,
                      })
                    }
                    onToggleSkuActive={toggleSkuActive}
                  />
                ))}
              </ul>
            </>
          )}

          <button
            type="button"
            className="product-sellability__primary"
            disabled={pending}
            data-testid="sellability-add-variant"
            onClick={() => dialogs.open({ kind: 'variantCreate' })}
          >
            {copy.addVariant}
          </button>
        </>
      )}

      <SellabilityDialogHost
        state={dialogs.state}
        variants={variants}
        basePriceAmount={basePriceAmount}
        pending={pending}
        failure={dialogs.failure}
        onSubmitVariant={submitVariant}
        onSubmitSku={submitSku}
        onConfirmStructureBreak={confirmStructureBreak}
        onDismiss={dialogs.close}
      />
    </section>
  );
}
