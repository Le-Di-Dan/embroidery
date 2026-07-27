'use client';

import { useState, type ChangeEvent, type DragEvent, type RefObject } from 'react';

import { ASSET_COPY, withToken } from '../model/asset-copy';
import { ASSET_FILE_ACCEPT } from '../model/asset-upload-policy';
import type { AssetUploadController } from '../hooks/use-asset-upload';

interface AssetUploadPanelProps {
  readonly controller: AssetUploadController;
  /** Shared with the header action so both affordances drive one input. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * File selection: the native input, the desktop drop target, and the staged
 * file awaiting confirmation.
 *
 * The button and the drop target funnel into the same validation call, so the
 * two entry points cannot drift apart, and drag-and-drop is never the only way
 * in — the input alone is sufficient, which is what the mobile layout uses.
 *
 * The browser checks the declared type and the size only. It reads no bytes: no
 * decode, no `ArrayBuffer`, no base64 copy of a file that may be 25 MiB. The
 * API re-validates everything, including the magic bytes the browser cannot see.
 */
export function AssetUploadPanel({ controller, inputRef }: AssetUploadPanelProps) {
  const { state, select, submit } = controller;
  const [dragActive, setDragActive] = useState(false);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    select(Array.from(event.target.files ?? []));
    // Reset so re-choosing the same file still raises a change event.
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    select(Array.from(event.dataTransfer.files));
  }

  const busy = state.kind === 'uploading';

  return (
    <section className="assets-upload">
      <input
        ref={inputRef}
        id="asset-upload-input"
        className="assets-upload__input"
        type="file"
        accept={ASSET_FILE_ACCEPT}
        onChange={handleInputChange}
        disabled={busy}
        aria-label={ASSET_COPY.upload.inputLabel}
      />

      <div
        className={`assets-upload__drop${dragActive ? ' assets-upload__drop--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => {
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <p className="assets-upload__drop-title">{ASSET_COPY.upload.dropTitle}</p>
        <p className="assets-upload__drop-hint">{ASSET_COPY.upload.dropHint}</p>
        <button
          type="button"
          className="assets-upload__browse"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {ASSET_COPY.upload.browse}
        </button>
      </div>

      <p className="assets-upload__mobile-hint">{ASSET_COPY.upload.mobileHint}</p>
      <p className="assets-upload__formats">{ASSET_COPY.upload.formats}</p>

      {state.kind === 'selected' ? (
        <div className="assets-upload__selected">
          <p className="assets-upload__selected-title">
            {withToken(ASSET_COPY.upload.selectedTitle, 'name', state.file.name)}
          </p>
          <p className="assets-upload__selected-body">{ASSET_COPY.upload.selectedDescription}</p>
          <div className="assets-upload__selected-actions">
            <button type="button" className="assets-upload__submit" onClick={submit}>
              {ASSET_COPY.upload.submit}
            </button>
            <button
              type="button"
              className="assets-upload__replace"
              onClick={() => inputRef.current?.click()}
            >
              {ASSET_COPY.upload.clear}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
