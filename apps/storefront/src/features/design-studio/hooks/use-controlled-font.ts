'use client';

/**
 * Whether the controlled face a text element names is actually available in this
 * browser (`APP3-S05`).
 *
 * ## Why the question has to be asked at all
 *
 * A document stores a `fontId`; `APP3-P01`'s registry turns that into the family
 * name `Inter`; the stage paints `font-family="Inter"`. If the `@font-face` has
 * not loaded, the browser silently substitutes something else — and a substituted
 * face has different metrics, so the design is shown, and later stitched, at a
 * shape the customer never approved with nothing on screen saying so. The
 * registry's own locked policy is `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`, and a
 * renderer cannot reject a paint; what it can do is tell the truth about it.
 *
 * ## Why the CSS Font Loading API
 *
 * It is the browser's own answer to this exact question, it is already present
 * everywhere the Studio runs, and it needs no dependency. `document.fonts.load`
 * returns the faces that matched, so "no face matched" and "the fetch failed"
 * are both observable — which is what makes the third state honest rather than a
 * timeout dressed up as a fact.
 *
 * The `@font-face` itself is declared once in the feature stylesheet, pointing at
 * the repository-controlled binary `APP3-F01` acquired. Nothing here holds a URL,
 * a path or font bytes, and nothing writes any of them into a document.
 */
import { useEffect, useState } from 'react';

import { findControlledFont } from '@embroidery/design-document';

/** The three states `APP3-S05` must show, and no fourth. */
export type ControlledFontState = 'loading' | 'ready' | 'unavailable';

/**
 * The probe the browser is asked to resolve.
 *
 * A `document.fonts.load` shorthand needs a size, and the size is irrelevant to
 * whether a face exists — a variable font covers the whole weight range in one
 * file, so any legal weight resolves the same face.
 */
const PROBE = Object.freeze({ weight: 400, sizePx: 16 });

export function useControlledFont(fontId: string | null): ControlledFontState {
  // `findControlledFont` returns the frozen registry entry, so this identity is
  // stable across renders and is a sound effect dependency.
  const font = fontId === null ? undefined : findControlledFont(fontId);
  const [state, setState] = useState<ControlledFontState>(
    font === undefined ? 'unavailable' : 'loading',
  );

  useEffect(() => {
    if (font === undefined) {
      setState('unavailable');
      return;
    }
    const faces = typeof document === 'undefined' ? undefined : document.fonts;
    if (faces === undefined) {
      // No font-loading API: the page may still render the face, but this hook
      // cannot claim it did. Saying "unavailable" over-warns; claiming "ready"
      // would be the silent substitution the policy exists to prevent.
      setState('unavailable');
      return;
    }

    let cancelled = false;
    setState('loading');
    faces
      .load(`${String(PROBE.weight)} ${String(PROBE.sizePx)}px "${font.family}"`)
      .then((matched) => {
        if (!cancelled) setState(matched.length > 0 ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [font]);

  return state;
}
