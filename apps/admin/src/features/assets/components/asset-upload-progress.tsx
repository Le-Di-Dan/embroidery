import { ASSET_COPY, withToken } from '../model/asset-copy';

interface AssetUploadProgressProps {
  /** Real transferred share, or `null` when it cannot be measured. */
  readonly percent: number | null;
}

/**
 * Upload progress from transferred bytes only.
 *
 * When the transport cannot report a usable figure the bar becomes
 * indeterminate rather than inventing one, and `aria-valuenow` is omitted so
 * assistive technology is told the same truth as the screen. The value never
 * reaches 100 here — completion is announced by the HTTP result, not by a
 * progress event.
 */
/**
 * Visual fill granularity. The bar's width is a stylesheet concern (inline
 * style props are forbidden), so the SCSS declares one width class per 5% step
 * and this floors into it. Flooring — never rounding — keeps 99% from painting
 * a full bar before the server has answered. The exact figure is still exposed
 * verbatim in the label and in `aria-valuenow`.
 */
const FILL_STEP = 5;

export function AssetUploadProgress({ percent }: AssetUploadProgressProps) {
  const determinate = percent !== null;
  const fillStep = determinate ? Math.floor(percent / FILL_STEP) * FILL_STEP : 0;
  return (
    <div className="asset-progress">
      <div
        className={`asset-progress__track${determinate ? '' : ' asset-progress__track--indeterminate'}`}
        role="progressbar"
        aria-label={ASSET_COPY.progress.label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(determinate ? { 'aria-valuenow': percent } : {})}
      >
        <div
          className={
            determinate
              ? `asset-progress__fill asset-progress__fill--${fillStep}`
              : 'asset-progress__fill asset-progress__fill--pending'
          }
        />
      </div>
      <p className="asset-progress__text">
        {determinate
          ? withToken(ASSET_COPY.progress.determinate, 'percent', String(percent))
          : ASSET_COPY.progress.indeterminate}
      </p>
    </div>
  );
}
