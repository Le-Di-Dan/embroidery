'use client';

/**
 * Whether the viewport is wide enough to author a Design Document on.
 *
 * `APP3-A03` §31 requires the mobile notice to *replace* the editor, not to sit
 * beside a desktop layout scrolled off-canvas. That is a rendering decision, not
 * a styling one, so it is made here rather than with `display: none` — a hidden
 * editor still holds focusable controls, still announces itself to assistive
 * technology, and would still issue the Side-background request that §31 says
 * must not happen at 390.
 *
 * Defaults to `desktop` whenever the answer is unknowable: during server
 * rendering, and in any environment without `matchMedia`. The notice is the
 * exceptional state, so an unknown viewport must not produce it — a false mobile
 * verdict would hide the whole editor from a desktop operator.
 *
 * This is `APP3-A01`'s hook restated rather than imported, and the duplication
 * is deliberate on both counts. Importing across features would couple placement
 * authoring to Template editing; *moving* it to Admin shared scope would edit an
 * accepted checkpoint's files and break a gate anchored on them, for a saving of
 * thirty lines. Unifying the two belongs to a shell-level responsive owner —
 * `FU-ADMIN-SHELL-NARROW-DESKTOP-01` is where that already lives.
 */
import { useEffect, useState } from 'react';

/**
 * The approved Admin authoring floor.
 *
 * `DESIGN_SYSTEM_FOUNDATION.md` §10 sets desktop container 1440 / content 1280,
 * and `FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280` is the narrowest drawn editor. Below
 * the tablet edge the layers panel (240px minimum), the inspector (260px
 * minimum) and an elastic stage cannot all be present, which is the condition
 * the approved layout depends on.
 */
export const TEMPLATE_EDITOR_MIN_WIDTH_PX = 1024;

const QUERY = `(min-width: ${String(TEMPLATE_EDITOR_MIN_WIDTH_PX)}px)`;

export type EditorViewportMode = 'desktop' | 'mobile';

export function useEditorViewport(): EditorViewportMode {
  const [mode, setMode] = useState<EditorViewportMode>('desktop');

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
