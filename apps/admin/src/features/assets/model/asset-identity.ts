/**
 * Server-backed asset identity (`APP2-D02` / IMP-D031, Figma `484:272`).
 *
 * The backend neither stores nor returns the source filename, so identity is
 * derived from the contract fields alone: the media type becomes the title and
 * `{size} · {createdAt}` becomes the secondary line. No storage key, checksum,
 * `assetId` fragment, inspection detail or worker log is ever an identity
 * source, and no filename is fabricated.
 *
 * Formatting is deliberately explicit rather than `Intl`-based. The approved
 * output (`2,4 MB · 27/07/2026, 14:35`) is exact, and `Intl` unit/date output
 * varies by ICU build — an explicit formatter is the only way the tests can
 * pin the rendered string on every supported runtime.
 */
import { ASSET_COPY } from './asset-copy';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const DECIMAL_SEPARATOR = ',';

/** Titles for the contract's closed media-type set; anything else is unknown. */
const TITLE_BY_MEDIA_TYPE: Readonly<Record<string, string>> = {
  'image/png': ASSET_COPY.identity.titlePng,
  'image/jpeg': ASSET_COPY.identity.titleJpeg,
  'image/webp': ASSET_COPY.identity.titleWebp,
};

/**
 * The rendered asset title. An unrecognised or malformed media type falls back
 * to the neutral label — the raw MIME string is never shown as a title.
 */
export function resolveAssetTitle(mediaType: unknown): string {
  if (typeof mediaType !== 'string') {
    return ASSET_COPY.identity.titleUnknown;
  }
  return TITLE_BY_MEDIA_TYPE[mediaType] ?? ASSET_COPY.identity.titleUnknown;
}

/** Renders one decimal, drops a trailing `,0`, and uses the vi-VN comma. */
function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.trunc(rounded);
  const tenths = Math.round((rounded - whole) * 10);
  return tenths === 0 ? `${whole}` : `${whole}${DECIMAL_SEPARATOR}${tenths}`;
}

/**
 * Binary size in `B` / `KB` / `MB` (1024-based), one decimal when it carries
 * information. Returns `null` for anything that is not a usable byte count, so
 * the caller falls back to neutral copy instead of printing a raw value.
 */
export function formatBinarySize(byteSize: unknown): string | null {
  if (typeof byteSize !== 'number' || !Number.isFinite(byteSize) || byteSize < 0) {
    return null;
  }
  if (byteSize < BYTES_PER_KB) {
    return `${Math.round(byteSize)} ${ASSET_COPY.identity.unitBytes}`;
  }
  if (byteSize < BYTES_PER_MB) {
    return `${formatDecimal(byteSize / BYTES_PER_KB)} ${ASSET_COPY.identity.unitKilobytes}`;
  }
  return `${formatDecimal(byteSize / BYTES_PER_MB)} ${ASSET_COPY.identity.unitMegabytes}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * `dd/MM/yyyy, HH:mm` in the viewer's local time. Returns `null` for a missing
 * or unparseable timestamp rather than echoing the server string.
 */
export function formatAssetTimestamp(createdAt: unknown): string | null {
  if (typeof createdAt !== 'string' || createdAt === '') {
    return null;
  }
  const parsed = new Date(createdAt);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) {
    return null;
  }
  const date = `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  return `${date}, ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

/**
 * The approved secondary line `{size} · {createdAt}`. When only one part is
 * usable it is shown alone; when neither is, bounded neutral copy is returned.
 */
export function buildAssetMetaLine(byteSize: unknown, createdAt: unknown): string {
  const parts = [formatBinarySize(byteSize), formatAssetTimestamp(createdAt)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? ASSET_COPY.identity.metaUnavailable : parts.join(' · ');
}
