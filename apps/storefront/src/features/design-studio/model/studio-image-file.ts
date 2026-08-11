/**
 * What the file picker will offer, and what it refuses before a request
 * (`APP3-S06` §17).
 *
 * ## This is an affordance, not an authority
 *
 * `APP3-B06B` decides what may actually be uploaded, and it decides it from the
 * *bytes*: the declared type must match the file signature, and a `.png` that is
 * really a GIF is refused there no matter what this file says. Nothing here may
 * be read as "the file is safe" — passing these checks means only that the
 * request is worth making. The server's refusal is the answer, and the UI states
 * whatever the server said rather than what it predicted.
 *
 * What the checks *are* for is not wasting a customer's upload: sending 10 MB
 * over a phone connection to be told the format is wrong is a worse experience
 * than being told before it starts.
 *
 * ## Why the values are declared here
 *
 * They mirror the published contract, and the mirror is enforced mechanically —
 * `tools/check-app3-s06.mjs` reads the generated client and fails when these
 * numbers and types stop matching the operation the server publishes. They are
 * restated rather than imported because the authority lives in the API
 * application, which the Storefront must not import from, and because adding a
 * workspace dependency to reach it is outside this checkpoint's file policy.
 *
 * SVG is absent and its absence is load-bearing: `IMP-D044` PO-04 authorizes SVG
 * for Template artwork only, and `APP3-B06B` refuses it at intake for a Session.
 * GIF is absent because animation is refused by the decode policy. Neither is
 * "not yet supported" — offering either would promise a capability the server
 * will always refuse.
 */

/** The three types `APP3-B06B` accepts. Mirrors the published contract. */
export const UPLOADABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type UploadableImageType = (typeof UPLOADABLE_IMAGE_TYPES)[number];

/** Human labels, for the hint. Never used to decide anything. */
export const UPLOADABLE_IMAGE_LABELS = ['PNG', 'JPEG', 'WebP'] as const;

/** The `accept` attribute, built from the list so the two cannot disagree. */
export const UPLOADABLE_IMAGE_ACCEPT = UPLOADABLE_IMAGE_TYPES.join(',');

/** `APP3-B06B`'s streaming ceiling, in bytes. Mirrors the published contract. */
export const MAX_IMAGE_BYTES = 10_485_760;

/** Why a chosen file will not be sent. `null` means it will. */
export type ImageFileRefusal = 'type' | 'size';

export function isUploadableImageType(value: string): value is UploadableImageType {
  return (UPLOADABLE_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Rules on a chosen file.
 *
 * The type is read from the `File` object, which is the browser's own sniff of
 * the extension — deliberately *not* trusted as a fact about the bytes. An empty
 * `type` is refused rather than sent optimistically: a request the server is
 * certain to refuse for a missing declared type is a wasted upload.
 */
export function ruleOnImageFile(file: File): ImageFileRefusal | null {
  if (!isUploadableImageType(file.type)) return 'type';
  // `> 0` is not asserted here: a zero-byte file has a valid type and the server
  // is the one that decides an empty upload, with a message this cannot predict.
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return null;
}
