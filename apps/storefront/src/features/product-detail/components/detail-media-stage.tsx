'use client';

import { useCallback } from 'react';

import { mainMediaAlt, PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

interface DetailMediaStageProps {
  readonly url: string;
  readonly name: string;
  readonly index: number;
  readonly total: number;
  readonly failed: boolean;
  readonly onError: () => void;
}

/**
 * The bounded stage that holds the current artwork.
 *
 * A plain `<img>`, not `next/image`: `publicProductDetail` publishes no width or
 * height, and `next/image` requires intrinsic dimensions. Supplying them would
 * mean inventing a ratio and cropping every artwork to it — which is what the
 * approved authority explicitly forbids (`541:3`: contain, natural ratio, the
 * drawn 3:4 is an example only).
 *
 * The image therefore sits in a neutral bounded box under `object-fit: contain`
 * and keeps whatever proportions the studio photographed.
 *
 * A failure states itself. It does not swap in another image or fall back to the
 * thumbnail rendition: the visitor would have no way to know they were looking
 * at something other than what they asked for, and the surrounding Product text
 * stays perfectly usable without it.
 */
export function DetailMediaStage({
  url,
  name,
  index,
  total,
  failed,
  onError,
}: DetailMediaStageProps) {
  /**
   * The image is server-rendered, so it can finish loading — or fail — before
   * React hydrates and attaches `onError`. That event is then simply lost, and a
   * broken artwork would sit there as a blank box claiming nothing is wrong.
   * Checking the element's own state the moment the ref attaches closes that
   * window: a decoded image reports a non-zero `naturalWidth`, and a `complete`
   * image with zero width is one the browser has already given up on.
   *
   * Measured, not theorised: aborting the media request in the production smoke
   * left the page silent until this check existed.
   */
  const captureAlreadyFailed = useCallback(
    (element: HTMLImageElement | null) => {
      if (element === null) return;
      if (element.complete && element.naturalWidth === 0) onError();
    },
    [onError],
  );

  if (failed) {
    return (
      <div className="product-detail__stage product-detail__stage--error">
        <p className="product-detail__stage-message">{PRODUCT_DETAIL_COPY.mediaError}</p>
      </div>
    );
  }

  return (
    <div className="product-detail__stage">
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above:
          the contract carries no intrinsic dimensions, so next/image cannot be
          used without fabricating a ratio. */}
      <img
        className="product-detail__stage-image"
        src={url}
        alt={mainMediaAlt(name, index, total)}
        ref={captureAlreadyFailed}
        onError={onError}
        decoding="async"
      />
    </div>
  );
}
