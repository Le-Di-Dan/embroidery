'use client';

/**
 * How far the on-screen keyboard has covered the window (`APP3-S11`, `610:409`).
 *
 * `610:409` makes a promise in words — *"Bàn phím hệ thống đẩy sheet lên; khung
 * thiết kế thu nhỏ chứ không bị che"* — and a note is only true if the build
 * makes it true. On a phone the keyboard does not resize the layout viewport, so
 * a bottom-anchored sheet stays exactly where it was and the field the customer
 * is typing into ends up underneath the keys.
 *
 * `VisualViewport` is the one API that reports this honestly. The inset is
 * **measured**, never a constant: keyboard heights differ by device, by language,
 * by whether a suggestion strip or a floating keyboard is shown, and any number
 * hard-coded here would be wrong on most phones and wrong on all of them the day
 * a customer switches keyboards.
 *
 * A browser without `VisualViewport` reports `0` and the sheet behaves exactly as
 * it did before this hook existed. That is the correct degradation: no layout is
 * moved on a guess.
 */
import { useEffect, useState } from 'react';

/** Smaller than this is a browser toolbar collapsing, not a keyboard. */
const KEYBOARD_MIN_PX = 80;

export function useKeyboardInset(active: boolean): number {
  const [insetPx, setInsetPx] = useState(0);

  useEffect(() => {
    if (!active) {
      setInsetPx(0);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      // What the visible viewport has lost at the bottom: the window's height
      // minus where the visual viewport now ends. Positive only when something
      // is covering the page from below.
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
      setInsetPx(covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0);
    };

    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, [active]);

  return insetPx;
}
