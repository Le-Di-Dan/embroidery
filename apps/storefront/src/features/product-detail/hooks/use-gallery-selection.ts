'use client';

import { useCallback, useState } from 'react';

/**
 * Which image is showing, and which images have failed to load.
 *
 * Selection is deliberately ephemeral: it is not written to the URL, to storage
 * or to a store. Reloading a Product shows its first image again, because the
 * selected index is a momentary act of looking rather than a fact about the
 * artwork — and `media[]` is replaced wholesale when the studio edits a Product
 * (`APP2-B02`), so a persisted index would point at a different image after an
 * edit.
 *
 * Failures are tracked per index rather than as one boolean, so a broken third
 * image never makes the first look broken when the visitor navigates back to it.
 */
export interface GallerySelection {
  readonly selectedIndex: number;
  readonly select: (index: number) => void;
  readonly selectPrevious: () => void;
  readonly selectNext: () => void;
  readonly hasFailed: (index: number) => boolean;
  readonly markFailed: (index: number) => void;
}

export function useGallerySelection(total: number): GallerySelection {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setSelectedIndex(index);
    },
    [total],
  );

  // Previous/next stop at the ends rather than wrapping. A gallery that silently
  // loops makes "am I at the last image?" unanswerable without counting.
  const selectPrevious = useCallback(() => {
    setSelectedIndex((current) => (current > 0 ? current - 1 : current));
  }, []);

  const selectNext = useCallback(() => {
    setSelectedIndex((current) => (current < total - 1 ? current + 1 : current));
  }, [total]);

  const markFailed = useCallback((index: number) => {
    setFailed((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }, []);

  const hasFailed = useCallback((index: number) => failed.has(index), [failed]);

  return { selectedIndex, select, selectPrevious, selectNext, hasFailed, markFailed };
}
