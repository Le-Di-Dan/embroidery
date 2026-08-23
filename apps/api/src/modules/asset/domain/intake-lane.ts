/**
 * The intake lane — the few values that differ between one upload surface and
 * another (`APP2-B01`, `APP3-B06B` / `IMP-D048` PO-01).
 *
 * Two surfaces now stream bytes into private storage: the Admin catalog upload
 * and the anonymous Design Session upload. Everything that makes streaming
 * intake correct is identical between them — the ordering of claim and stream,
 * the single pass that counts, hashes and verifies, the abort plumbing, the
 * refusal to buffer. What differs is a handful of *values*: which asset kind and
 * classification the row gets, how many bytes are allowed, which idempotency
 * namespace the claim lives in, and whether the body carries the two
 * self-describing metadata fields.
 *
 * Passing those as a lane keeps one implementation. The alternative — a second
 * parser and a second reader for the Session surface — would mean every future
 * fix to backpressure, abort handling or signature checking had to be found and
 * made twice, and the second copy is the one that silently drifts.
 *
 * A lane is data, not policy authority. Each surface owns and declares its own
 * lane next to the rules that justify its values; this module only fixes the
 * shape and the Admin lane that `APP2-B01` already shipped.
 */
import {
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
  MAX_UPLOAD_BYTES,
  UPLOAD_OPERATION_NAMESPACE,
} from './asset-intake.policy';

export interface AssetIntakeLane {
  /** The `ASSET_KINDS` value every row from this surface carries. */
  readonly assetKind: string;
  /** The `ASSET_CLASSIFICATIONS` value. Never client-selectable (INV-09). */
  readonly classification: string;
  /** The authoritative byte ceiling, enforced by the streaming counter. */
  readonly maxUploadBytes: number;
  /** The idempotency namespace claims for this surface are allocated under. */
  readonly operationNamespace: string;
  /**
   * Whether the multipart body carries `assetKind` and `classification` before
   * the file part.
   *
   * The Admin lane does: the body is self-describing, and the parser refuses any
   * value other than the fixed one. The Session lane does not — an anonymous
   * caller has exactly one kind and one classification available to it, so a
   * field whose only legal value is a constant would be a field whose only
   * possible effect is to be filled in wrong.
   */
  readonly declaresMetadataFields: boolean;
  /**
   * Opaque field names this lane requires **before** the file part — all of
   * them, each at most once (`APP7-B05`).
   *
   * The two shipped customer lanes carry their credential outside the body: a
   * challenge in the path, a session in a header. Their bodies are one file part
   * and nothing else, so this is empty for them. The Payment evidence lane
   * cannot follow suit — `ADR-APP4-001` §11 makes the secure-link token a
   * body-only carrier with no path, query or header fallback — so its credential
   * arrives as a multipart field, and it has to arrive *before* the file because
   * it is what authorizes reading a single byte of it.
   *
   * The parser only collects these values and enforces their presence,
   * uniqueness and ordering. It never interprets one: what a field means, and
   * whether it is well formed, belongs to the surface that declared it. That is
   * the difference from {@link declaresMetadataFields}, whose two fields exist to
   * be *refused* unless they restate a constant, not to carry anything.
   */
  readonly credentialFields: readonly string[];
}

/** The lane `APP2-B01` shipped. Unchanged; named so the parser can be shared. */
export const ADMIN_CATALOG_INTAKE_LANE: AssetIntakeLane = Object.freeze({
  assetKind: INTAKE_ASSET_KIND,
  classification: INTAKE_CLASSIFICATION,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  operationNamespace: UPLOAD_OPERATION_NAMESPACE,
  declaresMetadataFields: true,
  credentialFields: [],
});
