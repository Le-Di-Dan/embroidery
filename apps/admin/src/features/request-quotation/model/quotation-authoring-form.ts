/**
 * The authoring form: what the operator types, and the body it becomes
 * (`APP6-A01` §8, §9, §12).
 *
 * Every field here exists in `APP6-B01`'s `.strict()` request schema, and no
 * field here is absent from it. That is the whole design rule: the body is
 * `.strict()`, so an invented key is a `400` naming it, and a *derived* amount
 * would be refused even if it were correct. There is therefore no subtotal, no
 * total, no deposit and no line total on this type — the server computes all
 * five and this screen renders what comes back.
 *
 * ### The offered line kinds are narrower than the enum
 *
 * The schema publishes six kinds. Two of them — `SHIPPING` and `ADJUSTMENT` —
 * have dedicated body fields (`shippingFeeAmount`, `manualAdjustmentAmount`)
 * that feed `CST-064`'s arithmetic directly, so offering them *also* as priced
 * lines is how a shipping fee gets counted twice: once in the subtotal and once
 * again in the total. They are excluded from the form on that arithmetic ground,
 * not on a stylistic one.
 *
 * `PRODUCT` is excluded on a business ground, and only for one branch: on a
 * customer-owned request the customer supplies the garment, so there is no
 * product to price and no SKU to name. `APP6-A01` §9 makes that the approved COP
 * form semantics, and it holds here even though the server's enum is broader.
 *
 * ### Validation guides; it never adjudicates
 *
 * The checks below mirror the published contract so the operator hears about a
 * malformed figure without a round trip. The server re-validates everything and
 * remains the only authority on `QUOTATION_PRICING_INVALID`. Where the two could
 * disagree the server wins, and the screen shows its refusal.
 */
import type { CreateQuotationDraftBody } from '@embroidery/api-client';

import { REQUEST_QUOTATION_COPY as COPY } from './request-quotation-copy';
import { isWellFormedAmount, isZeroAmount } from './exact-money';

/** The kinds a Catalog request may price. */
export const CATALOG_LINE_KINDS = ['PRODUCT', 'EMBROIDERY', 'DIGITIZING_FEE', 'OTHER'] as const;

/** The kinds a customer-owned request may price. `PRODUCT` is absent by rule. */
export const COP_LINE_KINDS = ['EMBROIDERY', 'DIGITIZING_FEE', 'OTHER'] as const;

export type AuthoringLineKind = (typeof CATALOG_LINE_KINDS)[number];

export function lineKindsFor(
  subjectKind: 'CATALOG' | 'CUSTOMER_OWNED' | 'UNKNOWN',
): readonly AuthoringLineKind[] {
  // An unresolved subject is treated as customer-owned for this one purpose: it
  // is the narrower offer, and offering a PRODUCT line for a request whose
  // subject cannot be read is how a garment nobody can name gets priced.
  return subjectKind === 'CATALOG' ? CATALOG_LINE_KINDS : COP_LINE_KINDS;
}

export interface AuthoringLine {
  readonly lineKind: AuthoringLineKind;
  readonly description: string;
  /** Text, not a number: it is validated as digits and sent as an integer once. */
  readonly quantity: string;
  /** The exact unit price, as typed. Never converted to a float. */
  readonly unitPriceAmount: string;
}

export interface AuthoringForm {
  readonly quantityTotal: string;
  readonly stitchCount: string;
  readonly shippingFeeAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly adjustmentReason: string;
  readonly lineItems: readonly AuthoringLine[];
}

export function emptyLine(kinds: readonly AuthoringLineKind[]): AuthoringLine {
  return {
    lineKind: kinds[0] ?? 'OTHER',
    description: '',
    quantity: '1',
    unitPriceAmount: '',
  };
}

export function emptyForm(kinds: readonly AuthoringLineKind[]): AuthoringForm {
  return {
    quantityTotal: '',
    stitchCount: '',
    shippingFeeAmount: '0',
    manualAdjustmentAmount: '',
    adjustmentReason: '',
    lineItems: [emptyLine(kinds)],
  };
}

/** One refusal, bound to the control it is about. */
export interface FieldIssue {
  /** `lineItems.2.unitPriceAmount`, or a plain field name. */
  readonly field: string;
  readonly message: string;
}

const POSITIVE_INTEGER = /^\d+$/;

function isPositiveInteger(text: string): boolean {
  const trimmed = text.trim();
  return POSITIVE_INTEGER.test(trimmed) && /[^0]/.test(trimmed);
}

function isNonNegativeInteger(text: string): boolean {
  return POSITIVE_INTEGER.test(text.trim());
}

