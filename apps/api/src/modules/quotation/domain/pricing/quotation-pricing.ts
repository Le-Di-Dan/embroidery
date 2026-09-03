/**
 * Turning an operator's priced lines into the facts a version stores
 * (`APP6-G01` §6.2/§6.4, CST-064, `APP6-B01`).
 *
 * Everything derivable is **derived here**, from exact `bigint` arithmetic, and
 * nothing derivable is accepted from the client:
 *
 * ```text
 * lineTotal = unitPrice × quantity
 * subtotal  = Σ lineTotal
 * total     = subtotal + manualAdjustment + shippingFee     (CST-064)
 * deposit   = round-half-up(total × depositPercent)         (DB4, policy data)
 * remaining = total − deposit                               (CST-064)
 * ```
 *
 * A client that could send a subtotal could send one its lines do not explain,
 * and a total nobody can justify to the customer is the failure this arrangement
 * removes rather than validates. The deposit percentage is the only value from
 * outside, and it arrives already parsed from the published `quotation.deposit`
 * policy — never a literal in this file.
 *
 * CST-064 remains the final arithmetic invariant; this computes values it will
 * accept, and refuses ones it would reject *before* the insert, so the operator
 * gets a stated reason instead of a sanitised constraint violation.
 */
import type { QuotationLineItem } from '../repositories/quotation.repository';
import type { QuotationDepositPolicy } from './quotation-deposit-policy';
import {
  addVnd,
  fitsVndColumn,
  formatPercent,
  formatVndAmount,
  isWholeVnd,
  multiplyVnd,
  parseVndAmount,
  percentageOfVnd,
  subtractVnd,
  ZERO_VND,
  type VndAmount,
} from './vnd-amount';

/** One line as the operator submitted it — no line total, that is derived. */
export interface DraftLineInput {
  readonly lineKind: QuotationLineItem['lineKind'];
  readonly description: string;
  readonly skuId?: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
}

export interface DraftPricingInput {
  readonly lineItems: readonly DraftLineInput[];
  readonly shippingFeeAmount: string;
  readonly manualAdjustmentAmount: string | undefined;
  readonly adjustmentReason: string | undefined;
}

/** Exactly the priced facts a version row needs, all as strings. */
export interface DraftPricing {
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly adjustmentReason: string | undefined;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly lineItems: readonly QuotationLineItem[];
}

export type PricingResult =
  | { readonly ok: true; readonly pricing: DraftPricing }
  | { readonly ok: false; readonly reason: string };

function invalid(reason: string): PricingResult {
  return { ok: false, reason };
}

/**
 * Reads one submitted amount.
 *
 * `allowNegative` is true only for the manual adjustment, which is the one
 * figure a discount can drive below zero (`manual_adjustment_amount` carries no
 * non-negative CHECK, while the total does).
 */
function readAmount(
  text: string,
  label: string,
  allowNegative: boolean,
):
  | { readonly ok: true; readonly amount: VndAmount }
  | { readonly ok: false; readonly reason: string } {
  const amount = parseVndAmount(text);
  if (amount === undefined) {
    return { ok: false, reason: `${label} is not an amount this system can price.` };
  }
  if (!allowNegative && amount < ZERO_VND) {
    return { ok: false, reason: `${label} cannot be negative.` };
  }
  if (!isWholeVnd(amount)) {
    return { ok: false, reason: `${label} must be a whole đồng; VND has no minor unit.` };
  }
  return { ok: true, amount };
}

export function computeDraftPricing(
  input: DraftPricingInput,
  policy: QuotationDepositPolicy,
): PricingResult {
  if (input.lineItems.length === 0) {
    return invalid('A quotation version needs at least one priced line.');
  }

  const lines: QuotationLineItem[] = [];
  let subtotal = ZERO_VND;

  for (const [index, line] of input.lineItems.entries()) {
    const position = index + 1;
    const unitPrice = readAmount(
      line.unitPriceAmount,
      `Line ${String(position)} unit price`,
      false,
    );
    if (!unitPrice.ok) {
      return invalid(unitPrice.reason);
    }
    const lineTotal = multiplyVnd(unitPrice.amount, line.quantity);
    if (!fitsVndColumn(lineTotal)) {
      return invalid(`Line ${String(position)} total is larger than this system can price.`);
    }
    subtotal = addVnd(subtotal, lineTotal);
    lines.push({
      position,
      lineKind: line.lineKind,
      description: line.description,
      skuId: line.skuId,
      quantity: line.quantity,
      unitPriceAmount: formatVndAmount(unitPrice.amount),
      lineTotalAmount: formatVndAmount(lineTotal),
    });
  }

  const shipping = readAmount(input.shippingFeeAmount, 'The shipping fee', false);
  if (!shipping.ok) {
    return invalid(shipping.reason);
  }

  const adjustmentText = input.manualAdjustmentAmount ?? '0';
  const adjustment = readAmount(adjustmentText, 'The manual adjustment', true);
  if (!adjustment.ok) {
    return invalid(adjustment.reason);
  }
  // `ck_quotation_versions__adjustment_reason_required` — evidence for why the
  // total was moved off the priced lines. Checked here so the refusal names the
  // missing reason rather than a constraint.
  const adjusted = adjustment.amount !== ZERO_VND;
  const reason = input.adjustmentReason;
  if (adjusted && (reason === undefined || reason === '')) {
    return invalid('A manual adjustment needs a reason.');
  }
  if (!adjusted && reason !== undefined) {
    return invalid('There is no manual adjustment for that reason to explain.');
  }

  const total = addVnd(subtotal, adjustment.amount, shipping.amount);
  if (total < ZERO_VND) {
    return invalid('The adjustment takes the total below zero.');
  }
  if (!fitsVndColumn(total) || !fitsVndColumn(subtotal)) {
    return invalid('This total is larger than this system can price.');
  }

  const deposit = percentageOfVnd(total, policy.depositPercentHundredths);
  const remaining = subtractVnd(total, deposit);

  return {
    ok: true,
    pricing: {
      subtotalAmount: formatVndAmount(subtotal),
      manualAdjustmentAmount: formatVndAmount(adjustment.amount),
      adjustmentReason: adjusted ? reason : undefined,
      shippingFeeAmount: formatVndAmount(shipping.amount),
      totalAmount: formatVndAmount(total),
      depositPercent: formatPercent(policy.depositPercentHundredths),
      depositAmount: formatVndAmount(deposit),
      remainingAmount: formatVndAmount(remaining),
      lineItems: lines,
    },
  };
}
