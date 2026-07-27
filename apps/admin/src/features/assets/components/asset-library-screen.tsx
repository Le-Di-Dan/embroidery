'use client';

import { useRef } from 'react';

import { ASSET_COPY } from '../model/asset-copy';
import { useAssetUpload } from '../hooks/use-asset-upload';
import { AssetCollection } from './asset-collection';
import { AssetUploadBanner } from './asset-upload-banner';
import { AssetUploadPanel } from './asset-upload-panel';

/**
 * The Admin asset library capability.
 *
 * It composes state and owns no data access of its own: the collection query
 * lives in `AssetCollection`, and the upload intent — file, abort controller,
 * idempotency key, progress and reconciliation — lives in `useAssetUpload`.
 *
 * The header action and the drop target's own button drive the same hidden
 * native input, which is why the ref is created here and passed down: two
 * approved affordances, one file input, one validation path.
 */
export function AssetLibraryScreen() {
  const controller = useAssetUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = controller.state.kind === 'uploading';

  return (
    <section className="assets">
      <header className="assets__header">
        <div className="assets__heading">
          <h1 className="assets__title">{ASSET_COPY.page.title}</h1>
          <p className="assets__subtitle">{ASSET_COPY.page.subtitle}</p>
        </div>
        <button
          type="button"
          className="assets__primary-action"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {ASSET_COPY.upload.action}
        </button>
      </header>

      <AssetUploadPanel controller={controller} inputRef={inputRef} />
      <AssetUploadBanner controller={controller} />
      <AssetCollection />
    </section>
  );
}
