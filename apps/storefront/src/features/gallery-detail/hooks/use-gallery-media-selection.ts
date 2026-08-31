'use client';

import { useCallback, useState } from 'react';

/**
 * Which entry image is showing, and which images have failed to load.
 *
 * Selection is deliberately ephemeral: it is not written to the URL, to
 * storage or to a store. Reloading an entry shows its first image again,
 * because the selected index is a momentary act of looking rather than a fact
 * about the entry — and the deliverable image list is recomputed on every read
 * (`APP11-B03` filters out whatever is no longer servable), so a persisted
 * index would point at a different image the moment one was withdrawn.
 *
 * The initial selection is index 0, which is the first image the API returned
 * and therefore the cover the curator put first. Nothing here re-derives that
 * choice.
 *
 * Failures are tracked per index rather than as one boolean, so a broken third
 * image never makes the first look broken when the visitor navigates back to
 * it.
 *
 * Feature-local rather than imported from `product-detail`. The two behave
 * identically on purpose, but reaching into another feature's `hooks/` to save
 * forty lines is the boundary violation CLAUDE.md §5 forbids, and
 * `product-detail` does not publish this on its index.
 */
export interface GalleryMediaSelection {
  readonly selectedIndex: number;
  readonly select: (index: number) => void;
  readonly selectPrevious: () => void;
  readonly selectNext: () => void;
  readonly hasFailed: (index: number) => boolean;
  readonly markFailed: (index: number) => void;
}

export function useGalleryMediaSelection(total: number): GalleryMediaSelection {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setSelectedIndex(index);
    },
    [total],
  );

  // Previous/next stop at the ends rather than wrapping. A gallery that
  // silently loops makes "am I at the last image?" unanswerable without
  // counting, and the position text would keep changing while the visitor sat
  // on what they thought was the end.
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
