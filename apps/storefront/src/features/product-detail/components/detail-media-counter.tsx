import { positionLabel } from '../model/product-detail-copy';

interface DetailMediaCounterProps {
  readonly index: number;
  readonly total: number;
}

/**
 * "3 / 20" — where the visitor is in the gallery (`942:237`, `APP12-M01.D1` §M).
 *
 * Two facts about it are deliberate.
 *
 * **It carries no new copy.** The numerals are numerals; the sentence a screen
 * reader hears is `positionLabel` — *"Ảnh 3 trên 20"* — the string the lightbox
 * has always used for exactly this. D1 §M chose reuse over a second key so the
 * in-page counter and the large view state the same position in the same words;
 * a separate key could drift and nobody would notice, because only one of the
 * two surfaces is visible at a time.
 *
 * **It is not a live region.** Selection already announces itself twice over —
 * the stage image's `alt` is rebuilt with the new position and `aria-current`
 * moves to the pressed thumbnail — so an `aria-live` here would make every
 * arrow-key press interrupt the visitor with a third copy of a fact they just
 * caused (`APP12-M01.S1` §10). The hidden sentence is a label, read on demand.
 *
 * It carries no `'use client'` directive and does not need one: it holds no
 * state, no effect and no handler, and its only consumer is the gallery island,
 * which is already a client component. Adding the directive would widen the
 * declared client boundary without moving any behaviour across it.
 *
 * The numerals are hidden from assistive technology rather than left readable:
 * "3 / 20" out loud is "three slash twenty", which is worse than the sentence
 * beside it and would be heard immediately after it.
 */
export function DetailMediaCounter({ index, total }: DetailMediaCounterProps) {
  return (
    <p className="product-detail__counter">
      <span aria-hidden="true">
        {/* Numerals and a separator, which the static-text gate correctly does
            not treat as copy: the words live in `positionLabel` below. No
            `i18n-exempt` marker, because nothing here is exempt from anything
            — there is no sentence to translate. */}
        {`${index + 1} / ${total}`}
      </span>
      <span className="product-detail__counter-label">{positionLabel(index, total)}</span>
    </p>
  );
}
