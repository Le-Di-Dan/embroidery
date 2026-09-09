'use client';

import { useState } from 'react';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { isAtCapacity } from '../model/product-media-capacity';
import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import {
  canMoveEarlier,
  canMoveLater,
  canRemoveAt,
  moveSelection,
  removeAt,
  setPrimary,
} from '../model/product-media-selection';
import { ProductAssetPickerDialog } from './product-asset-picker-dialog';
import { ProductMediaActionBar } from './product-media-action-bar';
import { ProductMediaGrid } from './product-media-grid';
import { ProductMediaRemoveDialog } from './product-media-remove-dialog';

interface ProductMediaEditorProps {
  readonly selection: readonly string[];
  /**
   * Server-known Asset statuses, keyed by Asset id — read-only, and never sent.
   *
   * Passed through untouched: the editor owns the ordered selection the save
   * path writes, and this is the second projection the tiles read to tell an
   * operator that a stored image is no longer usable.
   */
  readonly statusByAssetId?: ReadonlyMap<string, string> | undefined;
  readonly disabled: boolean;
  /** True on a PUBLISHED product (`APP12-M01.B2` refuses an empty set there). */
  readonly requiresAtLeastOne: boolean;
  /** Draws the live-region card apart from the locked groups around it. */
  readonly emphasised?: boolean;
  readonly onChange: (selection: readonly string[]) => void;
}

/**
 * The Product media section (`934:187` … `935:398`, `948:311`).
 *
 * The order on screen *is* the order sent: position drives role, so the first
 * tile is the THUMBNAIL and the rest are GALLERY, exactly as the server derives
 * it. Nothing here sends anything — the editor reports a new ordered array
 * upward and the save path decides whether and how to persist it. That is what
 * keeps twenty tile actions to **one** request (`APP12-M01.A1` §18).
 *
 * ## One selection, two action treatments
 *
 * Selecting a tile is what makes its actions reachable at 390, where the tile
 * is 157 px and cannot hold four 44 px targets; at 1440 and 1024 the same
 * selection lights the in-tile bar, which is also revealed on hover and on
 * focus-within. Both read from one `selectedIndex`, so the operator's idea of
 * "the image I am working on" survives a resize.
 *
 * ## Announcements
 *
 * A reorder changes nothing in a tile's own text, so a keyboard operator would
 * otherwise press `Di chuyển trước` and perceive no result. Every mutation
 * announces its outcome — including the new position — through one polite live
 * region.
 */
