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
 * Trap keyboard focus within a container while active. On activation focus moves
 * to the first focusable element; Tab and Shift+Tab cycle within the container
 * (fully managed, so focus can never reach the shell behind); on deactivation
 * focus returns to the element that was focused before.
 *
 * `Escape` is routed to `onEscape` when provided (the drawer closes) or swallowed
 * when omitted (a required dialog such as session-expired cannot be dismissed
 * into a stale shell). Feature-local — the repository has no shared dialog
 * utility yet — and side-effect-clean: the single document listener is removed on
 * cleanup.
 */
export function useFocusTrap(
  active: boolean,
  onEscape?: () => void,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initial = focusableElements(container);
    (initial[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || container === null) {
        return;
      }
      const items = focusableElements(container);
      event.preventDefault();
      if (items.length === 0) {
        return;
      }
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}
