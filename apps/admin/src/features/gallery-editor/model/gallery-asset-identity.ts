/**
 * How one image is named to an operator when its bytes are not what identifies
 * it.
 *
 * `APP2-B01` stores no original filename, and neither does `APP11-B03A`'s copy,
 * so there is none to show and none is invented. What the contract does publish
 * is a media type, a byte size and a creation instant — which is enough to tell
 * two tiles apart in a picker and to caption a row.
 *
 * The asset's UUID is never rendered as a label. It is a render key and a
 * request parameter, and putting it on screen would be an internal identifier
 * presented as if it meant something to the person reading it.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `mediaTypeLabels`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const mediaTypeLabelsMessage = messageView(VI_MESSAGES.admin, 'mediaTypeLabels');

/** The label both applications use for a value the server did not classify. */
const commonMessage = messageView(VI_MESSAGES.common);

const MEDIA_TYPE_LABELS: Readonly<Record<string, string>> = {
  'image/png': mediaTypeLabelsMessage.text('image/png'),
  'image/jpeg': mediaTypeLabelsMessage.text('image/jpeg'),
  'image/webp': mediaTypeLabelsMessage.text('image/webp'),
};

/** The neutral label for a media type this build has no name for. */
export const UNKNOWN_MEDIA_TYPE_LABEL = commonMessage.text('value.unknownImage');

export function resolveAssetTitle(mediaType: string): string {
  return MEDIA_TYPE_LABELS[mediaType] ?? UNKNOWN_MEDIA_TYPE_LABEL;
}

const BYTES_PER_KILOBYTE = 1024;

/**
 * A rounded size in the largest unit that keeps the number legible. Not a
 * precise figure — the operator is distinguishing tiles, not auditing storage.
 */
export function formatAssetSize(byteSize: number): string {
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return '';
  }
  const kilobytes = byteSize / BYTES_PER_KILOBYTE;
  if (kilobytes < BYTES_PER_KILOBYTE) {
    return `${String(Math.max(1, Math.round(kilobytes)))} KB`;
  }
  return `${(kilobytes / BYTES_PER_KILOBYTE).toFixed(1)} MB`;
}

/**
 * A calendar date in the operator's locale-independent, unambiguous form.
 *
 * Formatted from the parts rather than through `toLocaleDateString`, whose
 * output depends on the runtime's locale data and would differ between a
 * server render, a browser and a test.
 */
export function formatAssetDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${String(parsed.getFullYear())}`;
}

/** `{size} · {date}`, collapsing gracefully when either part is unavailable. */
export function buildAssetMetaLine(byteSize: number, createdAt: string): string {
  return [formatAssetSize(byteSize), formatAssetDate(createdAt)]
    .filter((part) => part !== '')
    .join(' · ');
}
