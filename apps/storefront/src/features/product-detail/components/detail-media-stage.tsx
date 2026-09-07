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
  /** Intrinsic width of the derivative `url` addresses, when the server published one. */
  readonly width?: number;
  /** Intrinsic height of that same derivative. Applied only together with {@link width}. */
  readonly height?: number;
}

/**
 * The bounded stage that holds the current artwork.
 *
 * A plain `<img>`, not `next/image`. That choice is unchanged, but its reason
 * has: the original note said the contract published no intrinsic dimensions,
 * which stopped being true at `APP12-H05-C1` and stayed in the comment for two
 * checkpoints. `next/image` is still avoided because it would want a layout and
 * a loader for an image the `APP2-T01` route already serves at a fixed
 * rendition; the dimensions themselves are now passed straight through.
 *
 * They are applied **only as a complete pair**, and they are the derivative's
 * own — never a ratio invented to fill them in. The approved authority forbids
 * cropping every artwork to a house ratio (`541:3`: contain, natural ratio, the
 * drawn 3:4 is an example only), so the image still sits in a neutral bounded
 * box under `object-fit: contain` and keeps whatever proportions the studio
 * photographed. What the attributes buy is the box being the right shape
 * *before* the bytes arrive rather than after.
 *
 * `fetchpriority="high"` and eager loading, because this is the measured LCP
 * element of the page (`APP12-H05` §G). It is the one image on Product Detail
 * that must not be deferred; the strip beneath it is the opposite case.
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
  width,
  height,
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
          the route serves one fixed rendition, so next/image would add a loader
          and a layout for an address that already resolves. */}
      <img
        className="product-detail__stage-image"
        src={url}
        alt={mainMediaAlt(name, index, total)}
        ref={captureAlreadyFailed}
        onError={onError}
        // Both or neither: a width without a height reserves a wrong box rather
        // than no box, which is worse than the shift it was meant to prevent.
        {...(width === undefined || height === undefined ? {} : { width, height })}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}
