import type { ReactNode } from 'react';

import { BrandSymbol } from './brand-symbol';
import { BRAND_NAME, type BrandSymbolTone, type BrandSymbolVariant } from './brand-symbol-geometry';

/**
 * The symbol beside the brand name, as one horizontal lockup.
 *
 * ## The wordmark is live text, never exported artwork
 *
 * `FIG-BRD0-C3-PRODUCTIONIZATION` carries a drawn wordmark, and this component
 * deliberately does not use it. Every wordmark on that page is set in **Inter**
 * because the approved primary face `General Sans` is not installed in the Figma
 * file, and the registry requires it be rebuilt and re-judged before any
 * wordmark asset is exported. Exporting the Inter specimen would freeze a
 * disclosed fallback into the product.
 *
 * So the symbol is exact vector and the name is live text in the consuming
 * application's own approved typography. That also keeps the brand selectable,
 * translatable and legible at any zoom, which an SVG wordmark is not.
 *
 * ## Layout belongs to the caller
 *
 * This renders a symbol and a text node and nothing else — no padding, no gap,
 * no font, no colour on the text. Each shell already owns its own brand slot
 * styling, and a lockup that shipped its own spacing would fight three
 * stylesheets. The `gap` is the one exception: it is the relationship *between*
 * the two halves, which is the lockup's own business.
 */
export interface BrandLockupProps {
  readonly variant: BrandSymbolVariant;
  readonly size: number;
  readonly tone?: BrandSymbolTone;
  /** Space between symbol and wordmark, in CSS pixels. */
  readonly gap?: number;
  /**
   * Class for the wordmark text node, so each shell keeps its own typography.
   * The lockup sets no font, weight or colour of its own.
   */
  readonly wordmarkClassName?: string;
  readonly className?: string;
  /**
   * Rendered after the wordmark — a descriptor or eyebrow the surface already
   * shows. Absent by default: the lockup invents no supporting copy.
   */
  readonly children?: ReactNode;
}

export function BrandLockup({
  variant,
  size,
  tone = 'ink',
  gap = 10,
  wordmarkClassName,
  className,
  children,
}: BrandLockupProps) {
  return (
    <span
      // `inline-flex` so the lockup sits on the text baseline of whatever
      // contains it, which is how every one of the three shells uses it.
      style={{ display: 'inline-flex', alignItems: 'center', gap: `${String(gap)}px` }}
      {...(className === undefined ? {} : { className })}
    >
      {/*
        No `label`: the brand name is right there as visible text, and naming the
        symbol too would make a screen reader announce "Nét Thêu Nét Thêu".
      */}
      <BrandSymbol variant={variant} size={size} tone={tone} />
      <span {...(wordmarkClassName === undefined ? {} : { className: wordmarkClassName })}>
        {BRAND_NAME}
      </span>
      {children}
    </span>
  );
}
