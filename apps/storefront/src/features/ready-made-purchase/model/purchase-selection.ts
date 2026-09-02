import type { PublicProductSkuResponse } from '@embroidery/api-client';

import type { PurchaseVariant, ReadyMadePurchaseView } from './purchase-projection';

/**
 * Turning a customer's two clicks into one buyable SKU (`APP12-S01` §8–§16).
 *
 * A pure function over the server projection and the current selection. It holds
 * no state, performs no arithmetic on money, and never selects on the customer's
 * behalf: it reports what is selectable, what the selection resolves to, and
 * which fieldset is still open.
 *
 * **The buyable subject is the SKU, never the variant.** The two axes exist only
 * to name one variant, and a variant is purchasable only when it resolves to
 * exactly one order-eligible SKU with stock — see `resolveVariantSubject`.
 */

/** `APP12-D01` places a stepper that starts at 1 (`904:72`). */
export const MIN_QUANTITY = 1;

export type PurchaseAxis = 'color' | 'size';

/** One rendered option in a fieldset (`904:47` default / `904:62` disabled). */
export interface PurchaseOption {
  readonly value: string;
  /** False renders the disabled option; only a selectable option may be chosen. */
  readonly selectable: boolean;
  /**
   * True only when the refusal really is inventory: every variant behind this
   * option resolves to one eligible SKU published with zero availability. It is
   * what earns the `· hết` caption (`904:64`), and an option refused for any
   * other reason deliberately does not carry it.
   */
  readonly soldOut: boolean;
}

export interface PurchaseSelection {
  readonly color?: string;
  readonly size?: string;
}

/**
 * Which approved panel frame is being rendered.
 *
 * `OUT_OF_STOCK` is `906:140` — the frame's own title is *"Hết hàng — không còn
 * SKU nào mua được"*, so it covers a Product whose SKUs are all at zero **and**
 * a Product that has no purchasable SKU at all (`APP12-S01` §23). `INCOMPLETE`
 * is `906:186`: purchase is possible here, but no SKU is determined yet.
 */
export type PurchasePanelState = 'RESOLVED' | 'OUT_OF_STOCK' | 'INCOMPLETE';

export interface PurchaseResolution {
  readonly state: PurchasePanelState;
  /**
   * The selection after reconciliation. A value whose option is no longer
   * selectable is **dropped** rather than carried (`APP12-S01` §16): a refetch
   * that withdraws a SKU must not leave a stale id behind, and nothing here
   * substitutes a different one.
   */
  readonly selection: PurchaseSelection;
  readonly colorOptions: readonly PurchaseOption[];
  readonly sizeOptions: readonly PurchaseOption[];
  /** Present only in `RESOLVED`. The subject a later order line is created against. */
  readonly sku?: PublicProductSkuResponse;
  /** The fieldset whose approved error is shown (`906:229`). */
  readonly missingAxis?: PurchaseAxis;
}

function matchesColor(variant: PurchaseVariant, color: string | undefined): boolean {
  return color === undefined || variant.colorName === color;
}

function matchesSize(variant: PurchaseVariant, size: string | undefined): boolean {
  return size === undefined || variant.sizeLabel === size;
}

function toOption(value: string, matching: readonly PurchaseVariant[]): PurchaseOption {
  const selectable = matching.some((variant) => variant.subject.kind === 'buyable');
  return {
    value,
    selectable,
    soldOut: !selectable && matching.some((variant) => variant.subject.kind === 'sold-out'),
  };
}

function isSelectable(options: readonly PurchaseOption[], value: string | undefined): boolean {
  if (value === undefined) return false;
  return options.some((option) => option.value === value && option.selectable);
}

/**
 * Resolve the panel for one projection and one selection.
 *
 * The axes are asymmetric on purpose, and that is `APP12-D01`'s reading rather
 * than an optimisation: `Phân loại` is offered across the whole product, and
 * `Kích thước` is the fieldset that *resolves the SKU* — so size availability is
 * computed against the colour already chosen. Deciding each axis against the
 * other would be circular, and resolving that circle is exactly where a hidden
 * "helpfully switch them to something that works" rule gets introduced.
 */
export function resolvePurchase(
  view: ReadyMadePurchaseView,
  selection: PurchaseSelection,
): PurchaseResolution {
  const colorOptions = view.colorValues.map((value) =>
    toOption(
      value,
      view.variants.filter((variant) => variant.colorName === value),
    ),
  );
  const color = isSelectable(colorOptions, selection.color) ? selection.color : undefined;

  const sizeOptions = view.sizeValues.map((value) =>
    toOption(
      value,
      view.variants.filter(
        (variant) => variant.sizeLabel === value && matchesColor(variant, color),
      ),
    ),
  );
  const size = isSelectable(sizeOptions, selection.size) ? selection.size : undefined;

  const reconciled: PurchaseSelection = {
    ...(color === undefined ? {} : { color }),
    ...(size === undefined ? {} : { size }),
  };
  const base = { selection: reconciled, colorOptions, sizeOptions } as const;

  // Nothing on this Product can be bought right now — the `906:140` panel. Taken
  // before the selection is consulted, because no sequence of clicks could reach
  // a SKU and offering the fieldsets as live controls would imply otherwise.
  if (!view.variants.some((variant) => variant.subject.kind === 'buyable')) {
    return { ...base, state: 'OUT_OF_STOCK' };
  }

  // An axis the server published no value for imposes no requirement: a Product
  // whose variants carry only a size has no `Phân loại` fieldset to complete.
  if (view.colorValues.length > 0 && color === undefined) {
    return { ...base, state: 'INCOMPLETE', missingAxis: 'color' };
  }
  if (view.sizeValues.length > 0 && size === undefined) {
    return { ...base, state: 'INCOMPLETE', missingAxis: 'size' };
  }

  const matched = view.variants.filter(
    (variant) => matchesColor(variant, color) && matchesSize(variant, size),
  );
  // Exactly one, or nothing. Two variants that the published labels cannot tell
  // apart are not a tie to be broken — the panel simply cannot name one, and
  // says so by staying unresolved.
  const only = matched.length === 1 ? matched[0] : undefined;
  if (only === undefined || only.subject.kind !== 'buyable') {
    return { ...base, state: 'INCOMPLETE' };
  }
  return { ...base, state: 'RESOLVED', sku: only.subject.sku };
}

/**
 * The effective quantity for a raw control value (`APP12-S01` §14).
 *
 * Integer, at least one, never above the availability the server published for
 * the selected SKU. A blank, a fraction, a sign, a NaN or a value past the
 * ceiling all collapse to something buyable rather than being carried into the
 * continue URL — and the ceiling is read from the SKU on every call, so a SKU
 * change cannot leave a quantity the new SKU could not satisfy.
 */
export function clampQuantity(raw: string, availableQuantity: number): number {
  const ceiling = Math.max(MIN_QUANTITY, Math.trunc(availableQuantity));
  if (!/^\d+$/.test(raw.trim())) return MIN_QUANTITY;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_QUANTITY) return MIN_QUANTITY;
  return parsed > ceiling ? ceiling : parsed;
}
