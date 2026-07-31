/**
 * AGG-08 Asset persistence contract (TBL-022..TBL-024).
 *
 * The database stores **metadata and a storage reference only** — never the
 * binary, never base64 (`CLAUDE.md` §9, REQ-ASSET-001). `storageKey` is an
 * internal object-storage key, not a URL: no permanent public URL is ever
 * stored as authority (`BACKEND_CONVENTIONS.md` §9/§14).
 *
 * Deletion is a **tombstone**, not a row removal: the metadata survives so
 * audit and retention can still see what existed (INV-09/10).
 */
import type {
  AssetClassification,
  AssetDerivativeKind,
  AssetDerivativeState,
  AssetInspectionOutcome,
  AssetKind,
  AssetState,
} from '@embroidery/database';

export type AssetId = string & { readonly __brand: 'AssetId' };
export type AssetDerivativeId = string & { readonly __brand: 'AssetDerivativeId' };

export interface Asset {
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly classification: AssetClassification;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  readonly checksum: string | undefined;
  readonly status: AssetState;
  readonly deletedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AssetDerivative {
  readonly id: AssetDerivativeId;
  readonly assetId: AssetId;
  readonly kind: AssetDerivativeKind;
  readonly status: AssetDerivativeState;
  readonly storageKey: string | undefined;
  readonly isWatermarked: boolean;
}

export interface AssetInspection {
  readonly assetId: AssetId;
  readonly outcome: AssetInspectionOutcome;
  readonly detail: string | undefined;
  readonly inspectedAt: Date;
}

export interface RegisterAssetInput {
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly classification: AssetClassification;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  /** `sha256:<64 hex>` — the schema's CHECK enforces the shape. */
  readonly checksum?: string | undefined;
  readonly uploadedByCustomerId?: string | undefined;
}

export interface RegisterDerivativeInput {
  readonly id: AssetDerivativeId;
  readonly assetId: AssetId;
  readonly kind: AssetDerivativeKind;
  readonly isWatermarked: boolean;
}

/** The outcome of the idempotent Tx A insert (`ADR-APP2-001` §4.2f-5). */
export interface RecoveredAsset {
  readonly asset: Asset;
  /** True when the row already existed — a crash-retry, not a first write. */
  readonly recovered: boolean;
}

/** The bounded, intake-scoped listing filter for the Admin asset list. */
export interface AssetListFilter {
  readonly kind: AssetKind;
  readonly classification: AssetClassification;
  readonly status?: AssetState | undefined;
  readonly mimeType?: string | undefined;
}

export interface AssetListQuery {
  readonly filter: AssetListFilter;
  /** Decoded keyset position; absent for the first page. */
  readonly after?: { readonly createdAt: Date; readonly id: string } | undefined;
  /** Already clamped by the caller; the repository fetches `limit + 1`. */
  readonly limit: number;
}

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');

export interface AssetRepository {
  /** @requiresTransaction */
  register(input: RegisterAssetInput): Promise<Asset>;

  /**
   * The Tx A write: inserts the allocated asset id, or returns the row a
   * previous attempt already committed under the same id.
   *
   * Idempotent by the primary key rather than by a read-then-write check, so
   * two attempts racing after the same allocation converge on one row instead
   * of one of them failing with a duplicate-key error.
   *
   * @requiresTransaction
   */
  registerOrRecover(input: RegisterAssetInput): Promise<RecoveredAsset>;

  /**
   * The Tx B transition, guarded on the from-state.
   *
   * Returns `undefined` when no `UPLOADED` row matched, so the caller can tell
   * "already transitioned" from "does not exist" without a second read.
   *
   * @requiresTransaction
   */
  beginInspection(id: AssetId, at: Date): Promise<Asset | undefined>;

  /** Scoped read for the Admin detail endpoint; kind/classification must match. */
  findScoped(
    id: AssetId,
    filter: Pick<AssetListFilter, 'kind' | 'classification'>,
  ): Promise<Asset | undefined>;

  /** Scoped keyset page, ordered `created_at DESC, id DESC`. Fetches `limit + 1`. */
  listScoped(query: AssetListQuery): Promise<Asset[]>;

  /**
   * Batch scoped read that **locks** the matched rows for the rest of the
   * transaction (`FOR SHARE`).
   *
   * One statement for the whole selection, so a caller validating N assets
   * makes one round trip rather than N. The share lock is the point: a consumer
   * that associates these assets with something else must be able to rely on
   * their eligibility still holding at commit, and a plain read at
   * `READ COMMITTED` cannot promise that — a concurrent transition out of
   * `ACCEPTED` could commit in between. `FOR SHARE` blocks that transition
   * until this transaction ends, while leaving other readers unblocked.
   *
   * Returns only rows inside the requested kind/classification scope; an id
   * outside it is simply absent, exactly as `findScoped` reports it, so the
   * caller cannot use this to discover that a private asset exists.
   *
   * @requiresTransaction
   */
  lockScopedByIds(
    ids: readonly AssetId[],
    filter: Pick<AssetListFilter, 'kind' | 'classification'>,
  ): Promise<Asset[]>;

  /**
   * Appends an inspection outcome and moves the asset to the matching state.
   *
   * @requiresTransaction — the evidence and the state it justifies must land
   * together, or the asset's status would have no record behind it.
   */
  recordInspection(
    assetId: AssetId,
    outcome: AssetInspectionOutcome,
    detail: string | undefined,
    at: Date,
  ): Promise<Asset>;

  /** @requiresTransaction */
  registerDerivative(input: RegisterDerivativeInput): Promise<AssetDerivative>;

  /** @requiresTransaction */
  completeDerivative(
    id: AssetDerivativeId,
    storageKey: string,
    checksum: string | undefined,
  ): Promise<AssetDerivative>;

  /** @requiresTransaction */
  failDerivative(id: AssetDerivativeId): Promise<void>;

  /**
   * Tombstones the asset: status becomes DELETED and the instant is stamped,
   * but the metadata row remains.
   *
   * @requiresTransaction
   */
  tombstone(id: AssetId, reason: string, at: Date): Promise<Asset>;

  findById(id: AssetId): Promise<Asset | undefined>;
  findByStorageKey(storageKey: string): Promise<Asset | undefined>;

  /** Live derivatives only — a tombstoned asset's derivatives are not serveable. */
  listDerivatives(assetId: AssetId): Promise<AssetDerivative[]>;
  listInspections(assetId: AssetId): Promise<AssetInspection[]>;
}
