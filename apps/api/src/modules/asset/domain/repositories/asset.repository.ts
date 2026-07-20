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

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');

export interface AssetRepository {
  /** @requiresTransaction */
  register(input: RegisterAssetInput): Promise<Asset>;

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