export function ProductMediaEditor({
  selection,
  statusByAssetId,
  disabled,
  requiresAtLeastOne,
  emphasised = false,
  onChange,
}: ProductMediaEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pendingPrimaryRemoval, setPendingPrimaryRemoval] = useState(false);

  const total = selection.length;
  const full = isAtCapacity(total);

  const apply = (next: readonly string[], message: string, focusIndex: number | null) => {
    onChange(next);
    setAnnouncement(message);
    setSelectedIndex(focusIndex);
  };

  const handleSelect = (index: number) => {
    // Tapping the selected tile again dismisses its bar, which is the only way
    // back to a neutral screen at 390 other than the bar's own close control.
    if (selectedIndex === index) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex(index);
    setAnnouncement(PRODUCT_MEDIA_COPY.announce.selected({ position: index + 1, total }));
  };

  const handleSetPrimary = (index: number) => {
    apply(
      setPrimary(selection, index),
      PRODUCT_MEDIA_COPY.announce.primarySet(index + 1),
      // The image moved to the front; following it keeps the action bar on the
      // photograph the operator was looking at rather than on its old neighbour.
      0,
    );
  };

  const handleMove = (index: number, offset: number) => {
    const target = index + offset;
    apply(
      moveSelection(selection, index, offset),
      PRODUCT_MEDIA_COPY.announce.reordered({ position: target + 1, total }),
      target,
    );
  };

  const handleRemove = (index: number) => {
    // Only the primary confirms, and only while another image would inherit the
    // role. Removing the sole image of a DRAFT changes nothing outside this
    // screen; removing the primary of a gallery silently promotes position 2.
    if (index === 0 && total > 1) {
      setPendingPrimaryRemoval(true);
      return;
    }
    commitRemove(index);
  };

  const commitRemove = (index: number) => {
    const next = removeAt(selection, index);
    apply(next, PRODUCT_MEDIA_COPY.announce.removed(next.length), null);
  };

  const place = selectedIndex === null ? null : { position: selectedIndex + 1, total };

  return (
    <section
      className="product-form__group product-media-editor"
      data-emphasised={emphasised ? 'true' : undefined}
    >
      <div className="product-media-editor__header">
        <h2 className="product-form__group-title">{PRODUCT_FORM_COPY.groups.media}</h2>
        <p
          className="product-media-editor__capacity"
          data-full={full ? 'true' : undefined}
          aria-label={PRODUCT_MEDIA_COPY.header.capacityLabel(total)}
        >
          {PRODUCT_MEDIA_COPY.header.capacity(total)}
        </p>
        <button
          type="button"
          className="product-media-editor__pick"
          onClick={() => setPickerOpen(true)}
          disabled={disabled || full}
        >
          {PRODUCT_MEDIA_COPY.header.add}
        </button>
      </div>

      <p className="product-media-editor__help product-media-editor__help--wide">
        {PRODUCT_MEDIA_COPY.header.help}
      </p>
      <p className="product-media-editor__help product-media-editor__help--narrow">
        {PRODUCT_MEDIA_COPY.header.helpNarrow}
      </p>

      {emphasised ? (
        <p className="product-media-editor__note">{PRODUCT_MEDIA_COPY.published.mediaNote}</p>
      ) : null}

      {full ? (
        <p className="product-media-editor__capacity-notice">
          {PRODUCT_MEDIA_COPY.header.capacityFull}
        </p>
      ) : null}

      {/*
        Why the sole image of a published product cannot be removed. It lives at
        section level rather than on the control, because the desktop tile bar
        appears on hover and a disabled `✕` that only explains itself when
        pointed at explains itself to nobody — which is exactly what the live
        1440 run found (`APP12-M01.A1` §Q). The mobile bar therefore no longer
        repeats it: one sentence, one place, visible at every viewport.
      */}
      {requiresAtLeastOne && total === 1 ? (
        <p className="product-media-editor__capacity-notice">
          {PRODUCT_MEDIA_COPY.actions.publishedMinimum}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="product-media-editor__empty">{PRODUCT_MEDIA_COPY.header.empty}</p>
      ) : (
        <ProductMediaGrid
          selection={selection}
          statusByAssetId={statusByAssetId}
          selectedIndex={selectedIndex}
          disabled={disabled}
          requiresAtLeastOne={requiresAtLeastOne}
          onSelect={handleSelect}
          onSetPrimary={handleSetPrimary}
          onMoveEarlier={(index) => handleMove(index, -1)}
          onMoveLater={(index) => handleMove(index, 1)}
          onRemove={handleRemove}
        />
      )}

      <p className="product-media-editor__sr-status" role="status" aria-live="polite">
        {announcement}
      </p>

      {place === null || selectedIndex === null ? null : (
        <ProductMediaActionBar
          position={place.position}
          total={place.total}
          disabled={disabled}
          canMoveEarlier={canMoveEarlier(selection, selectedIndex)}
          canMoveLater={canMoveLater(selection, selectedIndex)}
          canRemove={canRemoveAt(selection, selectedIndex, { requiresAtLeastOne })}
          onSetPrimary={() => handleSetPrimary(selectedIndex)}
          onMoveEarlier={() => handleMove(selectedIndex, -1)}
          onMoveLater={() => handleMove(selectedIndex, 1)}
          onRemove={() => handleRemove(selectedIndex)}
          onDismiss={() => setSelectedIndex(null)}
        />
      )}

      {pendingPrimaryRemoval ? (
        <ProductMediaRemoveDialog
          onCancel={() => setPendingPrimaryRemoval(false)}
          onConfirm={() => {
            setPendingPrimaryRemoval(false);
            commitRemove(0);
          }}
        />
      ) : null}

      {pickerOpen ? (
        <ProductAssetPickerDialog
          selection={selection}
          onClose={() => setPickerOpen(false)}
          onConfirm={(next) => {
            onChange(next);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
