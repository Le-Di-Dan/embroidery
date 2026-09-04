import {
  BRAND_GESTURE_STROKE_WIDTH,
  BRAND_SEAL_RING,
  BRAND_SIGNATURE_GESTURE_PATH,
  BRAND_SYMBOL_TONE_COLOR,
  BRAND_SYMBOL_VIEWBOX,
  type BrandSymbolTone,
  type BrandSymbolVariant,
} from './brand-symbol-geometry';

/**
 * The Nét Thêu brand symbol, drawn from the one canonical geometry source.
 *
 * ## Why inline SVG rather than an asset
 *
 * An `<img>` would need a file per variant per tone — six requests, six things
 * to keep in sync with the design, and a flash of nothing while each loads in a
 * header. Inline SVG is ~300 bytes, inherits nothing it should not, and lets one
 * `d` string serve every surface, which is the property that makes the
 * single-source requirement structural.
 *
 * ## The two variants are one drawing
 *
 * `production` renders the seal ring and a thinner gesture; `micro` drops the
 * ring and thickens the gesture. Both read the same path constant, so they
 * cannot drift apart, and neither may be used outside its proven size range —
 * see `BRAND_SYMBOL_MIN_PX`.
 *
 * ## Accessibility
 *
 * Decorative by default (`aria-hidden`), because the overwhelmingly common case
 * is the symbol sitting beside the visible words "Nét Thêu": announcing it would
 * make a screen reader say the brand twice. A caller that renders the symbol
 * *alone* as the brand — a compact slot with no room for the wordmark — passes a
 * `label`, which turns it into an `img` role with an accessible name.
 */
export interface BrandSymbolProps {
  readonly variant: BrandSymbolVariant;
  /** Rendered edge length in CSS pixels. The mark is square. */
  readonly size: number;
  /** Defaults to `ink`, the only correct choice on a light ground. */
  readonly tone?: BrandSymbolTone;
  /**
   * Accessible name. Provide it **only** when the symbol is the sole carrier of
   * the brand; omit it whenever visible brand text sits beside it.
   */
  readonly label?: string;
  readonly className?: string;
}

export function BrandSymbol({ variant, size, tone = 'ink', label, className }: BrandSymbolProps) {
  // The accent tone colours the signature gesture only. The seal ring takes ink
  // whatever the tone asks for, because `BRD0-F02` forbids Brand/Primary on the
  // ring and on the wordmark — a rule enforced here by the ring never reading
  // the caller's value rather than by a comment asking someone to remember it.
  const gestureColor = BRAND_SYMBOL_TONE_COLOR[tone];
  const ringColor = tone === 'accent' ? BRAND_SYMBOL_TONE_COLOR.ink : BRAND_SYMBOL_TONE_COLOR[tone];

  const decorative = label === undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BRAND_SYMBOL_VIEWBOX}
      width={size}
      height={size}
      fill="none"
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      {...(className === undefined ? {} : { className })}
    >
      {decorative ? null : <title>{label}</title>}
      {variant === 'production' ? (
        <circle
          cx={BRAND_SEAL_RING.cx}
          cy={BRAND_SEAL_RING.cy}
          r={BRAND_SEAL_RING.r}
          stroke={ringColor}
          strokeWidth={BRAND_SEAL_RING.strokeWidth}
        />
      ) : null}
      <path
        d={BRAND_SIGNATURE_GESTURE_PATH}
        stroke={gestureColor}
        strokeWidth={BRAND_GESTURE_STROKE_WIDTH[variant]}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
