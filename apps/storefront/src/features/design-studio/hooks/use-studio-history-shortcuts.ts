'use client';

/**
 * The keyboard path to undo and redo (`APP3-S08`).
 *
 * Exactly the two combinations the approved frame's hints name, and no third
 * one. `Ctrl+Y` is deliberately not bound: nothing in the accepted authority
 * and nothing in this application's existing conventions establishes it, and a
 * shortcut that is not drawn is a capability nobody approved.
 *
 * ## The editable-field boundary
 *
 * A `<textarea>` and an `<input>` come with the platform's own undo, and it is
 * the right one while the caret is in them: `Ctrl+Z` there should take back the
 * last characters typed, not the last thing that happened to the design. So this
 * listener stands down entirely for an editable target and lets the browser
 * handle it — the alternative is one keystroke doing two different undos at
 * once, and the customer being unable to predict which.
 *
 * ## Why `keydown`, and why `defaultPrevented`
 *
 * `keydown` is the event a browser's own shortcut handling reads, so acting on
 * `keyup` would fire after the platform had already done something. An event
 * another handler has already answered is left alone, because two answers to one
 * keystroke is the same defect in a different place.
 *
 * The listener is removed on unmount. A Studio that has gone away must not still
 * be reachable by a key press.
 */
import { useEffect, useRef } from 'react';

export interface StudioHistoryShortcuts {
  readonly undo: () => void;
  readonly redo: () => void;
}

export function useStudioHistoryShortcuts({ undo, redo }: StudioHistoryShortcuts): void {
  // The handlers, kept current without rebinding the listener on every render —
  // a rebind per render would add and remove a window listener sixty times a
  // second during a gesture.
  const latest = useRef({ undo, redo });
  latest.current = { undo, redo };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== 'z') return;
      if (isEditable(event.target)) return;

      event.preventDefault();
      if (event.shiftKey) latest.current.redo();
      else latest.current.undo();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

/**
 * Whether the keystroke belongs to a text field rather than to the design.
 *
 * `isContentEditable` covers the case a tag name cannot: an element made
 * editable by an attribute is a text field however it is named.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}
