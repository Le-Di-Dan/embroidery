/**
 * The shipping-detail editor's data model: reading the contract, shaping the
 * `PUT` body, and comparing a fee without ever computing one (`812:4`).
 *
 * ## The nullable members arrive loosely typed, so they are narrowed here
 *
 * The committed OpenAPI artifact declares `feeAmount`, `carrierName`,
 * `trackingCode`, `ward`, `district` and `frozenAt` as `nullable: true` with
 * `type: "object"`, so Orval renders each of them `{ [key: string]: unknown } |
 * null` rather than `string | null`. Generated files are never hand-edited and
 * `APP9-A01` may not change the contract, so the narrowing happens at this seam
 * instead — with a real `typeof` check, not a cast. That is not a workaround
 * dressed up as validation: a member typed `unknown` genuinely may not be a
 * string, and `readOptionalText` answers `null` for every value that is not one
 * rather than putting `[object Object]` into an input. The contract defect is
 * `FU-APP9-A01-01`.
 *
 * ## No arithmetic touches a fee, anywhere
 *
 * `feeAmount` is `numeric(14,2)` transported as a decimal string. This module
 * contains no `Number(...)`, no `parseFloat`, no unary `+` and no arithmetic
 * operator applied to one. The increase test is a **digit-string comparison**:
 * normalize both sides to whole đồng, compare lengths, then compare
 * lexicographically. A VND figure through an IEEE-754 double is precision loss
 * no later formatting can undo, and a `0.1 + 0.2` comparison deciding whether a
 * customer's consent is required is not a defect anyone would find twice.
 *
 * The comparison is also **not an authority**. The server measures the increase
 * against its own stored `previousFeeAmount` — which may not be what this
 * browser last read — and refuses on its own terms. All this decides is whether
 * the editor warns before a round trip.
 *
 * ## Save is a full replacement, and the body says so
 *
 * `PUT /admin/orders/{orderId}/shipping-detail` takes a complete
 * `SaveShippingDetailBody`, not a patch: an optional member the body omits is
 * cleared, not left alone. So every field the operator can see is sent on every
 * save, and an emptied optional field is omitted deliberately — that is what
 * clearing it means. `additionalProperties: false` means nothing else may travel
 * with it.
 */
import type { AdminShippingDetailResponse, SaveShippingDetailBody } from '@embroidery/api-client';

/** Exactly the members the editor renders, all as text. */
export interface ShippingFormValues {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward: string;
  readonly district: string;
  readonly province: string;
  readonly feeAmount: string;
  readonly carrierName: string;
  readonly trackingCode: string;
}

export const EMPTY_SHIPPING_FORM: ShippingFormValues = {
  recipientName: '',
  recipientPhone: '',
  addressLine: '',
  ward: '',
  district: '',
  province: '',
  feeAmount: '',
  carrierName: '',
  trackingCode: '',
};

/** The field names the editor may write. Nothing else reaches the body. */
export type ShippingFormField = keyof ShippingFormValues;

/**
 * One loosely-typed nullable member, as a string or `null`.
 *
 * Total: `null`, `undefined`, an object and a number all answer `null`, so an
 * unexpected wire value degrades to an empty field rather than to text no
 * operator can act on.
 */
export function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The stored detail as editable text. Absent optional members read as empty. */
export function toShippingFormValues(detail: AdminShippingDetailResponse): ShippingFormValues {
  return {
    recipientName: detail.recipientName,
    recipientPhone: detail.recipientPhone,
    addressLine: detail.addressLine,
    ward: readOptionalText(detail.ward) ?? '',
    district: readOptionalText(detail.district) ?? '',
    province: detail.province,
    feeAmount: readOptionalText(detail.feeAmount) ?? '',
    carrierName: readOptionalText(detail.carrierName) ?? '',
    trackingCode: readOptionalText(detail.trackingCode) ?? '',
  };
}

/** The five members `SaveShippingDetailBody` marks required. */
export const REQUIRED_SHIPPING_FIELDS: readonly ShippingFormField[] = [
  'recipientName',
  'recipientPhone',
  'addressLine',
  'province',
  'feeAmount',
];

/** The shape the contract's `feeAmount` pattern accepts. */
const FEE_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Which fields the operator must still fix, in the order they are drawn.
 *
 * A local mirror of the published contract so a missing field is reported at the
 * input rather than after a round trip (`820:69`) — never a second validation
 * authority. The server re-validates everything and remains the only judge of a
 * refusal.
 */
export function findShippingFieldErrors(values: ShippingFormValues): readonly ShippingFormField[] {
  const missing = REQUIRED_SHIPPING_FIELDS.filter((field) => values[field].trim() === '');
  const fee = values.feeAmount.trim();
  if (fee !== '' && !FEE_PATTERN.test(fee)) {
    return [...missing, 'feeAmount'];
  }
  return missing;
}

/** An optional member is sent when it has text, and omitted when it does not. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The complete replacement body.
 *
 * Built with explicit conditional spreads rather than by assigning `undefined`:
 * `exactOptionalPropertyTypes` is on, and a present key holding `undefined`
 * would serialize as an explicit `null` the contract does not accept.
 */
export function toSaveShippingBody(values: ShippingFormValues): SaveShippingDetailBody {
  const ward = optional(values.ward);
  const district = optional(values.district);
  const carrierName = optional(values.carrierName);
  const trackingCode = optional(values.trackingCode);
  return {
    recipientName: values.recipientName.trim(),
    recipientPhone: values.recipientPhone.trim(),
    addressLine: values.addressLine.trim(),
    province: values.province.trim(),
    feeAmount: values.feeAmount.trim(),
    ...(ward === undefined ? {} : { ward }),
    ...(district === undefined ? {} : { district }),
    ...(carrierName === undefined ? {} : { carrierName }),
    ...(trackingCode === undefined ? {} : { trackingCode }),
  };
}

/**
 * A fee as whole đồng digits, or `null` when it is not a fee this can compare.
 *
 * VND has no minor unit and the money rules refuse anything that is not a whole
 * đồng before it is stored, so a persisted fraction is always `.00`. A non-zero
 * fraction is something this system never wrote: it answers `null`, and the
 * comparison then declines to judge rather than dropping digits.
 */
function toWholeDongDigits(amount: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (match === null) return null;
  const [, integer = '', fraction] = match;
  if (fraction !== undefined && /[^0]/.test(fraction)) return null;
  return integer.replace(/^0+(?=\d)/, '');
}

/**
 * Whether the entered fee is strictly greater than the stored one — the only
 * case that needs the customer's acknowledgement (DB3 §1.2).
 *
 * Answers `false` when either side is unreadable or the stored fee is absent. A
 * false negative here costs one refused round trip and the approved refusal card;
 * a false positive would warn an operator away from a save the server would have
 * accepted.
 */
export function isFeeIncrease(stored: unknown, entered: string): boolean {
  const previous = toWholeDongDigits(readOptionalText(stored) ?? '');
  const next = toWholeDongDigits(entered);
  if (previous === null || next === null) return false;
  if (next.length !== previous.length) return next.length > previous.length;
  return next > previous;
}

/** Whether anything in the form differs from the stored detail. */
export function hasShippingChanges(
  values: ShippingFormValues,
  original: ShippingFormValues,
): boolean {
  return (Object.keys(values) as ShippingFormField[]).some(
    (field) => values[field] !== original[field],
  );
}
