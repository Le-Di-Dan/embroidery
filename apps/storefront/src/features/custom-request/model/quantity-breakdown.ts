/**
 * The size-keyed quantity breakdown (`APP5-G01` §3, contract
 * `CustomRequestQuantityLine`).
 *
 * ## One variant, many sizes — not many variants
 *
 * `APP5-S01` §3.2 is the rule this module exists to make unrepresentable: every
 * persisted line belongs to the request's **one** selected variant, so a line
 * carries a `sizeLabel` and a `quantity` and **no variant id of any kind**.
 * There is no field here through which a second variant could enter, which is
 * why the "quantity table becomes a multi-variant selector" mistake cannot be
 * made by editing a component — it would have to change this type first.
 *
 * ## `sizeLabel` is this line's own label
 *
 * `product_variants.sizeLabel` and `CustomRequestQuantityLine.sizeLabel` may
 * render the same characters for some catalog data, and no authority makes them
 * the same business field (`APP5-S01` §3.3). Nothing here copies one into the
 * other, defaults it from the selected variant, or validates it against one.
 */
import type { CustomRequestQuantityLine } from '@embroidery/api-client';

/** One row as the customer is editing it: both fields are free text. */
export interface QuantityDraftLine {
  /** Stable across re-renders so React keys and field ids do not reshuffle. */
  readonly key: string;
  readonly sizeLabel: string;
  /** As typed. Parsed on submit, never coerced while the customer is typing. */
  readonly quantity: string;
}

/** Contract bounds, read from the published schema rather than chosen here. */
export const QUANTITY_MAX = 100_000;
export const QUANTITY_LINES_MAX = 50;
export const SIZE_LABEL_MAX = 50;

export function emptyQuantityLine(key: string): QuantityDraftLine {
  return { key, sizeLabel: '', quantity: '' };
}

/**
 * A positive integer within the published bound, or `undefined`.
 *
 * Rejects `1.5`, `1e3`, `+1`, `Infinity` and whitespace-only input explicitly:
 * `Number('')` is `0` and `Number(' 1 ')` is `1`, so a bare `Number()` would
 * accept two things the contract does not.
 */
export function parseQuantity(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  if (value <= 0 || value > QUANTITY_MAX) return undefined;
  return value;
}

/** Which of a line's fields the customer must fix, if any. */
export type QuantityLineIssue = 'QUANTITY_INVALID' | 'SIZE_TOO_LONG';

export function quantityLineIssue(line: QuantityDraftLine): QuantityLineIssue | undefined {
  if (line.sizeLabel.length > SIZE_LABEL_MAX) return 'SIZE_TOO_LONG';
  if (parseQuantity(line.quantity) === undefined) return 'QUANTITY_INVALID';
  return undefined;
}

/** A line the customer has not started filling in is not an error yet. */
export function isBlankLine(line: QuantityDraftLine): boolean {
  return line.sizeLabel.trim() === '' && line.quantity.trim() === '';
}

/**
 * The lines that would be sent, in the order they are displayed.
 *
 * Blank lines are dropped rather than rejected — an empty extra row is how the
 * approved table offers "add another size", not a mistake — and `sizeLabel` is
 * omitted entirely when empty, because the contract marks it optional and an
 * empty string would fail its `minLength: 1`.
 */
export function toQuantityLines(lines: readonly QuantityDraftLine[]): CustomRequestQuantityLine[] {
  const result: CustomRequestQuantityLine[] = [];
  for (const line of lines) {
    if (isBlankLine(line)) continue;
    const quantity = parseQuantity(line.quantity);
    if (quantity === undefined) continue;
    const sizeLabel = line.sizeLabel.trim();
    result.push(sizeLabel === '' ? { quantity } : { quantity, sizeLabel });
  }
  return result;
}

/** The sum the approved table shows beneath the rows. */
export function quantityTotal(lines: readonly QuantityDraftLine[]): number {
  return toQuantityLines(lines).reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Is the breakdown ready to send?
 *
 * Required on the catalog branch (`APP5-G01` §3) and permitted on the
 * customer-owned one, so the caller passes what its branch demands rather than
 * this module guessing from the shape of the data.
 */
export function breakdownReady(lines: readonly QuantityDraftLine[], required: boolean): boolean {
  const filled = lines.filter((line) => !isBlankLine(line));
  if (filled.length > QUANTITY_LINES_MAX) return false;
  if (filled.some((line) => quantityLineIssue(line) !== undefined)) return false;
  return required ? filled.length >= 1 : true;
}
