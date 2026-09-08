interface DetailChevronProps {
  readonly direction: 'previous' | 'next';
}

/**
 * The chevron drawn inside the lightbox's navigation buttons.
 *
 * Inline SVG rather than a glyph or an icon package. The shell draws its menu
 * with a literal `☰`, which is legible enough for one control but the wrong
 * tool here: a text glyph inherits font metrics, renders differently on every
 * platform and cannot be centred reliably inside a circle. A path scales with
 * the button, sits on the pixel it is told to, and needs no dependency — the
 * repository has no icon library and adding one to draw two arrows would be a
 * dependency bought for two arrows.
 *
 * `currentColor` and `stroke`, so the icon takes the button's own colour and its
 * disabled and focus states come for free rather than being restated.
 *
 * `aria-hidden`, always. These buttons are named by `aria-label` from the
 * Vietnamese message repository — *"Ảnh trước"* / *"Ảnh sau"* — and an icon that
 * announced itself as well would make a screen reader read the control twice.
 * The words did not disappear when the visible text did; they moved.
 */
export function DetailChevron({ direction }: DetailChevronProps) {
  return (
    <svg
      className="product-detail__chevron"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={direction === 'previous' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}
