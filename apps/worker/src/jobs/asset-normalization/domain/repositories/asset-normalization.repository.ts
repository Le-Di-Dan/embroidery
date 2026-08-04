/**
 * The worker-local normalization persistence contract (`APP3-W01A`).
 *
 * Deliberately **not** the inspection repository. That one owns an Asset's
 * lifecycle — `INSPECTING → ACCEPTED/REJECTED` plus the two catalogue
 * derivatives — and normalization owns none of that: the Asset is already
 * `ACCEPTED` when a normalization event exists at all, and this checkpoint must
 * never move an Asset's status or touch a `THUMBNAIL` or `CATALOG_PREVIEW` row.
 * Sharing one contract would have made both of those a one-line mistake away.
 *
 * Four methods, each a complete durable step. Every one runs inside a
 * transaction the *use case* opened (DEC-DB7-006).
 */

export const ASSET_NORMALIZATION_REPOSITORY = Symbol('ASSET_NORMALIZATION_REPOSITORY');

/** The immutable source facts every later step re-checks against. */
export interface NormalizationSourceFacts {
  readonly assetId: string;
  readonly storageKey: string;
  readonly mediaType: string;
  readonly byteSize: bigint;
  readonly checksum: string | null;
  readonly status: string;
  readonly kind: string;
  readonly classification: string;
  readonly deleted: boolean;
}

/**
 * What the referenced association proves, or `undefined` when it proves nothing.
 *
 * `assetId` is the association's **own** view of which Asset it points at. The
 * use case compares it with the payload rather than trusting either alone: an
 * association that has since been re-pointed is exactly the stale context
 * `IMP-D046` PO-09 refuses, and reading only one side could not detect it.
 */
export interface AssociationFacts {
  readonly assetId: string;
  /** False once the owning row is retired, archived or otherwise not current. */
  readonly active: boolean;
}

/** The existing NORMALIZED row for an Asset, if any. */
export interface NormalizedDerivativeState {
  readonly id: string;
  readonly status: string;
  readonly storageKey: string | null;
  readonly isWatermarked: boolean;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly mediaType: string | null;
  readonly byteSize: bigint | null;
}

/**
 * What the preparation transaction decided.
 *
 * `PROCESS` means a `PROCESSING` NORMALIZED row is durably claimed by this
 * attempt and external work may begin. `REPLAY_READY` means an authoritative
 * result already exists — which satisfies the request only after the use case
 * has re-validated the triggering association, never on its own (PO-08).
 */
export type PreparedNormalization =
  | {
      readonly kind: 'PROCESS';
      readonly source: NormalizationSourceFacts;
      readonly requiresCleanup: boolean;
    }
  | { readonly kind: 'REPLAY_READY'; readonly storageKey: string };

export interface PrepareNormalizationInput {
  readonly assetId: string;
  readonly expectedKey: string;
  readonly at: Date;
}

export interface FinalizeNormalizedInput {
  readonly assetId: string;
  readonly storageKey: string;
  readonly checksum: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly mediaType: string;
  readonly byteSize: bigint;
  readonly at: Date;
}

export interface AssetNormalizationRepository {
  /**
   * Loads the source Asset, or `undefined` when it does not exist.
   *
   * Read outside the preparation transaction so a context rejection costs one
   * statement and writes nothing at all.
   */
  findSource(assetId: string): Promise<NormalizationSourceFacts | undefined>;

  /** The association's own facts, by kind and id. Never a scan by Asset. */
  findAssociation(
    kind: 'PRODUCT_SIDE_BACKGROUND' | 'DESIGN_TEMPLATE_ASSET' | 'DESIGN_SESSION_ASSET',
    associationId: string,
  ): Promise<AssociationFacts | undefined>;

  /**
   * The durable preparation step: lock the Asset, and either claim a
   * `PROCESSING` NORMALIZED row or report the verified existing result.
   *
   * @requiresTransaction
   */
  prepareOrRecover(input: PrepareNormalizationInput): Promise<PreparedNormalization>;

  /**
   * One statement that makes the derivative usable: storage identity, `READY`
   * and all four canonical metadata fields together.
   *
   * All-or-none is the point (IMP-D044 PO-12). A `READY NORMALIZED` row with a
   * partial quartet is refused by `ck_asset_derivatives__ready_normalized_metadata`
   * anyway, but writing it in two statements would make that CHECK the thing
   * that discovers the bug rather than the thing that proves it cannot happen.
   *
   * @requiresTransaction
   */
  finalizeReady(input: FinalizeNormalizedInput): Promise<void>;

  /**
   * Marks this attempt's claimed row `FAILED`, releasing the partial unique
   * index so a later attempt may claim a fresh one.
   *
   * @requiresTransaction
   */
  failClaim(assetId: string, at: Date): Promise<void>;

  /** The current NORMALIZED row, for verification and diagnosis. */
  findNormalized(assetId: string): Promise<NormalizedDerivativeState | undefined>;
}
