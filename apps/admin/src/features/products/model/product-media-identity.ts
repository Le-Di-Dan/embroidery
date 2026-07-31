/**
 * Server-backed media identity for the product form (`521:284` — Ảnh sản phẩm).
 *
 * `APP2-B01` neither stores nor returns the source filename, so identity is
 * derived from contract fields alone: the media type becomes the title and
 * `{size} · {createdAt}` becomes the secondary line. No storage key, checksum,
 * `assetId` fragment, inspection detail or worker record is ever an identity
 * source, and no filename is fabricated — the approved frames were corrected
 * away from sample filenames precisely because none exist.
 *
 * Formatting is explicit rather than `Intl`-based: the approved output
 * (`2,4 MB · 27/07/2026, 14:35`) is exact, and `Intl` unit and date output vary
 * by ICU build, so only an explicit formatter can be pinned by tests on every
 * supported runtime.
 *
 * This mirrors the asset-library identity (`APP2-D02` / IMP-D031) deliberately
 * rather than importing it: the two features read different response types and
 * own separate copy catalogs, and a product screen must not depend on the asset
 * screen's wording. Both are pinned by their own tests.
 */
import { PRODUCT_FORM_COPY } from './product-form-copy';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const DECIMAL_SEPARATOR = ',';

/** Titles for the contract's closed media-type set; anything else is unknown. */
const TITLE_BY_MEDIA_TYPE: Readonly<Record<string, string>> = {
  'image/png': PRODUCT_FORM_COPY.identity.titlePng,
  'image/jpeg': PRODUCT_FORM_COPY.identity.titleJpeg,
  'image/webp': PRODUCT_FORM_COPY.identity.titleWebp,
};

/**
 * The rendered media title. An unrecognised or malformed media type falls back
 * to the neutral label — the raw MIME string is never shown as a title.
 */
export function resolveMediaTitle(mediaType: unknown): string {
  if (typeof mediaType !== 'string') {
    return PRODUCT_FORM_COPY.identity.titleUnknown;
  }
  return TITLE_BY_MEDIA_TYPE[mediaType] ?? PRODUCT_FORM_COPY.identity.titleUnknown;
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
export function formatMediaSize(byteSize: unknown): string | null {
  if (typeof byteSize !== 'number' || !Number.isFinite(byteSize) || byteSize < 0) {
    return null;
  }
  if (byteSize < BYTES_PER_KB) {
    return `${Math.round(byteSize)} ${PRODUCT_FORM_COPY.identity.unitBytes}`;
  }
  if (byteSize < BYTES_PER_MB) {
    return `${formatDecimal(byteSize / BYTES_PER_KB)} ${PRODUCT_FORM_COPY.identity.unitKilobytes}`;
  }
  return `${formatDecimal(byteSize / BYTES_PER_MB)} ${PRODUCT_FORM_COPY.identity.unitMegabytes}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * `dd/MM/yyyy, HH:mm` in the viewer's local time. Returns `null` for a missing
 * or unparseable timestamp rather than echoing the server string.
 */
export function formatMediaTimestamp(createdAt: unknown): string | null {
  if (typeof createdAt !== 'string' || createdAt === '') {
    return null;
  }
  const parsed = new Date(createdAt);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  const date = `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  return `${date}, ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

/**
 * The approved secondary line `{size} · {createdAt}`. When only one part is
 * usable it is shown alone; when neither is, bounded neutral copy is returned.
 */
export function buildMediaMetaLine(byteSize: unknown, createdAt: unknown): string {
  const parts = [formatMediaSize(byteSize), formatMediaTimestamp(createdAt)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? PRODUCT_FORM_COPY.identity.metaUnavailable : parts.join(' · ');
}
