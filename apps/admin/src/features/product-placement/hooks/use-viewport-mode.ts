'use client';

/**
 * Whether the viewport is wide enough to author placement on.
 *
 * `APP3-A01` §11 requires the mobile notice to *replace* the editor, not to sit
 * beside a desktop layout that has been scrolled off-canvas. That is a
 * rendering decision, not a styling one, so it is made here rather than with
 * `display: none` — a hidden editor still holds focusable controls, still
 * announces itself to assistive technology, and still lets a stray tab reach a
 * numeric field the operator cannot see.
 *
 * Defaults to `desktop` whenever the answer is unknowable: during server
 * rendering, and in any environment without `matchMedia`. The notice is the
 * exceptional state, so an unknown viewport must not produce it — a false
 * mobile verdict would hide the entire screen from a desktop operator, which is
 * far worse than briefly rendering a desktop layout on a phone.
 */
import { useEffect, useState } from 'react';

/**
 * The approved Admin authoring floor.
 *
 * Below this the placement preview cannot hold a canvas and an inspector at
 * once. `DESIGN_SYSTEM_FOUNDATION.md` §10 sets desktop container 1440 and
 * content 1280; this is the tablet edge beneath which A01 stops being an
 * editor, matching `FIG-ADMIN-PLACEMENT-NARROW-1280` and the mobile notice.
 */
export const PLACEMENT_AUTHORING_MIN_WIDTH_PX = 1024;

const QUERY = `(min-width: ${String(PLACEMENT_AUTHORING_MIN_WIDTH_PX)}px)`;

export type ViewportMode = 'desktop' | 'mobile';

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>('desktop');

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const list = window.matchMedia(QUERY);
    const apply = (matches: boolean) => {
      setMode(matches ? 'desktop' : 'mobile');
    };
    apply(list.matches);

    const onChange = (event: MediaQueryListEvent) => {
      apply(event.matches);
    };
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, []);

  return mode;
}
