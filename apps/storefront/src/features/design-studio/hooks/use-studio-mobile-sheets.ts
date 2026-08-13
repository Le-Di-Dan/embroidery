'use client';

/**
 * Which mobile sheet is open (`APP3-S11`).
 *
 * At most one, ever. Two sheets stacked over a 390 stage would leave the lower
 * one focus-trapped behind the upper one, and the customer holding a `Escape`
 * that closes something they cannot see.
 *
 * Runtime interaction state, deliberately local to the mobile composition rather
 * than in a store: nothing outside this subtree may read it, it is meaningless on
 * any other tier, and it must not survive a Session change or an unmount.
 */
import { useCallback, useState } from 'react';

/** The five approved sheets, named for the frame each one is. */
export type StudioSheetName = 'transform' | 'layers' | 'text' | 'image';

export interface UseStudioMobileSheetsResult {
  readonly open: StudioSheetName | null;
  readonly show: (sheet: StudioSheetName) => void;
  readonly close: () => void;
  /** Toggles: pressing the tool that is already open closes it. */
  readonly toggle: (sheet: StudioSheetName) => void;
}

export function useStudioMobileSheets(): UseStudioMobileSheetsResult {
  const [open, setOpen] = useState<StudioSheetName | null>(null);

  const close = useCallback(() => {
    setOpen(null);
  }, []);

  const show = useCallback((sheet: StudioSheetName) => {
    setOpen(sheet);
  }, []);

  const toggle = useCallback((sheet: StudioSheetName) => {
    setOpen((current) => (current === sheet ? null : sheet));
  }, []);

  return { open, show, close, toggle };
}
