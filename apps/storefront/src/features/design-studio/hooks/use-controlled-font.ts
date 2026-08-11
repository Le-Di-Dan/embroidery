'use client';

/**
 * Whether the controlled face a text element actually names is available in this
 * browser (`APP3-S05`, corrected by `APP3-S05-C1`).
 *
 * ## Why the question has to be asked at all
 *
 * A document stores a `fontId`, a `fontStyle` and a `fontWeight`; `APP3-P01`'s
 * registry turns the id into the family name; the stage paints the family. If
 * the matching `@font-face` has not loaded, the browser silently substitutes —
 * a different family, or, for a missing italic, a *synthesised* slant of the
 * upright one. A substituted or synthesised face has different outlines, so the
 * design is shown, and later stitched, at a shape the customer never approved
 * with nothing on screen saying so. The registry's locked policy is
 * `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`, and a renderer cannot reject a paint;
 * what it can do is tell the truth about it.
 *
 * ## Why the exact variant, and not the family
 *
 * `APP3-S05` probed the family, which reports ready as soon as *any* Inter face
 * loads. The correction asks `studio-font-variant` for the exact style and
 * weight instead, so a loaded upright never speaks for a missing italic. The
 * three states are per requested variant, and changing style or weight starts a
 * new request rather than reusing the previous answer.
 *
 * ## Races
 *
 * The requested variant is an effect dependency, so switching selection or
 * variant tears down the previous effect first. A late answer from a superseded
 * request finds `cancelled` set and writes nothing — which is what stops a slow
 * italic failure from marking a fast, successful upright as unavailable.
 *
 * The `@font-face` rules themselves are declared once in the feature stylesheet,
 * pointing at the repository-controlled binaries `APP3-F01` acquired. Nothing
 * here holds a URL, a path or font bytes, and nothing writes any of them into a
 * document.
 */
import { useEffect, useState } from 'react';

import {
  fontLoadingAvailable,
  loadControlledVariant,
  type ControlledFontVariant,
} from '../model/studio-font-variant';

/** The three states `APP3-S05` must show, and no fourth. */
export type ControlledFontState = 'loading' | 'ready' | 'unavailable';

/**
 * Readiness of the exact variant, or `unavailable` when there is none to ask
 * about.
 *
 * The three fields are the dependencies rather than the object holding them.
 * Every caller rebuilds that object each render — it comes from the selected
 * element — so depending on it would restart the request on every keystroke,
 * and the panel would flicker back to "loading" while the customer typed.
 */
export function useControlledFont(variant: ControlledFontVariant | null): ControlledFontState {
  const [state, setState] = useState<ControlledFontState>(
    variant === null ? 'unavailable' : 'loading',
  );
  const fontId = variant?.fontId ?? null;
  const fontStyle = variant?.fontStyle ?? null;
  const fontWeight = variant?.fontWeight ?? null;

  useEffect(() => {
    if (fontId === null || fontStyle === null || fontWeight === null) {
      setState('unavailable');
      return;
    }
    // Nobody to ask. Answered here rather than through the promise, because
    // there is no request in flight to be "loading" — and a state that arrives
    // asynchronously when nothing asynchronous happened is a lie about timing.
    // Saying "unavailable" over-warns; claiming "ready" would be the silent
    // substitution the policy exists to prevent.
    if (!fontLoadingAvailable()) {
      setState('unavailable');
      return;
    }

    let cancelled = false;
    setState('loading');
    void loadControlledVariant({ fontId, fontStyle, fontWeight }).then((available) => {
      if (!cancelled) setState(available ? 'ready' : 'unavailable');
    });

    return () => {
      cancelled = true;
    };
  }, [fontId, fontStyle, fontWeight]);

  return state;
}
