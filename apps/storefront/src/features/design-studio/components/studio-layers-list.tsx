'use client';

/**
 * The layer panel (`608:3` list & selection, `608:68` reordering, `608:136`
 * empty).
 *
 * ## Every row is a real button
 *
 * Selecting, restacking, hiding and locking are all `<button>`s, so the whole
 * panel is reachable and operable from the keyboard. That is not an extra: the
 * approved design shows drag-reorder, and a drag is unavailable to a keyboard, a
 * switch and a screen reader alike — so the two step controls are the reorder
 * path, and the drag is the pointer shortcut for it. `APP3-S04` §9 puts it the
 * other way round on purpose: drag may not be the only way.
 *
 * ## The drop indicator
 *
 * A `data-drop` attribute on the row a drop would land on, styled as a line. It
 * is runtime interaction state — which row is under the pointer — and never
 * reaches the document; nothing about a drag is persisted, and abandoning one
 * leaves the design exactly as it was.
 *
 * ## What is not here
 *
 * No group or ungroup control: the accepted `APP3-S04` frames draw no way to
 * choose more than one member and `IMP-D045` PO-07 defers the group frame to a
 * decision nobody has taken, so the capability is reported blocked rather than
 * invented. No duplicate or delete — not in this checkpoint's capability row. No
 * undo, no saved chip, no watermark toggle, no bottom sheet.
 */
import { STUDIO_LAYER_COPY } from '../model/studio-layer-copy';
import { moveUnavailableReason, type StudioLayerRow } from '../model/studio-layers';
import type { UseStudioLayersResult } from '../hooks/use-studio-layers';

export interface StudioLayersListProps {
  readonly layers: UseStudioLayersResult;
}

export function StudioLayersList({ layers }: StudioLayersListProps) {
  const { rows } = layers;

  return (
    <section className="studio-layers" aria-label={STUDIO_LAYER_COPY.panelLabel}>
      <header className="studio-layers__header">
        <h2 className="studio-layers__title">{STUDIO_LAYER_COPY.title}</h2>
        <p className="studio-layers__note">{STUDIO_LAYER_COPY.orderNote}</p>
      </header>

      {rows.length === 0 ? (
        <p className="studio-layers__empty" data-testid="studio-layers-empty" role="status">
          {STUDIO_LAYER_COPY.empty}
          <span className="studio-layers__hint">{STUDIO_LAYER_COPY.emptyHint}</span>
        </p>
      ) : (
        <ul className="studio-layers__list" data-testid="studio-layer-list">
          {rows.map((row) => (
            <LayerRow key={row.id} layers={layers} row={row} />
          ))}
        </ul>
      )}

      {/*
        Polite, and it holds the last thing that happened rather than the current
        state: a restack is invisible to anyone who cannot see the stage, and
        "moved up" is the only evidence they get that the command did anything.
      */}
      <p className="studio-layers__status" role="status" data-testid="studio-layers-status">
        {layers.announcement}
      </p>
    </section>
  );
}

function LayerRow({
  layers,
  row,
}: {
  readonly layers: UseStudioLayersResult;
  readonly row: StudioLayerRow;
}) {
  const upReason = moveUnavailableReason(row, 'up');
  const downReason = moveUnavailableReason(row, 'down');

  return (
    <li
      className="studio-layers__item"
      data-testid={`studio-layer-${row.id}`}
      data-selected={row.selected}
      data-dragging={layers.draggingId === row.id}
      data-drop={layers.dropTargetId === row.id}
      // Native drag and drop: no interaction library, and no second renderer.
      // `draggable` is only offered where a drop could legally land, so a nested
      // row cannot start a gesture that would have to be refused.
      draggable={!row.nested}
      onDragStart={() => {
        layers.startDrag(row.id);
      }}
      onDragOver={(event) => {
        // Preventing the default is what makes this element a drop target at
        // all; without it the browser refuses the drop and no event arrives.
        event.preventDefault();
        layers.dragOver(row.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        layers.drop(row.id);
      }}
      onDragEnd={() => {
        layers.endDrag();
      }}
    >
      <button
        type="button"
        className="studio-layers__select"
        aria-pressed={row.selected}
        aria-label={STUDIO_LAYER_COPY.select(row.label)}
        data-testid={`studio-layer-select-${row.id}`}
        onClick={() => {
          layers.select(row.id);
        }}
      >
        <span className="studio-layers__type">{row.typeLabel}</span>
        <span className="studio-layers__name">{row.label}</span>
        {/* State in text as well as styling, so it is never colour-only. */}
        {row.visible ? null : (
          <span className="studio-layers__flag">{STUDIO_LAYER_COPY.hiddenFlag}</span>
        )}
        {row.locked ? (
          <span className="studio-layers__flag">{STUDIO_LAYER_COPY.lockedFlag}</span>
        ) : null}
      </button>

      <div className="studio-layers__controls">
        <StepButton layers={layers} reason={upReason} row={row} direction="up" />
        <StepButton layers={layers} reason={downReason} row={row} direction="down" />

        <button
          type="button"
          className="studio-layers__control"
          aria-pressed={!row.visible}
          aria-label={
            row.visible
              ? STUDIO_LAYER_COPY.hideFor(row.label)
              : STUDIO_LAYER_COPY.showFor(row.label)
          }
          data-testid={`studio-layer-visibility-${row.id}`}
          onClick={() => {
            layers.setVisible(row.id, !row.visible);
          }}
        >
          {row.visible ? STUDIO_LAYER_COPY.hide : STUDIO_LAYER_COPY.show}
        </button>

        <button
          type="button"
          className="studio-layers__control"
          aria-pressed={row.locked}
          aria-label={
            row.locked
              ? STUDIO_LAYER_COPY.unlockFor(row.label)
              : STUDIO_LAYER_COPY.lockFor(row.label)
          }
          data-testid={`studio-layer-lock-${row.id}`}
          onClick={() => {
            layers.setLocked(row.id, !row.locked);
          }}
        >
          {row.locked ? STUDIO_LAYER_COPY.unlock : STUDIO_LAYER_COPY.lock}
        </button>
      </div>
    </li>
  );
}

/**
 * One adjacent-move control.
 *
 * Disabled at a boundary and for a nested row, and the reason is real text tied
 * to the button by `aria-describedby` rather than a tooltip: a control that is
 * merely grey tells a customer it is unavailable and never why.
 */
function StepButton({
  direction,
  layers,
  reason,
  row,
}: {
  readonly direction: 'up' | 'down';
  readonly layers: UseStudioLayersResult;
  readonly reason: string | null;
  readonly row: StudioLayerRow;
}) {
  const reasonId = `studio-layer-${direction}-reason-${row.id}`;
  return (
    <>
      <button
        type="button"
        className="studio-layers__control"
        disabled={reason !== null}
        aria-describedby={reason === null ? undefined : reasonId}
        aria-label={
          direction === 'up'
            ? STUDIO_LAYER_COPY.moveUpFor(row.label)
            : STUDIO_LAYER_COPY.moveDownFor(row.label)
        }
        data-testid={`studio-layer-${direction}-${row.id}`}
        onClick={() => {
          layers.step(row.id, direction);
        }}
      >
        {direction === 'up' ? STUDIO_LAYER_COPY.moveUp : STUDIO_LAYER_COPY.moveDown}
      </button>
      {reason === null ? null : (
        <span className="studio-layers__reason" id={reasonId}>
          {reason}
        </span>
      )}
    </>
  );
}
