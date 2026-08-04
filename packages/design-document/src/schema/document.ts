/**
 * The Design Document root (ADR-DB1-012 §1: this package owns the shape).
 *
 * Exactly three top-level concerns. Anything else — publication state, customer
 * identity, a session secret, a storage key, a private media URL, the watermark,
 * the viewport, the selection, the undo stack — is either authority that lives
 * elsewhere or runtime state that must not survive a save. Unknown root fields
 * fail validation rather than being carried along, because a field that
 * round-trips unvalidated is a field that eventually gets trusted.
 */
import type { DesignElement } from './elements';

/**
 * What the editor was told about the chosen placement when the document was
 * authored.
 *
 * This is **document data, not authority**. Product Side and Embroidery Area
 * rows remain the source of truth, and a later API compares these values with
 * them; `APP3-P01` only proves the values are well-formed positive finite
 * numbers, and `APP3-P02` owns every geometric consequence.
 */
export interface DesignPlacementSnapshot {
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
}

/** Array order is z-order, bottom first, and JCS preserves it (ADR-DB1-012 §7). */
export interface DesignDocument {
  readonly schemaVersion: number;
  readonly placement: DesignPlacementSnapshot;
  readonly elements: readonly DesignElement[];
}
