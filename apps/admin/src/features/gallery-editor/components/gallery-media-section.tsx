'use client';

import { useState } from 'react';

import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import {
  addAssets,
  canMoveAsset,
  moveAsset,
  promoteAssetToCover,
  removeAsset,
} from '../model/gallery-media-selection';
import { GalleryAssetPickerDialog } from './gallery-asset-picker-dialog';
import { GalleryMediaRow } from './gallery-media-row';
import { GallerySourcePickerDialog } from './gallery-source-picker-dialog';

interface GalleryMediaSectionProps {
  readonly entryTitle: string;
  readonly selection: readonly string[];
  readonly dirty: boolean;
  /** True while the replacement is in flight. */
  readonly saving: boolean;
  /** True when the entry's lifecycle state does not allow a media change. */
  readonly locked: boolean;
  readonly onChange: (selection: readonly string[]) => void;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  /** The save failure banner, owned by the screen so it survives a remount. */
  readonly failure: { readonly title: string; readonly body: string } | null;
}

/**
 * The ordered image selection (`870:926`).
 *
 * ## The order on screen is the order that will be sent
 *
 * Nothing here sorts, and the save sends the whole list exactly as arranged.
 * The first row is the cover — and the Open Graph image — because position 0 is
 * what the server and the public gallery both read, so "set as cover" is a move
 * to the front rather than a flag that could disagree with the order.
 *
 * ## Local until saved, and it stays local after a failure
 *
 * Adding, removing and reordering change only this screen's arrangement. The
 * server is told once, by an explicit save, and a save that is refused leaves
 * the arrangement untouched so the operator can fix one image and retry rather
 * than rebuild the sequence. That is also why removal never mutates per asset:
 * one replacement is atomic, and a sequence of per-image calls could leave the
 * entry half-changed if the fourth one failed.
 *
 * ## An empty selection is a legal draft
 *
 * Clearing every image is a valid authoring state, and the empty copy says so
 * while naming the consequence — publication needs at least one. The section
 * does not refuse the save; the publication panel reports the requirement,
 * because that is where it actually blocks something.
 *
 * ## There is no alt input, and no deletion
 *
 * Alt text is derived from the entry's title and position and has no column to
 * be stored in. No delivered operation deletes a prepared image, so no control
 * here offers to — detaching leaves the asset selectable and previewable.
 */
export function GalleryMediaSection({
  entryTitle,
  selection,
  dirty,
  saving,
  locked,
  onChange,
  onSave,
  onDiscard,
  failure,
}: GalleryMediaSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const disabled = saving || locked;
  const copy = GALLERY_MEDIA_COPY.section;

  const apply = (next: readonly string[], message: string) => {
    onChange(next);
    setAnnouncement(message);
  };

  return (
    <section className="gallery-editor__panel gallery-media" aria-labelledby="gallery-media-title">
      <div className="gallery-media__header">
        <h2 className="gallery-editor__panel-title" id="gallery-media-title">
          {copy.title}
        </h2>
        <div className="gallery-media__header-actions">
          <button
            type="button"
            className="gallery-editor__secondary"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            data-testid="gallery-media-add"
          >
            {copy.add}
          </button>
          <button
            type="button"
            className="gallery-editor__secondary"
            onClick={() => setSourceOpen(true)}
            disabled={disabled}
            data-testid="gallery-media-prepare"
          >
            {copy.prepare}
          </button>
        </div>
      </div>

      <p className="gallery-media__help">{copy.help}</p>

      {locked ? (
        <div className="gallery-editor__notice" data-testid="gallery-media-locked">
          <p className="gallery-editor__notice-title">{copy.lockedTitle}</p>
          <p className="gallery-editor__notice-body">{copy.lockedBody}</p>
        </div>
      ) : null}

      {failure === null ? null : (
        <div className="gallery-editor__failure" role="alert" data-testid="gallery-media-failure">
          <p className="gallery-editor__failure-title">{failure.title}</p>
          <p className="gallery-editor__failure-body">{failure.body}</p>
        </div>
      )}

      {selection.length === 0 ? (
        <p className="gallery-media__empty" data-testid="gallery-media-empty">
          {copy.empty}
        </p>
      ) : (
        <ul className="gallery-media__list" aria-label={copy.listLabel}>
          {selection.map((assetId, index) => (
            <GalleryMediaRow
              key={assetId}
              assetId={assetId}
              index={index}
              entryTitle={entryTitle}
              canMoveEarlier={canMoveAsset(selection, index, -1)}
              canMoveLater={canMoveAsset(selection, index, 1)}
              disabled={disabled}
              onMoveEarlier={() => apply(moveAsset(selection, index, -1), copy.reordered)}
              onMoveLater={() => apply(moveAsset(selection, index, 1), copy.reordered)}
              onSetCover={() => apply(promoteAssetToCover(selection, index), copy.coverSet)}
              onRemove={() => apply(removeAsset(selection, assetId), copy.removed)}
            />
          ))}
        </ul>
      )}

      {dirty && !locked ? (
        <div className="gallery-media__footer">
          <p className="gallery-media__dirty" data-testid="gallery-media-dirty">
            {copy.dirty}
          </p>
          <div className="gallery-media__footer-actions">
            <button
              type="button"
              className="gallery-editor__secondary"
              onClick={onDiscard}
              disabled={saving}
            >
              {copy.discard}
            </button>
            <button
              type="button"
              className="gallery-editor__primary"
              onClick={onSave}
              disabled={saving}
              aria-busy={saving}
              data-testid="gallery-media-save"
            >
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      ) : null}

      <p className="gallery-editor__sr-status" role="status" aria-live="polite">
        {announcement}
      </p>

      {pickerOpen ? (
        <GalleryAssetPickerDialog
          selection={selection}
          onClose={() => setPickerOpen(false)}
          onConfirm={(next) => {
            setPickerOpen(false);
            apply(next, copy.added);
          }}
        />
      ) : null}

      {sourceOpen ? (
        <GallerySourcePickerDialog
          onClose={() => setSourceOpen(false)}
          onPrepared={(assetId) => {
            setSourceOpen(false);
            // The prepared image is selected immediately — that is what the
            // operator asked for — but it is still only *local* until the media
            // save runs, exactly like one chosen from the picker.
            apply(addAssets(selection, [assetId]), GALLERY_MEDIA_COPY.source.prepared);
          }}
        />
      ) : null}
    </section>
  );
}
