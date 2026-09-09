'use client';

import { useState } from 'react';

import { MEDIA_COPY } from './media-copy';
import { assetThumbnailCaption } from './asset-thumbnail-state';
import { buildAssetPreviewUrl } from './asset-preview-url';

/**
 * What a tile can be showing, from the tile's point of view.
 *
 * Deliberately not an asset lifecycle state. A caller maps its own vocabulary
 * onto these four, so a surface with no asset at all (`ABSENT`) and one whose
 * asset is mid-flight (`PROCESSING`) can both use this component without the
 * component learning what a product or an inspection is.
 */
export type AssetThumbnailState = 'READY' | 'PROCESSING' | 'REJECTED' | 'ABSENT';

/**
 * One asset's image, or the truthful reason there is not one
 * (`APP12-V02-C2` §18).
 *
 * `APP2-A01` and `APP2-A03` both drew a neutral placeholder here and both said
 * why: there was no Admin delivery contract, so any `src` would have been
 * fabricated. `adminAsset_preview` is that contract, so a `READY` asset shows
 * its own pixels — and the states that are *not* an image stop sharing one
 * caption that said nothing about which of them applied.
 *
 * The `onError` swap is the fifth state: a request that was expected to succeed
 * and did not. It is per-tile React state, so one failed image degrades inside
 * its own tile while every other tile is untouched, and it renders `unavailable`
 * rather than the "no image" caption — a delivery failure must never be
 * indistinguishable from a subject that legitimately has no picture. There is
 * deliberately no retry: a 404 from the route is a correct answer, and retrying
 * would only hammer it.
 */
export function AssetThumbnail({
  assetId,
  state,
  className = 'asset-thumb',
}: {
  /** Absent when there is nothing to address — an `ABSENT` tile. */
  readonly assetId?: string | undefined;
  readonly state: AssetThumbnailState;
  /** The block the host surface styles. Its `--image` variant is added here. */
  readonly className?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);

  if (state !== 'READY' || assetId === undefined || failed) {
    return (
      <span className={className} role="img" aria-label={captionFor(state, failed)}>
        <span className={`${className}__glyph`} aria-hidden="true">
          ▣
        </span>
      </span>
    );
  }

  return (
    <span className={`${className} ${className}--image`}>
      {/*
        A plain <img>, not next/image: the preview is served by the
        session-gated API route, which re-checks the lane on every request and
        answers `no-store`. An optimizer would have to fetch it server-side
        without the operator's session, and caching it is exactly what the route
        refuses to allow.

        No `width`/`height`: each host surface sizes this tile in its own
        stylesheet, so the browser already has the box before the bytes arrive.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${className}__image`}
        src={buildAssetPreviewUrl(assetId)}
        alt={MEDIA_COPY.thumbnailAlt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/**
 * The reason this tile is not showing an image. Never a generic blank.
 *
 * `failed` is this component's own fifth state — a request that was expected to
 * succeed and did not — and it outranks the caller's state because it describes
 * what just happened rather than what the row says. Everything else defers to
 * the shared state→caption mapping, so a surface that renders a caption without
 * this component cannot describe the same state in different words.
 */
function captionFor(state: AssetThumbnailState, failed: boolean): string {
  if (failed) {
    return MEDIA_COPY.unavailable;
  }
  return state === 'READY' ? MEDIA_COPY.absent : assetThumbnailCaption(state);
}
