/**
 * The `APP5-B03` response, narrowed into exactly what `661:*` draws.
 *
 * ### Why there is a projection at all
 *
 * Two reasons, and both are about what the components must not be able to see.
 *
 * **Identifiers do not survive it.** B03 returns `requestId`, and the catalog
 * subject returns `productId` / `productVariantId`; no approved frame draws
 * any of them, they are of no use to a customer, and printing one would invite
 * a "look it up" surface that `G01 §5` exists to forbid — the human code is the
 * only identifier this page shows, and it opens nothing. The same goes for
 * `assetId`: `661:39`–`661:47` draw a labelled tile, not a link, and APP5
 * publishes no customer-facing binary delivery. Dropping the fields here means
 * a component *cannot* render them, rather than merely not doing so today.
 *
 * **The generated types are unusable as they stand.** Every nullable string in
 * the contract — `productName`, `variantColorName`, `customerVisibleReason`,
 * `sizeLabel`, the two millimetre columns — reaches Orval as
 * `{ [key: string]: unknown } | null` rather than `string | null`, because the
 * decorator that published it named no `type` (the same defect `APP5-B07` hit
 * and documented). The generated artifact may not be hand-edited and this
 * checkpoint may not regenerate it, so the narrowing happens once, here, at the
 * boundary — a `typeof value === 'string'` guard is also the honest runtime
 * check for a field the server is entitled to omit.
 */
import type {
  CatalogRequestSubjectResponse,
  CustomRequestStatusResponse,
  CustomerOwnedRequestSubjectResponse,
} from '@embroidery/api-client';
import {
  CatalogRequestSubjectResponseKind,
  RequestAssetResponseRole,
} from '@embroidery/api-client';

import { CUSTOM_REQUEST_STATUS_COPY as COPY } from './custom-request-status-copy';

/** One label/value pair in the frozen-submission table (`661:30` … `661:37`). */
export interface SubjectRow {
  readonly label: string;
  readonly value: string;
}

/** One quantity line, already rendered as the frame writes it (`661:37`). */
export interface QuantityLine {
  readonly text: string;
}

/** One attachment tile — its role and nothing else (`661:39` … `661:47`). */
export interface AssetTile {
  readonly label: string;
}

export interface RequestStatusView {
  /** The human code. Display only; it opens nothing and B03 does not accept it. */
  readonly code: string;
  readonly status: string;
  /** Already formatted for display — `661:12`. */
  readonly submittedAt: string;
  /** Already formatted for display — `661:8`. */
  readonly accessExpiresAt: string;
  readonly subjectRows: readonly SubjectRow[];
  readonly quantityLines: readonly QuantityLine[];
  readonly totalQuantity: number;
  readonly assets: readonly AssetTile[];
  /** The workshop's message to this customer, when one was written (§12). */
  readonly customerVisibleReason: string | undefined;
}

/**
 * The one place a nullable contract field becomes a string.
 *
 * An empty string is treated as absent: the frames have no state for a blank
 * value, and a label with nothing after it reads as a failure to load.
 */
function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * `120.00` → `120`. The millimetre columns are `numeric` and are sent as
 * decimal strings so no float ever rounds them; `661:35` draws `120 × 80 mm`,
 * so the trailing zeros of an exact value are dropped for reading and nothing
 * else is touched.
 */
function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/**
 * Vietnamese, in the workshop's own timezone.
 *
 * Fixed rather than left to the reader's locale: `661:12` and `661:8` are drawn
 * as `16/08/2026 · 10:24` and `23/08/2026`, and "gửi lúc" means the moment the
 * workshop recorded, which is the same instant for the customer and the staff
 * member discussing it over the phone.
 */
const DISPLAY_LOCALE = 'vi-VN';
const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  return `${formatDate(iso)} · ${time}`;
}

const { rows, missingValue, assetRoles } = COPY.subject;

function catalogRows(subject: CatalogRequestSubjectResponse): SubjectRow[] {
  // `productSlug` is deliberately unused. Linking to the store product would
  // make the request unreadable the day that product is unpublished, and the
  // request is a record of what was submitted, not a live catalog entry.
  return [
    { label: rows.kind, value: rows.catalog },
    { label: rows.productName, value: optionalText(subject.productName) ?? missingValue },
    { label: rows.variantColorName, value: optionalText(subject.variantColorName) ?? missingValue },
    { label: rows.variantSizeLabel, value: optionalText(subject.variantSizeLabel) ?? missingValue },
  ];
}

function customerOwnedRows(subject: CustomerOwnedRequestSubjectResponse): SubjectRow[] {
  const collected: SubjectRow[] = [
    { label: rows.kind, value: rows.customerOwned },
    { label: rows.itemName, value: subject.name },
  ];
  const description = optionalText(subject.description);
  if (description !== undefined) {
    collected.push({ label: rows.itemDescription, value: description });
  }
  const width = optionalText(subject.physicalWidthMm);
  const height = optionalText(subject.physicalHeightMm);
  if (width !== undefined && height !== undefined) {
    collected.push({
      label: rows.dimensions,
      value: `${trimDecimal(width)} × ${trimDecimal(height)} mm`,
    });
  }
  return collected;
}

/**
 * `subject` is a union with one discriminant and may be absent entirely, which
 * is a truthful answer the frames can render: the quantity, the attachments and
 * the state all remain readable without it.
 */
function subjectRowsOf(subject: CustomRequestStatusResponse['subject']): SubjectRow[] {
  if (subject === undefined || subject === null) return [];
  return subject.kind === CatalogRequestSubjectResponseKind.CATALOG
    ? catalogRows(subject)
    : customerOwnedRows(subject);
}

/**
 * Quantity is rendered line by line exactly as it was submitted.
 *
 * No line is merged, split or inferred into a second request variant (§11): a
 * request has one subject, and these are the sizes it was ordered in.
 * `productVariantId` never reaches the screen — it is an identifier, and on a
 * customer-owned line it is null by construction anyway.
 */
function quantityLinesOf(lines: CustomRequestStatusResponse['quantities']): QuantityLine[] {
  return lines.map((line) => {
    const sizeLabel = optionalText(line.sizeLabel);
    return {
      text: sizeLabel === undefined ? `× ${line.quantity}` : `${sizeLabel} × ${line.quantity}`,
    };
  });
}

function assetTilesOf(assets: CustomRequestStatusResponse['assets']): AssetTile[] {
  return assets.map((asset) => ({
    label:
      asset.role === RequestAssetResponseRole.COP_IMAGE
        ? assetRoles.copImage
        : assetRoles.reference,
  }));
}

export function projectRequestStatus(response: CustomRequestStatusResponse): RequestStatusView {
  return {
    code: response.code,
    status: response.status,
    submittedAt: formatDateTime(response.submittedAt),
    accessExpiresAt: formatDate(response.accessExpiresAt),
    subjectRows: subjectRowsOf(response.subject),
    quantityLines: quantityLinesOf(response.quantities),
    totalQuantity: response.totalQuantity,
    assets: assetTilesOf(response.assets),
    customerVisibleReason: optionalText(response.customerVisibleReason),
  };
}
