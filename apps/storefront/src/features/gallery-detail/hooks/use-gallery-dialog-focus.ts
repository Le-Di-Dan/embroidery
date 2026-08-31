'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Modal focus containment and page-scroll lock for the gallery lightbox.
 *
 * Feature-local for the reason `product-detail`'s equivalent is: the shell has
 * one for its mobile drawer and Product Detail has one for its lightbox, and
 * neither is on its feature's public surface. Reaching across a feature
 * boundary to reuse an internal hook is what CLAUDE.md §5 forbids; the
 * behaviour is deliberately identical so the three dialogs feel the same.
 *
 * On open, focus moves into the dialog and Tab cycles within it — fully
 * managed, so focus can never land on the page behind. On close, focus returns
 * to the **exact** element that opened it, which is what makes the lightbox
 * usable without a mouse: you come back to the image you were on, not to the
 * top of the page.
 *
 * The scroll lock restores the body's previous `overflow` rather than clearing
 * it, so a page that had its own value keeps it.
 */
export function useGalleryDialogFocus(
  active: boolean,
  onEscape: () => void,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a new closure on every render does not tear down and
  // re-arm the listener — which would move focus back to the first control
  // each time the visitor arrowed to another image.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (container === null) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initial = focusableElements(container);
    (initial[0] ?? container).focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab' || container === null) return;
      const items = focusableElements(container);
      event.preventDefault();
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}
