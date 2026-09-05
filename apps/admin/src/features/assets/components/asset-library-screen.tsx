'use client';

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
 * There is one way to open the file picker, and it is the drop target's own
 * button. The header used to carry a second action beside it that opened the
 * same native input: two buttons, one behaviour, and no way for an operator to
 * tell what distinguished them. The panel keeps the affordance because that is
 * where the drop target and the format hint already are, so the choice and its
 * explanation stay in one place.
 */
export function AssetLibraryScreen() {
  const controller = useAssetUpload();

  return (
    <section className="assets">
      <header className="assets__header">
        <div className="assets__heading">
          <h1 className="assets__title">{ASSET_COPY.page.title}</h1>
          <p className="assets__subtitle">{ASSET_COPY.page.subtitle}</p>
        </div>
      </header>

      <AssetUploadPanel controller={controller} />
      <AssetUploadBanner controller={controller} />
      <AssetCollection />
    </section>
  );
}
