'use client';

/**
 * The mobile layer sheet (`APP3-S11`, `610:353`).
 *
 * A second **presentation** of `APP3-S04`'s one controller, not a second layer
 * model: the rows, the order, the labels, the selection and every reorder are
 * the hook's, and this file adds a touch path to the same `startDrag` /
 * `dragOver` / `drop` it already publishes. One drop is still one
 * `withElementMovedTo`, one announcement and one history entry.
 *
 * ## Why touch needs its own path at all
 *
 * The desktop list reorders with native HTML drag and drop, and native drag
 * events **do not fire for touch** — a customer holding a row on a phone would
 * get a text selection and a scroll, never a `dragstart`. So the sheet drives the
 * same three calls from pointer events instead.
 *
 * ## The handle is the gesture, and the buttons are the guarantee
 *
 * `610:353` draws an explicit `⋮⋮` handle and says what it is for: *"Giữ và kéo
 * tay cầm ⋮⋮ để đổi thứ tự."* Only the handle starts a reorder, so a customer
 * scrolling a long list by dragging anywhere on a row cannot restack their design
 * by accident.
 *
 * The two step buttons stay beside it, exactly as `APP3-S04` §9 requires: a drag
 * is unavailable to a keyboard, a switch and a screen reader alike, so drag may
 * never be the only way. `⋮⋮` is the pointer shortcut for what the buttons do.
 *
 * ## What is not here
 *
 * No group or ungroup: `FU-APP3-S04-GROUP-AUTHORITY-01` is open and `IMP-D045`
 * PO-07 defers the frame that would authorize it. No delete, no duplicate, and no
 * mobile-only lock or hide control that the approved sheet does not draw.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { STUDIO_LAYER_COPY } from '../model/studio-layer-copy';
import { STUDIO_MOBILE_COPY } from '../model/studio-mobile-copy';
import { moveUnavailableReason, type StudioLayerRow } from '../model/studio-layers';
import type { UseStudioLayersResult } from '../hooks/use-studio-layers';

export interface StudioLayersSheetProps {
  readonly layers: UseStudioLayersResult;
}

export function StudioLayersSheet({ layers }: StudioLayersSheetProps) {
  const dragging = useRef(false);

  /*
   * Which row the finger is currently over.
   *
   * A touch drag has no `dragover`, so the row under the pointer is resolved from
   * its coordinates. `elementFromPoint` is the browser's own hit test — the same
   * answer the pointer would have produced — so this is not a second hit-testing
   * scheme, only the one the platform already owns, asked directly.
   */
  const rowAt = useCallback((clientX: number, clientY: number): string | null => {
    const node = document.elementFromPoint(clientX, clientY);
    const row = node?.closest<HTMLElement>('[data-layer-id]');
    return row?.dataset.layerId ?? null;
  }, []);

  const onPointerDown = useCallback(
    (elementId: string, event: ReactPointerEvent<HTMLElement>) => {
      dragging.current = true;
      layers.startDrag(elementId);
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [layers],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      const over = rowAt(event.clientX, event.clientY);
      if (over !== null) layers.dragOver(over);
    },
    [layers, rowAt],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      const over = rowAt(event.clientX, event.clientY);
      // A lift outside every row is an abandoned drag: the design is left exactly
      // as it was, and no entry is appended for a reorder that never landed.
      if (over === null) layers.endDrag();
      else layers.drop(over);
    },
    [layers, rowAt],
  );

  const onPointerCancel = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    layers.endDrag();
  }, [layers]);

  if (layers.rows.length === 0) {
    return (
      <p className="studio-layers__empty" data-testid="studio-mobile-layers-empty" role="status">
        {STUDIO_LAYER_COPY.empty}
      </p>
    );
  }

  return (
    <div className="studio-layers-sheet">
      <ul className="studio-layers-sheet__list">
        {layers.rows.map((row) => (
          <SheetRow
            key={row.id}
            layers={layers}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            row={row}
            // The list is top-first (`APP3-S04`), so the front of the design is
            // the first row. Read from the order rather than stored on the row:
            // one fact, in one place, and it cannot go stale after a restack.
            topmost={layers.rows[0]?.id === row.id}
          />
        ))}
      </ul>

      <p className="studio-layers-sheet__hint">{STUDIO_MOBILE_COPY.layers.handleHint}</p>
      {/* The same polite region the desktop list has: a restack is invisible to
          anyone who cannot see the stage. */}
      <p className="studio-layers__status" data-testid="studio-mobile-layers-status" role="status">
        {layers.announcement}
      </p>
    </div>
  );
}

interface SheetRowProps {
  readonly layers: UseStudioLayersResult;
  readonly row: StudioLayerRow;
  readonly topmost: boolean;
  readonly onPointerDown: (elementId: string, event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
}

function SheetRow({
  layers,
  row,
  topmost,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: SheetRowProps) {
  const upReason = moveUnavailableReason(row, 'up');
  const downReason = moveUnavailableReason(row, 'down');

  return (
    <li
      className="studio-layers-sheet__item"
      data-drop={layers.dropTargetId === row.id}
      data-dragging={layers.draggingId === row.id}
      data-layer-id={row.id}
      data-selected={row.selected}
      data-testid={`studio-mobile-layer-${row.id}`}
    >
      <button
        aria-label={STUDIO_LAYER_COPY.select(row.label)}
        aria-pressed={row.selected}
        className="studio-layers-sheet__select"
        data-testid={`studio-mobile-layer-select-${row.id}`}
        onClick={() => {
          layers.select(row.id);
        }}
        type="button"
      >
        <span className="studio-layers-sheet__name">{row.label}</span>
        {/* `610:353` marks the top row in words rather than by position alone. */}
        {topmost ? (
          <span className="studio-layers-sheet__badge">{STUDIO_LAYER_COPY.topmostBadge}</span>
        ) : null}
      </button>

      <div className="studio-layers-sheet__controls">
        <StepButton
          disabled={upReason !== null}
          label={STUDIO_LAYER_COPY.moveUpFor(row.label)}
          onClick={() => {
            layers.step(row.id, 'up');
          }}
          testId={`studio-mobile-layer-up-${row.id}`}
        >
          ↑
        </StepButton>
        <StepButton
          disabled={downReason !== null}
          label={STUDIO_LAYER_COPY.moveDownFor(row.label)}
          onClick={() => {
            layers.step(row.id, 'down');
          }}
          testId={`studio-mobile-layer-down-${row.id}`}
        >
          ↓
        </StepButton>
        {/*
          The drag handle. A nested row's position is not a top-level stacking
          decision, so it gets no handle at all rather than one that would have to
          refuse — the same rule the desktop list applies to `draggable`.
        */}
        {row.nested ? null : (
          <button
            aria-label={STUDIO_MOBILE_COPY.layers.handleHint}
            className="studio-layers-sheet__handle"
            data-testid={`studio-mobile-layer-handle-${row.id}`}
            onPointerCancel={onPointerCancel}
            onPointerDown={(event) => {
              onPointerDown(row.id, event);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            type="button"
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
        )}
      </div>
    </li>
  );
}

interface StepButtonProps {
  readonly children: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}

function StepButton({ children, disabled, label, onClick, testId }: StepButtonProps) {
  return (
    <button
      aria-label={label}
      className="studio-layers-sheet__step"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
