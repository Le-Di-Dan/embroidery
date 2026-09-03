/**
 * What a transfer image may be, what it is called on **this** route, and what it
 * is never allowed to mean (`APP12-S03` §21, §22, §23; `910:330`…`910:334`).
 *
 * ## The route is deposit-named; the words are not
 *
 * `APP12-B04` reused `APP7-B05` rather than publishing a second evidence
 * endpoint: the evidence authorizer accepts a Ready-Made `FULL` attempt, so
 * these calls travel operations whose paths still read
 * `/public/orders/deposit/evidence`. §21 forbids adding an evidence endpoint
 * and none is added. §4 draws the line at the screen: that wording is
 * **transport**, and nothing this feature renders may repeat it. The customer
 * reads *ảnh xác nhận chuyển khoản*, never *ảnh đặt cọc* — a Ready-Made order
 * has no deposit at all (`BR-029`).
 *
 * ## The limits are the contract's, restated once
 *
 * `APP7-B05` accepts PNG, JPEG and WebP at most 10 MiB each, at most five per
 * attempt, append-only. `917:419`/`917:420` classifies payment evidence
 * `REUSE_AS_IS` — *cùng ô tải ảnh, cùng giới hạn* — so this lane inherits those
 * exact numbers rather than declaring its own.
 *
 * The mock tile at `910:334` prints *(tối đa 3)*. That literal and the reuse
 * directive beside it disagree, and the directive wins: the server counts rows
 * under a lock and refuses the sixth, so a tile promising three would
 * under-report a limit the customer actually has, and no server behaviour
 * changes to match it either way. Recorded as `FU-APP12-S03-02` rather than
 * resolved by redrawing.
 *
 * The three constants exist so the *UI* can be honest before a 10 MiB upload
 * leaves the browser — the file input's `accept`, the constraint line the
 * customer reads, and the guard on the change handler all read the same values.
 * They are **not** the authority: the server measures the size itself, checks
 * the file signature against the declared type and counts the rows, and its
 * refusal is what decides. A client guard that disagreed would only ever be
 * over-strict, which is why nothing here relaxes a rule and the filename
 * extension is never consulted.
 *
 * ## Why there is no delete, replace or preview
 *
 * There is no operation for any of them, and §21 keeps evidence append-only.
 * The customer status operation returns `evidenceId`, `assetStatus`,
 * `mediaType`, `byteSize` and `createdAt` and nothing else — no URL, no bytes.
 * So the customer list is metadata, and a preview button would be a control
 * with no endpoint behind it.
 *
 * ## And none of the four states says anything about the payment (§22)
 *
 * `ACCEPTED` means the image is usable for reconciliation. `REJECTED` means the
 * file is not — terminal for that image, and it changes nothing about the
 * transfer, the obligation or the order. The tones below are the *image's*.
 */
import {
  TransferEvidenceItemResponseAssetStatus,
  type TransferEvidenceItemResponse,
} from '@embroidery/api-client';

/** `APP7-G01` §7.2 — five per attempt, and a retry opens a new attempt. */
export const MAX_EVIDENCE_PER_ATTEMPT = 5;

/** 10 MiB, spelled the way `APP7-B05` measures it. */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

/**
 * The three accepted media types, as the contract names them.
 *
 * Used for the `accept` attribute and for the pre-flight guard. SVG, GIF, HEIC
 * and PDF are absent because the server refuses them, not because this list
 * happens to omit them.
 */
export const EVIDENCE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** How an image's status is drawn: symbol, label and tone, never colour alone. */
export type EvidenceTone = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/**
 * `UPLOADED` and `INSPECTING` share a tone on purpose.
 *
 * The contract publishes four values and `UPLOADED` precedes `INSPECTING`, but
 * the customer-visible difference is nil: in both, a file has been received and
 * a machine is looking at it. Inventing a fourth label for a distinction the
 * product does not have is the mistake this avoids.
 */
const TONES: Readonly<Record<TransferEvidenceItemResponse['assetStatus'], EvidenceTone>> = {
  [TransferEvidenceItemResponseAssetStatus.UPLOADED]: 'PENDING',
  [TransferEvidenceItemResponseAssetStatus.INSPECTING]: 'PENDING',
  [TransferEvidenceItemResponseAssetStatus.ACCEPTED]: 'ACCEPTED',
  [TransferEvidenceItemResponseAssetStatus.REJECTED]: 'REJECTED',
};

export function evidenceToneOf(status: TransferEvidenceItemResponse['assetStatus']): EvidenceTone {
  return TONES[status] ?? 'PENDING';
}

/**
 * Why a chosen file cannot be sent, decided before any byte leaves the browser.
 *
 * `undefined` means "nothing this client can tell is wrong with it", which is
 * not the same as "the server will accept it" — the signature check, the exact
 * byte count and the quota are all decided there.
 */
export type LocalFileRefusal = 'MEDIA_UNSUPPORTED' | 'TOO_LARGE';

export function localFileRefusal(file: File): LocalFileRefusal | undefined {
  // The browser's own sniffed type, not the extension. An extension is a naming
  // convention and a customer can rename anything; the server settles it against
  // the file signature regardless, and this only spares an obvious round trip.
  if (!(EVIDENCE_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return 'MEDIA_UNSUPPORTED';
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return 'TOO_LARGE';
  }
  return undefined;
}
