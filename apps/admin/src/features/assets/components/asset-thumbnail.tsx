'use client';

import { useState } from 'react';

import { ASSET_COPY } from '../model/asset-copy';
import { buildAssetPreviewUrl } from '../model/asset-preview-url';
import type { AssetStatusPresentation } from '../model/asset-status';

/**
 * One library tile's image, or the truthful reason there is not one
 * (`APP12-V02-C2` §18).
 *
 * `APP2-A01` drew a single neutral placeholder here for every asset, because no
 * Admin delivery contract existed to load a preview from. `adminAsset_preview`
 * is that contract, so a `READY` asset now shows its own pixels — and the
 * states that are *not* an image stop sharing one caption that said nothing
 * about which of them applied.
 *
 * Four states, each asserting only what is known:
 *
 * - `READY`   — the derivative exists, so the image renders.
 * - `PENDING` / `PROCESSING` — the bytes are not encoded yet. "Being
 *   processed", not "no image": one is temporary and the other is not.
 * - `REJECTED` — inspection refused it. There will never be a preview.
 * - `UNKNOWN`  — this build cannot interpret the status, so it claims nothing.
 *
 * The `onError` swap is the fifth: a request that was expected to succeed and
 * did not. It is per-tile React state, so one failed image degrades inside its
 * own tile while every other tile is untouched, and it renders `unavailable`
 * rather than the "no preview yet" caption — a delivery failure must not be
 * indistinguishable from an asset that legitimately has no picture. There is
 * deliberately no retry: a 404 from the route is a correct answer, and
 * retrying would only hammer it.
 */
export function AssetThumbnail({
  assetId,
  presentation,
}: {
  assetId: string;
  presentation: AssetStatusPresentation;
}) {
  const [failed, setFailed] = useState(false);

  if (presentation !== 'READY' || failed) {
    return (
      <div className="asset-card__thumb" role="img" aria-label={captionFor(presentation, failed)}>
        <span className="asset-card__glyph" aria-hidden="true">
          ▣
        </span>
      </div>
    );
  }

  return (
    <div className="asset-card__thumb asset-card__thumb--image">
      {/*
        A plain <img>, not next/image: the preview is served by the
        session-gated API route, which re-checks the lane on every request and
        answers `no-store`. An optimizer would need to fetch it server-side
        without the operator's session, and caching it is exactly what the
        route refuses to allow.

        No `width`/`height` attributes: the tile is a fixed-ratio box in the
        stylesheet, so the browser has the shape before the bytes arrive and
        there is nothing for intrinsic dimensions to reserve here.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="asset-card__image"
        src={buildAssetPreviewUrl(assetId)}
        alt={ASSET_COPY.identity.thumbnailAlt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** The reason this tile is not showing an image. Never a generic blank. */
function captionFor(presentation: AssetStatusPresentation, failed: boolean): string {
  if (failed) {
    return ASSET_COPY.identity.thumbnailUnavailable;
  }
  if (presentation === 'PENDING' || presentation === 'PROCESSING') {
    return ASSET_COPY.identity.thumbnailProcessing;
  }
  if (presentation === 'REJECTED') {
    return ASSET_COPY.identity.thumbnailRejected;
  }
  return ASSET_COPY.identity.thumbnailPlaceholder;
}
