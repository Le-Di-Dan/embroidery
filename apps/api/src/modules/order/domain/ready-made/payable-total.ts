/**
 * Exact VND arithmetic for the Ready-Made **payable total** (`BR-027`,
 * `APP12-B03` §12).
 *
 * ```text
 * payable_total = frozen merchandise subtotal + exact shipping fee
 * ```
 *
 * That single addition is the whole module. There is no deposit split, no
 * remaining percentage, no quotation, no discount, no tax and no promotion —
 * `BR-029` gives a Ready-Made order exactly one obligation for exactly that
 * figure, and every one of those concepts belongs to the custom-commerce path.
 *
 * ### Why this is not an `add` on `merchandise-amount.ts`
 *
 * `APP12-B02`'s merchandise module states its own reason for having no
 * addition: *"A module with no addition cannot be edited into adding a shipping
 * fee"*, which is what keeps order **creation** producing a subtotal rather
 * than a payable total (`BR-027` forbids a Ready-Made order being created with
 * one). Adding the operator there to reuse it here would delete that guarantee
 * for the benefit of one caller. So the composition lives in the checkpoint
 * that is actually allowed to compose, and creation keeps a module that
 * physically cannot.
 *
 * ### Why this is not `shipping-fee-amount.ts` either
 *
 * That module's `successorAmount` computes `live + delta` — a **custom**
 * recalculation, which moves the previous balance by the fee difference and
 * never reconstructs a total from its parts (`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md`
 * §1.2). Ready-Made has no previous balance to move on its first fee, and its
 * correction is a *recomposition* from the frozen subtotal, not a delta applied
 * to a figure. Two different rules that happen to both involve a fee; sharing
 * one function would make a future edit to either silently change the other.
 *
 * Amounts are `bigint` hundredths of a VND — exact at every magnitude
 * `numeric(14,2)` holds — and no value on this path is ever a JS `number`.
 */

/** Hundredths of one VND. The only in-memory representation of an amount. */
export type PayableAmount = bigint & { readonly __brand: 'PayableAmount' };

const HUNDREDTHS = 100n;

/** `numeric(14,2)` — twelve integer digits, two fractional. */
const MAX_HUNDREDTHS = 10n ** 14n - 1n;

/** No sign, no exponent, no separator, at most two fractional digits. */
const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Reads a non-negative amount into hundredths, or `undefined`.
 *
 * Used for both the stored subtotal and the operator's fee. A **negative** fee
 * is unrepresentable rather than checked for: the pattern admits no sign, so
 * `BR-027`'s `fee >= 0` is enforced by the parse itself and there is no branch
 * that could be reordered around it.
 */
export function parsePayableAmount(text: string): PayableAmount | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined;
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'))) as PayableAmount;
}

/** The two-decimal form `numeric(14,2)` stores. The only way out of `bigint`. */
export function formatPayableAmount(amount: PayableAmount): string {
  const whole = amount / HUNDREDTHS;
  const fraction = amount % HUNDREDTHS;
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

/**
 * `subtotal + fee` — the exact payable total, or `undefined` if it does not fit.
 *
 * The overflow answer is `undefined` rather than a thrown error or a truncated
 * figure, because the caller's response to an unpriceable order is a refusal
 * with nothing written, not an exception to translate at a distance.
 */
export function payableTotalOf(
  subtotal: PayableAmount,
  fee: PayableAmount,
): PayableAmount | undefined {
  const total = subtotal + fee;
  return total > MAX_HUNDREDTHS ? undefined : (total as PayableAmount);
}

/**
 * Whether the amount is a whole đồng — `ck_orders__total_currency_scale` and
 * `ck_payment_obligations__amount_currency_scale` (DEV-DB6-005).
 *
 * Mirrored here so a fractional đồng is refused as input rather than surfacing
 * from the driver as a constraint violation the operator cannot act on.
 */
export function isWholeDong(amount: PayableAmount): boolean {
  return amount % HUNDREDTHS === 0n;
}

/**
 * Whether the amount can be a payment obligation's — `> 0`
 * (`ck_payment_obligations__amount_positive`).
 *
 * Note the asymmetry with the **fee**, which may legitimately be exactly zero:
 * free shipping is a real commercial decision (`BR-027`), and it is a different
 * fact from "not priced yet", which is `NULL`. What may never be zero is the
 * total someone is asked to pay.
 */
export function isPayableObligationAmount(amount: PayableAmount): boolean {
  return amount > 0n;
}
