/**
 * What a committed Design Version send reports (`APP6-B09` §18).
 *
 * Persisted facts about the exact version that was frozen, and nothing more.
 *
 * The **document is absent**, and so is everything that would let a caller reach
 * one: no storage key, no derivative id, no preview hash, no grant, no token, no
 * customer identity, no Approval Snapshot and no agreement. `APP6-B07` is the
 * source read and `APP6-B10` owns the customer surface; an Admin send response
 * that shipped the artwork back would make this operation a second, unguarded
 * document read.
 *
 * `documentHash` **is** here, and it is the one thing B09 adds to the world that
 * later checkpoints bind to: `GRD-007` matches an approval against exactly this
 * value, so the operator who commanded the send can see it.
 *
 * `requestStatus` is a **reported** state, never an input — there is no request
 * body on this operation at all — and `requestTransitioned` distinguishes the
 * first review send from a revision send that left an already-`DESIGN_REVIEW`
 * request exactly where it was.
 */
import type {
  DesignCaseId,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';

export interface DesignVersionSentView {
  readonly requestId: string;
  readonly designCaseId: DesignCaseId;
  readonly versionId: DesignVersionId;
  readonly version: number;
  /** Always `SENT_FOR_REVIEW` on both the new-send and the replay path. */
  readonly versionStatus: string;
  readonly requestStatus: string;
  /** True only when this send projected `TR-LC11-08`. */
  readonly requestTransitioned: boolean;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly documentSchemaVersion: number;
  /** `sha256:<64 hex>` over the canonical bytes of the persisted document. */
  readonly documentHash: string;
  readonly sentAt: Date;
  /** The `TR-LC08-05` predecessors this call marked; empty on a replay. */
  readonly supersededVersionIds: readonly DesignVersionId[];
  /** True when the version was already the active review and nothing was written. */
  readonly replayed: boolean;
}
