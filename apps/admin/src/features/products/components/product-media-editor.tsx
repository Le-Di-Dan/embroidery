'use client';

import { useState } from 'react';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import {
  canMove,
  moveSelection,
  removeFromSelection,
  roleForPosition,
} from '../model/product-media-selection';
import { ProductAssetPickerDialog } from './product-asset-picker-dialog';
import { ProductMediaRow, type ProductMediaRowData } from './product-media-row';

interface ProductMediaEditorProps {
  readonly selection: readonly string[];
  /** Identity for every id the screen knows about, from detail + picker pages. */
  readonly knownMedia: ReadonlyMap<string, ProductMediaRowData>;
  readonly disabled: boolean;
  readonly onChange: (selection: readonly string[]) => void;
  readonly onLearnMedia: (media: readonly ProductMediaRowData[]) => void;
}

/**
 * Ordered media selection (`434:20` — Group / Ảnh sản phẩm).
 *
 * The order on screen *is* the order sent: position drives role, so the first
 * row is the THUMBNAIL and the rest are GALLERY, exactly as the server derives
 * it. Nothing here sends `mediaAssetIds` — the editor only reports the new
 * selection upward, and the save path decides whether it changed.
 *
 * Reordering and removal are announced through a polite live region. Without
 * it, a keyboard operator pressing "Di chuyển trước" gets no confirmation that
 * anything happened, since the row's own text does not change.
 *
 * An id with no known identity is still rendered, using neutral copy, rather
 * than dropped: silently omitting a selected image would misrepresent what a
 * save is about to persist.
 */
export function ProductMediaEditor({
  selection,
  knownMedia,
  disabled,
  onChange,
  onLearnMedia,
}: ProductMediaEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const apply = (next: readonly string[], message: string) => {
    onChange(next);
    setAnnouncement(message);
  };

  return (
    <section className="product-form__group product-media-editor">
      <div className="product-media-editor__header">
        <h2 className="product-form__group-title">{PRODUCT_FORM_COPY.groups.media}</h2>
        <button
          type="button"
          className="product-media-editor__pick"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
        >
          {PRODUCT_FORM_COPY.media.pick}
        </button>
      </div>

      <p className="product-media-editor__help">{PRODUCT_FORM_COPY.media.help}</p>

      {selection.length === 0 ? (
        <p className="product-media-editor__empty">{PRODUCT_FORM_COPY.media.empty}</p>
      ) : (
        <ul className="product-media-editor__list" aria-label={PRODUCT_FORM_COPY.media.listLabel}>
          {selection.map((assetId, index) => (
            <ProductMediaRow
              key={assetId}
              media={
                knownMedia.get(assetId) ?? {
                  assetId,
                  mediaType: '',
                  byteSize: Number.NaN,
                  createdAt: '',
                }
              }
              role={roleForPosition(index)}
              canMoveEarlier={canMove(selection, index, -1)}
              canMoveLater={canMove(selection, index, 1)}
              disabled={disabled}
              onMoveEarlier={() =>
                apply(moveSelection(selection, index, -1), PRODUCT_FORM_COPY.media.reordered)
              }
              onMoveLater={() =>
                apply(moveSelection(selection, index, 1), PRODUCT_FORM_COPY.media.reordered)
              }
              onRemove={() =>
                apply(removeFromSelection(selection, assetId), PRODUCT_FORM_COPY.media.removed)
              }
            />
          ))}
        </ul>
      )}

      <p className="product-media-editor__sr-status" role="status" aria-live="polite">
        {announcement}
      </p>

      {pickerOpen ? (
        <ProductAssetPickerDialog
          selection={selection}
          onClose={() => setPickerOpen(false)}
          onLearnMedia={onLearnMedia}
          onConfirm={(next) => {
            onChange(next);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
