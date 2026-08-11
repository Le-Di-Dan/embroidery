/**
 * The worker-local Asset persistence contract (APP2-W01 §19).
 *
 * Deliberately **not** the B01 API repository. That one is shaped for intake —
 * register, reclaim, list, project — and moving it here would drag an HTTP
 * module's concerns into the worker and couple two independently deployed
 * applications to one interface. This contract has five methods, each one a
 * complete durable step of the inspection lifecycle, and nothing else: no
 * generic CRUD, no `findAll`, no cross-module table.
 *
 * Every method runs inside a transaction the *use case* opened (DEC-DB7-006).
 */
import type { AssetDerivativeState } from '@embroidery/database';

import type { AssetInspectionLane } from '../asset-inspection-lane';
import type { CatalogDerivativeKind } from '../asset-processing-policy';
import type { InspectedDerivative, InspectedSource } from '../inspection-detail';
import type { AssetRejectionCode } from '../processing-rejection';

export const ASSET_INSPECTION_REPOSITORY = Symbol('ASSET_INSPECTION_REPOSITORY');

/** The immutable source facts every later step re-checks against. */
export interface AssetSourceFacts {
  readonly assetId: string;
  readonly storageKey: string;
  readonly mediaType: string;
  readonly byteSize: bigint;
  readonly checksum: string | null;
}

export interface DerivativeRowState {
  readonly kind: string;
  readonly status: AssetDerivativeState;
  readonly storageKey: string | null;
  readonly checksum: string | null;
  readonly isWatermarked: boolean;
}

/**
 * What the preparation transaction decided.
 *
 * `PROCESS` means every derivative row **this lane owns** is durably
 * `PROCESSING` and external work may begin — vacuously true, and correct, for
 * the Session lane, which owns none. `requiresCleanup` is true when at least one
 * of them already existed, meaning some earlier attempt may have written bytes
 * this attempt is about to replace.
 *
 * The lane travels with the decision rather than being re-derived by the caller.
 * It was resolved from the row this transaction *locked*, so passing it forward
 * is what keeps the whole attempt bound to one reading of the Asset's identity;
 * asking again outside the lock could answer differently.
 */
export type PreparedWork =
  | {
      readonly kind: 'PROCESS';
      readonly source: AssetSourceFacts;
      readonly lane: AssetInspectionLane;
      readonly requiresCleanup: boolean;
    }
  | { readonly kind: 'REPLAY_ACCEPTED'; readonly derivativeKeys: readonly string[] }
  | { readonly kind: 'REPLAY_REJECTED' };

/** The read-only view the cleanup step verifies before deleting anything. */
export interface ProcessingSnapshot {
  readonly source: AssetSourceFacts;
  readonly status: string;
  readonly derivatives: readonly DerivativeRowState[];
  readonly terminalInspectionCount: number;
}

export interface FinalizeAcceptedInput {
  readonly assetId: string;
  readonly source: AssetSourceFacts;
  readonly detail: string;
  readonly derivatives: readonly (InspectedDerivative & { readonly storageKey: string })[];
  readonly at: Date;
}

export interface FinalizeRejectedInput {
  readonly assetId: string;
  readonly rejectionCode: AssetRejectionCode;
  readonly detail: string;
  readonly at: Date;
}

export interface TerminalEffect {
  readonly status: string;
  readonly outcomes: readonly string[];
  readonly details: readonly (string | null)[];
  readonly derivatives: readonly DerivativeRowState[];
}

export interface PrepareInput {
  readonly assetId: string;
  readonly at: Date;
  /**
   * The deterministic key each derivative must carry.
   *
   * Supplied by the use case because the environment namespace belongs to the
   * storage composition, not to persistence — and verifying a terminal replay
   * against *computed* keys is what makes "the row points at the object this
   * pipeline would have written" a check rather than an assumption.
   *
   * Covers every kind the pipeline can produce, because the lane is not known
   * until the asset row is locked inside the transaction this input opens. Only
   * the lane's own kinds are ever consulted, so the Session lane reads none of
   * them.
   */
  readonly expectedKeys: Readonly<Record<CatalogDerivativeKind, string>>;
}

export interface AssetInspectionRepository {
  /**
   * The durable preparation step: lock, classify, and either prepare both
   * `PROCESSING` rows or report a verified terminal replay.
   *
   * Throws `AssetInspectionContradictionError` for any state that cannot be
   * reconciled; never repairs one.
   */
  prepareOrRecover(input: PrepareInput): Promise<PreparedWork>;

  /** Everything the cleanup and generation steps re-verify against. */
  loadProcessingSnapshot(assetId: string): Promise<ProcessingSnapshot>;

  /** The lane's derivatives `READY`, one ACCEPTED inspection, asset `ACCEPTED`. */
  finalizeAccepted(input: FinalizeAcceptedInput): Promise<void>;

  /** Live derivatives `FAILED`, one REJECTED inspection, asset `REJECTED`. */
  finalizeRejected(input: FinalizeRejectedInput): Promise<void>;

  /** The raw terminal evidence, for replay verification and diagnosis. */
  loadTerminalEffect(assetId: string): Promise<TerminalEffect | undefined>;
}

/** Re-exported so the application layer imports one contract module. */
export type { CatalogDerivativeKind, InspectedDerivative, InspectedSource };