/**
 * What the server would refuse, checked locally first.
 *
 * The adjustment rule is **bidirectional**, because `computeDraftPricing` is: a
 * non-zero adjustment without a reason is refused, and a reason with no
 * adjustment to explain is refused too. Mirroring only the first half would let
 * the operator submit a form the server rejects for a rule the screen never
 * mentioned.
 */
export function validateForm(form: AuthoringForm): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (!isPositiveInteger(form.quantityTotal)) {
    issues.push({ field: 'quantityTotal', message: COPY.validation.quantityTotal });
  }
  if (form.stitchCount.trim() !== '' && !isNonNegativeInteger(form.stitchCount)) {
    issues.push({ field: 'stitchCount', message: COPY.validation.stitchCount });
  }
  if (!isWellFormedAmount(form.shippingFeeAmount)) {
    issues.push({ field: 'shippingFeeAmount', message: COPY.validation.shippingFee });
  }

  const adjustmentText = form.manualAdjustmentAmount.trim();
  const hasAdjustmentText = adjustmentText !== '';
  if (hasAdjustmentText && !isWellFormedAmount(adjustmentText)) {
    issues.push({ field: 'manualAdjustmentAmount', message: COPY.validation.manualAdjustment });
  }

  // An omitted adjustment and an explicit zero are the same thing to the server:
  // it defaults the field to '0' and then asks whether the value is non-zero.
  const adjusts = hasAdjustmentText && !isZeroAmount(adjustmentText);
  const reason = form.adjustmentReason.trim();
  if (adjusts && reason === '') {
    issues.push({ field: 'adjustmentReason', message: COPY.validation.adjustmentReasonRequired });
  }
  if (!adjusts && reason !== '') {
    issues.push({ field: 'adjustmentReason', message: COPY.validation.adjustmentReasonUnexpected });
  }

  form.lineItems.forEach((line, index) => {
    if (line.description.trim() === '') {
      issues.push({
        field: `lineItems.${String(index)}.description`,
        message: COPY.validation.lineDescription,
      });
    }
    if (!isPositiveInteger(line.quantity)) {
      issues.push({
        field: `lineItems.${String(index)}.quantity`,
        message: COPY.validation.lineQuantity,
      });
    }
    if (!isWellFormedAmount(line.unitPriceAmount)) {
      issues.push({
        field: `lineItems.${String(index)}.unitPriceAmount`,
        message: COPY.validation.lineUnitPrice,
      });
    }
  });

  return issues;
}

/** The version body both drafting operations share. */
type VersionBody = Omit<CreateQuotationDraftBody, 'customRequestId'>;

/**
 * The form as `APP6-B01` accepts it.
 *
 * Optional fields are **omitted** rather than sent empty. The body is
 * `.strict()` and `adjustmentReason` is `.trim().min(1)`, so an empty string
 * would be a `400`; more importantly, sending `adjustmentReason: ''` alongside a
 * zero adjustment is the precise shape `computeDraftPricing` refuses as "there
 * is no manual adjustment for that reason to explain".
 *
 * The two integer fields are the only places a `Number` appears in this feature,
 * and neither is money: `quantityTotal` and `stitchCount` are counts the
 * contract types as integers. Every amount stays a string end to end.
 */
export function toVersionBody(form: AuthoringForm): VersionBody {
  const adjustmentText = form.manualAdjustmentAmount.trim();
  const adjusts = adjustmentText !== '' && !isZeroAmount(adjustmentText);
  const stitchCount = form.stitchCount.trim();
  const reason = form.adjustmentReason.trim();

  return {
    quantityTotal: Number.parseInt(form.quantityTotal.trim(), 10),
    ...(stitchCount === '' ? {} : { stitchCount: Number.parseInt(stitchCount, 10) }),
    shippingFeeAmount: form.shippingFeeAmount.trim(),
    ...(adjustmentText === '' ? {} : { manualAdjustmentAmount: adjustmentText }),
    ...(adjusts && reason !== '' ? { adjustmentReason: reason } : {}),
    lineItems: form.lineItems.map((line) => ({
      lineKind: line.lineKind,
      description: line.description.trim(),
      quantity: Number.parseInt(line.quantity.trim(), 10),
      unitPriceAmount: line.unitPriceAmount.trim(),
    })),
  };
}

/** The create body: the shared version shape plus the request it belongs to. */
export function toCreateBody(requestId: string, form: AuthoringForm): CreateQuotationDraftBody {
  return { customRequestId: requestId, ...toVersionBody(form) };
}
