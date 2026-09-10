'use client';

import type { AdminProductVariantResponse } from '@embroidery/api-client';

import type { SellabilityDialogState } from '../hooks/use-sellability-dialogs';
import type { SellabilityWriteFailure } from '../model/sellability-failure';
import { NEW_SKU_FORM, skuFormFrom, type SkuFormValues } from '../model/sku-form';
import { NEW_VARIANT_FORM, variantFormFrom, type VariantFormValues } from '../model/variant-form';
import { orderEligibleSkuOf, variantTitle } from '../model/variant-presentation';
import { SkuDialog } from './sku-dialog';
import { StructureBreakDialog } from './structure-break-dialog';
import { VariantDialog } from './variant-dialog';

interface SellabilityDialogHostProps {
  readonly state: SellabilityDialogState;
  /** The authoritative list, re-read after every write. Rows are looked up by id here. */
  readonly variants: readonly AdminProductVariantResponse[];
  readonly basePriceAmount: string;
  readonly pending: boolean;
  readonly failure: SellabilityWriteFailure | null;
  readonly onSubmitVariant: (values: VariantFormValues) => void;
  readonly onSubmitSku: (values: SkuFormValues) => void;
  readonly onConfirmStructureBreak: () => void;
  readonly onDismiss: () => void;
}

function findVariant(
  variants: readonly AdminProductVariantResponse[],
  variantId: string,
): AdminProductVariantResponse | undefined {
  return variants.find((variant) => variant.variantId === variantId);
}

/**
 * Renders whichever dialog the section has opened, resolved against the current
 * authoritative list.
 *
 * Every dialog's subject is looked up by id **at render time** rather than
 * captured when it opened. After a refused write the list has been re-read, and
 * a captured row would keep describing the state before the refusal — the SKU
 * ambiguity refusal is exactly where that matters, because the code it names
 * has to be the one the server just objected to.
 *
 * A dialog whose subject has disappeared from the list renders nothing rather
 * than an empty shell. The row is gone, the section behind it already shows
 * that, and there is nothing left for the operator to confirm.
 *
 * This component owns no state and performs no write. It is the one place the
 * dialog union is exhausted, which is what keeps the section from growing a
 * second copy of that switch.
 */
export function SellabilityDialogHost({
  state,
  variants,
  basePriceAmount,
  pending,
  failure,
  onSubmitVariant,
  onSubmitSku,
  onConfirmStructureBreak,
  onDismiss,
}: SellabilityDialogHostProps) {
  switch (state.kind) {
    case 'none':
      return null;

    case 'variantCreate':
      return (
        <VariantDialog
          mode="create"
          subjectTitle=""
          initialValues={NEW_VARIANT_FORM}
          pending={pending}
          failure={failure}
          onSubmit={onSubmitVariant}
          onDismiss={onDismiss}
        />
      );

    case 'variantEdit': {
      const variant = findVariant(variants, state.variantId);
      if (variant === undefined) return null;
      return (
        <VariantDialog
          mode="edit"
          subjectTitle={variantTitle(variant)}
          initialValues={variantFormFrom(variant)}
          pending={pending}
          failure={failure}
          onSubmit={onSubmitVariant}
          onDismiss={onDismiss}
        />
      );
    }

    case 'skuCreate': {
      const variant = findVariant(variants, state.variantId);
      if (variant === undefined) return null;
      const conflicting = orderEligibleSkuOf(variant);
      return (
        <SkuDialog
          mode="create"
          variantTitle={variantTitle(variant)}
          basePriceAmount={basePriceAmount}
          initialValues={NEW_SKU_FORM}
          pending={pending}
          failure={failure}
          {...(conflicting === null ? {} : { conflictingSkuCode: conflicting.code })}
          onSubmit={onSubmitSku}
          onDismiss={onDismiss}
        />
      );
    }

    case 'skuEdit': {
      const variant = findVariant(variants, state.variantId);
      const sku = variant?.skus.find((candidate) => candidate.skuId === state.skuId);
      if (variant === undefined || sku === undefined) return null;
      const conflicting = orderEligibleSkuOf(variant);
      return (
        <SkuDialog
          mode="edit"
          variantTitle={variantTitle(variant)}
          basePriceAmount={basePriceAmount}
          initialValues={skuFormFrom(sku)}
          pending={pending}
          failure={failure}
          {...(conflicting === null || conflicting.skuId === sku.skuId
            ? {}
            : { conflictingSkuCode: conflicting.code })}
          onSubmit={onSubmitSku}
          onDismiss={onDismiss}
        />
      );
    }

    case 'confirmVariantDeactivate': {
      const variant = findVariant(variants, state.variantId);
      if (variant === undefined) return null;
      return (
        <StructureBreakDialog
          kind="lastVariant"
          subject={variantTitle(variant)}
          pending={pending}
          failure={failure}
          onConfirm={onConfirmStructureBreak}
          onDismiss={onDismiss}
        />
      );
    }

    case 'confirmSkuDeactivate': {
      const sku = variants
        .flatMap((variant) => variant.skus)
        .find((candidate) => candidate.skuId === state.skuId);
      if (sku === undefined) return null;
      return (
        <StructureBreakDialog
          kind="lastSku"
          subject={sku.code}
          pending={pending}
          failure={failure}
          onConfirm={onConfirmStructureBreak}
          onDismiss={onDismiss}
        />
      );
    }

    default:
      return null;
  }
}
