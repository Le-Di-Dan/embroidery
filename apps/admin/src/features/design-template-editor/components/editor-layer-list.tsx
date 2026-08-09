'use client';

import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import { canAddTextElement } from '../model/editor-document';
import { elementLabel } from './editor-stage-element';

interface EditorLayerListProps {
  readonly document: DesignDocument;
  readonly selectedElementId: string | null;
  readonly editable: boolean;
  readonly onSelect: (elementId: string) => void;
  readonly onAddText: () => void;
  readonly onRemove: (elementId: string) => void;
}

/**
 * The layer panel (`601:3`, left column, 240px minimum at 1280).
 *
 * The order is document order **reversed**, because the array is z-order bottom
 * first while a layer list reads top first — and the panel says so rather than
 * leaving the operator to infer which end is the front. Nothing is sorted by
 * name, type or recency: the list is the document's own order, so what it shows
 * is what the stage paints.
 *
 * Every row is a real `<button>`, so the whole panel is reachable and operable
 * by keyboard. That is what makes the SVG stage an *additional* way to select
 * rather than the only one.
 *
 * There is no drag-to-reorder. `APP3-P01` gives z-order no separate field — it
 * *is* the array order — and a reorder command is not among the operations this
 * checkpoint owns, so inventing the gesture from the visual alone would be
 * building a capability the document model was never asked about here.
 */
export function EditorLayerList({
  document,
  selectedElementId,
  editable,
  onSelect,
  onAddText,
  onRemove,
}: EditorLayerListProps) {
  const topFirst = [...document.elements].reverse();
  const canAdd = canAddTextElement(document);

  return (
    <section
      className="template-editor-layers"
      aria-label={DESIGN_TEMPLATE_EDITOR_COPY.layers.title}
    >
      <header className="template-editor-layers__header">
        <h2 className="template-editor-layers__title">
          {DESIGN_TEMPLATE_EDITOR_COPY.layers.title}
        </h2>
        <p className="template-editor-layers__note">
          {DESIGN_TEMPLATE_EDITOR_COPY.layers.orderNote}
        </p>
      </header>

      {editable ? (
        <div className="template-editor-layers__actions">
          <button
            type="button"
            className="template-editor-layers__add"
            disabled={!canAdd}
            data-testid="editor-add-text"
            onClick={onAddText}
          >
            {DESIGN_TEMPLATE_EDITOR_COPY.layers.addText}
          </button>

          {/*
            Visible, disabled, and labelled with what it waits for — `APP3-D01`
            §I.1. No accepted API creates a TEMPLATE_SOURCE Asset, so there is
            nothing to attach; hiding the control would let a later checkpoint
            quietly wire it to a substitute asset kind instead.
          */}
          <button
            type="button"
            className="template-editor-layers__add"
            disabled
            aria-describedby="editor-add-image-reason"
            data-testid="editor-add-image"
          >
            {DESIGN_TEMPLATE_EDITOR_COPY.image.add}
          </button>
          <p className="template-editor-layers__disabled-reason" id="editor-add-image-reason">
            {DESIGN_TEMPLATE_EDITOR_COPY.image.addDisabled}{' '}
            {DESIGN_TEMPLATE_EDITOR_COPY.image.addDisabledReason}
          </p>

          {canAdd ? null : (
            <p className="template-editor-layers__disabled-reason" role="status">
              {DESIGN_TEMPLATE_EDITOR_COPY.layers.addTextLimit}
            </p>
          )}
        </div>
      ) : null}

      {topFirst.length === 0 ? (
        <p className="template-editor-layers__empty" data-testid="editor-layers-empty">
          {DESIGN_TEMPLATE_EDITOR_COPY.layers.empty}
        </p>
      ) : (
        <ul className="template-editor-layers__list" data-testid="editor-layer-list">
          {topFirst.map((element) => (
            <li key={element.id} className="template-editor-layers__item">
              <button
                type="button"
                className="template-editor-layers__button"
                aria-pressed={element.id === selectedElementId}
                data-selected={element.id === selectedElementId}
                data-testid={`editor-layer-${element.id}`}
                onClick={() => {
                  onSelect(element.id);
                }}
              >
                <span className="template-editor-layers__type">{typeLabel(element)}</span>
                <span className="template-editor-layers__name">{elementLabel(element)}</span>
                {/* State is carried in text as well as styling, so it is never
                    colour-only. */}
                {element.visible ? null : (
                  <span className="template-editor-layers__flag">
                    {DESIGN_TEMPLATE_EDITOR_COPY.layers.hidden}
                  </span>
                )}
                {element.locked ? (
                  <span className="template-editor-layers__flag">
                    {DESIGN_TEMPLATE_EDITOR_COPY.layers.locked}
                  </span>
                ) : null}
              </button>

              {editable ? (
                <button
                  type="button"
                  className="template-editor-layers__remove"
                  data-testid={`editor-layer-remove-${element.id}`}
                  onClick={() => {
                    onRemove(element.id);
                  }}
                >
                  {DESIGN_TEMPLATE_EDITOR_COPY.layers.remove}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function typeLabel(element: DesignElement): string {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.layers;
  switch (element.type) {
    case 'text':
      return copy.typeText;
    case 'image':
      return copy.typeImage;
    case 'shape':
      return copy.typeShape;
    case 'freehand':
      return copy.typeFreehand;
    default:
      return copy.typeGroup;
  }
}
