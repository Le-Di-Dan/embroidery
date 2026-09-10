/**
 * What one SKU actually sells for, and how the operator reads it without
 * opening a dialog.
 *
 * The rule is the contract's, not this screen's: the effective unit price is
 * `COALESCE(skus.price_override_amount, products.base_price_amount)`
 * (`BR-021` / `IMP-D058`). This module reproduces exactly that and adds
 * nothing — no default, no fallback amount, no minimum.
 *
 * ### `0` is an override, never inheritance
 *
 * `priceOverrideAmount` is validated by `^\d{1,12}$`, so `"0"` is a
 * well-formed value the server stores and returns. An operator who typed it
 * chose a price of zero; treating it as "no override" would silently replace
 * their decision with the product's base price and publish a product at a price
 * nobody set. So absence and `"0"` are different states here, and only absence
 * means inheritance. `"0"` is carried through as an override that
 * `SKU_PRICE_RESOLVABLE` will reject — which is the honest outcome, and the one
 * `977:413` draws.
 *
 * ### Why the resolvability test is mirrored and not owned
 *
 * The server's `isPublishablePrice` requires VND, integer form and `> 0`, and
 * it remains the only authority on whether a product may be published. The
 * mirror here exists so a SKU row can *say* its price is unusable next to the
 * value itself, rather than leaving the operator to discover it three screens
 * away on the readiness checklist. It never decides eligibility, and no code
 * path here changes what is sent or what is published.
 *
 * All work is on digit strings. There is no `Number`, no `parseInt` and no
 * arithmetic operator applied to an amount anywhere in this module: a đồng
 * amount through an IEEE-754 double is precision loss no later formatting can
 * undo.
 */
import type { AdminVariantSkuResponse } from '@embroidery/api-client';

import { formatGroupedAmount } from '../../../shared/presentation/exact-amount';

/**
 * The Vietnamese đồng mark. A currency symbol rather than copy: it is not
 * translated, and it is what the approved frames render beside every amount.
 */
const DONG = '₫';

/** The contract's digit ceiling for a price override (`^\d{1,12}$`). */
export const PRICE_OVERRIDE_MAX_DIGITS = 12;

const DIGITS_ONLY = /^\d+$/;

/** Whether a decimal string is a price the server would accept for publication. */
export function isResolvablePrice(amount: string | undefined): boolean {
  if (amount === undefined) return false;
  const digits = amount.trim();
  if (!DIGITS_ONLY.test(digits) || digits.length > PRICE_OVERRIDE_MAX_DIGITS) return false;
  return digits.replace(/^0+/u, '') !== '';
}

/** One amount rendered for reading, e.g. `250000` → `250.000 ₫`. */
export function formatDong(amount: string): string {
  return `${formatGroupedAmount(amount)} ${DONG}`;
}

/**
 * Where a SKU's price comes from and whether it can be sold at.
 *
 * `source` answers the question the row asks — is this the product's price or
 * this SKU's own — and it is decided by the *presence* of the override alone,
 * so `"0"` reads as `override` and not as `inherited`.
 */
export interface SkuEffectivePrice {
  readonly source: 'inherited' | 'override';
  /** The amount that would apply, as the decimal string it was stored as. */
  readonly amount: string;
  /** Whether that amount would satisfy `SKU_PRICE_RESOLVABLE`. */
  readonly resolvable: boolean;
}

export function resolveSkuPrice(
  sku: Pick<AdminVariantSkuResponse, 'priceOverrideAmount'>,
  productBasePriceAmount: string,
): SkuEffectivePrice {
  const override = sku.priceOverrideAmount;
  if (override !== undefined) {
    return { source: 'override', amount: override, resolvable: isResolvablePrice(override) };
  }
  return {
    source: 'inherited',
    amount: productBasePriceAmount,
    resolvable: isResolvablePrice(productBasePriceAmount),
  };
}

/**
 * The wire value for what the operator typed into the override field.
 *
 * Returns `null` when the text cannot be a legal override, so the dialog shows
 * the approved validation message instead of sending a request the server will
 * refuse. Leading zeros are stripped because `"00250"` and `"250"` are the same
 * amount and only one of them is worth storing — but a value that strips to
 * nothing stays `"0"`, because the operator did type a zero and this module
 * does not get to decide that they meant something else.
 */
export function overrideInputToAmount(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '' || !DIGITS_ONLY.test(trimmed)) return null;
  const normalized = trimmed.replace(/^0+/u, '');
  const amount = normalized === '' ? '0' : normalized;
  return amount.length > PRICE_OVERRIDE_MAX_DIGITS ? null : amount;
}
