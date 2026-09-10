/**
 * The SKU dialog's values, and the exact bodies they become.
 *
 * ### Price inheritance is a mode, not an empty field
 *
 * `976:187` draws a two-way radio — *use the product price* / *set a price for
 * this SKU* — rather than an optional amount input, and this module carries
 * that as an explicit `priceMode`. The difference is not cosmetic: with a bare
 * optional field, clearing the input and submitting is indistinguishable from
 * never having touched it, and the operator's intent to *return to the product
 * price* would have nowhere to be expressed. With a mode, `inherit` sends
 * `null` on an update — an instruction — and `override` sends digits.
 *
 * `"0"` is never turned into inheritance. It is a well-formed override the
 * server stores, and the readiness criterion `SKU_PRICE_RESOLVABLE` is what
 * refuses it. Silently reinterpreting it here would publish a product at a
 * price the operator did not choose.
 *
 * ### What the create body cannot say
 *
 * `CreateSkuBody.priceOverrideAmount` is optional and not nullable, so
 * inheritance on create is expressed by **omitting** the field, not by sending
 * null. `UpdateSkuBody` is nullable, so an update says it explicitly. The two
 * bodies are built separately here for that reason rather than sharing one
 * mapper that would have to fake one of the two.
 */
import type { CreateSkuBody, UpdateSkuBody } from '@embroidery/api-client';

import { overrideInputToAmount } from './sku-effective-price';

export type SkuPriceMode = 'inherit' | 'override';

export interface SkuFormValues {
  readonly code: string;
  readonly priceMode: SkuPriceMode;
  /** Raw operator text; only meaningful while `priceMode` is `override`. */
  readonly priceOverride: string;
  readonly isActive: boolean;
}

/**
 * A new SKU starts inheriting and **active**: the operator is adding something
 * to sell, and the ambiguity refusal — not a defensive default — is what
 * handles the case where the variant already has one.
 */
export const NEW_SKU_FORM: SkuFormValues = {
  code: '',
  priceMode: 'inherit',
  priceOverride: '',
  isActive: true,
};

export function skuFormFrom(sku: {
  readonly code: string;
  readonly priceOverrideAmount?: string;
  readonly isActive: boolean;
}): SkuFormValues {
  const override = sku.priceOverrideAmount;
  return {
    code: sku.code,
    priceMode: override === undefined ? 'inherit' : 'override',
    priceOverride: override ?? '',
    isActive: sku.isActive,
  };
}

export type SkuFormError = 'codeRequired' | 'priceRequired' | 'priceInvalid';

export function validateSkuForm(values: SkuFormValues): SkuFormError | null {
  if (values.code.trim() === '') return 'codeRequired';
  if (values.priceMode === 'inherit') return null;
  if (values.priceOverride.trim() === '') return 'priceRequired';
  return overrideInputToAmount(values.priceOverride) === null ? 'priceInvalid' : null;
}

/**
 * The create body. Inheritance omits the field entirely, because the contract
 * offers no null for it.
 *
 * Callers validate first; an override that cannot be normalized is omitted
 * rather than sent as text, so a bug in a caller produces an inherited SKU the
 * operator can see and fix rather than a 400 with a body it cannot explain.
 */
export function toCreateSkuBody(values: SkuFormValues): CreateSkuBody {
  const base = { code: values.code.trim(), isActive: values.isActive };
  if (values.priceMode === 'inherit') return base;
  const amount = overrideInputToAmount(values.priceOverride);
  return amount === null ? base : { ...base, priceOverrideAmount: amount };
}

/**
 * The update body for a definition edit: the code and the price.
 *
 * Inheritance is stated as `null` — an instruction to clear, which the create
 * body has no way to express.
 *
 * `isActive` is deliberately absent, for the reason the variant body omits it.
 * Selling and not selling is authored by the row's own control, because that is
 * the change that can make a published product unbuyable and the change the
 * ambiguity rule is written about; echoing back a flag the form was merely
 * seeded with would let a stale dialog reactivate a SKU someone else stopped.
 */
export function toUpdateSkuBody(values: SkuFormValues): UpdateSkuBody {
  const base = { code: values.code.trim() };
  if (values.priceMode === 'inherit') return { ...base, priceOverrideAmount: null };
  const amount = overrideInputToAmount(values.priceOverride);
  return amount === null ? base : { ...base, priceOverrideAmount: amount };
}

/** The body for a pure sell/stop-selling change, which touches neither code nor price. */
export function toSkuActivationBody(isActive: boolean): UpdateSkuBody {
  return { isActive };
}
