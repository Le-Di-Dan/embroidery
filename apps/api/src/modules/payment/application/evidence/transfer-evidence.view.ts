/**
 * What a customer is told about their own transfer evidence (`APP7-B05` §18,
 * §27).
 *
 * ### The redaction is the point
 *
 * The stored idempotency record carries the bucket alias, the object key, the
 * checksum and the content fingerprint, because a replay needs them. **None** of
 * those reaches a client, and neither does a scanner detail, an inspection
 * reason, a grant id, a step-up challenge id, a customer id, an admin id, an
 * obligation id, an order id, a reconciliation fact or a provider field. There
 * is nowhere in either type to put one, so a column added later cannot reach a
 * browser without an edit here.
 *
 * ### The locator is the association, not the asset
 *
 * `evidenceId` is `payment_transfer_evidence.id`. The asset id is deliberately
 * absent: nothing a customer can do with it exists — `APP7-B05` adds no binary
 * read, and `APP7-B06`'s Admin preview will re-prove the association anyway — so
 * publishing it would be an identifier handed out for no operation.
 *
 * ### The status never claims more than has happened
 *
 * `assetStatus` is the projection of the real LC-06 state at the instant of the
 * read. The upload response is written **before** the inspector has run, so it
 * reports `INSPECTING` and says so; it never says `ACCEPTED`, `verified` or
 * `paid`, none of which an upload can establish. A `REJECTED` image is a
 * rejected image, not a failed payment: nothing in either type describes a
 * payment state, and nothing in this checkpoint changes one.
 */
import type { TransferEvidenceAssociation } from '@embroidery/persistence';

import type { Asset } from '../../../asset/domain/repositories/asset.repository';

/** The four LC-06 states a customer is entitled to distinguish. */
export type TransferEvidenceStatus = 'UPLOADED' | 'INSPECTING' | 'ACCEPTED' | 'REJECTED';

/**
 * `DELETION_PENDING` and `DELETED` are deliberately absent from the public
 * vocabulary, exactly as `APP5-B02`'s status read decides it: an asset in either
 * state is being removed, and the only question the answer drives is "is this
 * image still standing as evidence?" — for both, the answer is no.
 */
const PUBLIC_STATUS: Readonly<Record<string, TransferEvidenceStatus>> = {
  UPLOADED: 'UPLOADED',
  INSPECTING: 'INSPECTING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  DELETION_PENDING: 'REJECTED',
  DELETED: 'REJECTED',
};

export interface TransferEvidenceItemView {
  /** `payment_transfer_evidence.id`. Never an authorization input. */
  readonly evidenceId: string;
  readonly assetStatus: TransferEvidenceStatus;
  readonly mediaType: string;
  /** Server-measured at intake. Never the value a client declared. */
  readonly byteSize: number;
  readonly createdAt: Date;
}

/** Bounded at five by `MAX_EVIDENCE_PER_ATTEMPT`, so there is no page cursor. */
export interface TransferEvidenceListView {
  readonly evidence: readonly TransferEvidenceItemView[];
}

/** What one upload committed. Durable facts only, and no claim beyond them. */
export interface TransferEvidenceUploadView {
  readonly evidenceId: string;
  /** `INSPECTING`, always: Tx B has just queued it and the inspector has not run. */
  readonly assetStatus: TransferEvidenceStatus;
  readonly mediaType: string;
  readonly byteSize: number;
  /** True when this response replayed an earlier identical upload. */
  readonly replayed: boolean;
}

export function toTransferEvidenceItem(
  association: TransferEvidenceAssociation,
  asset: Asset,
): TransferEvidenceItemView {
  return {
    evidenceId: association.id,
    assetStatus: PUBLIC_STATUS[asset.status] ?? 'REJECTED',
    mediaType: asset.mimeType,
    // `size_bytes` is a `bigint` in the row because the column is one; an image
    // bounded at 10 MiB is far inside the safe integer range, and the ceiling is
    // enforced by the streaming counter long before this.
    byteSize: Number(asset.sizeBytes),
    createdAt: association.createdAt,
  };
}
