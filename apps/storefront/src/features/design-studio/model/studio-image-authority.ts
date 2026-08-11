/**
 * Ruling on a candidate image placement (`APP3-S06` §14, §15, §16).
 *
 * `APP3-S03` set the shape and `APP3-S05` reused it: a candidate is committed
 * exactly as computed or not committed at all, and a refusal is stated in text
 * while the working document stays exactly as it legally was. S06 changes *what*
 * has to be asked, not that rule.
 *
 * Four authorities, in the one order that makes each answer meaningful:
 *
 * 1. **Structure** (`APP3-P01`) — is this a document at all?
 * 2. **Complexity** (`APP3-P01`) — the element ceiling. A transform cannot
 *    change an element count and a text edit cannot either; adding an image is
 *    the first thing in the Studio that can.
 * 3. **Context** (`APP3-P01-C1`) — the image half of `validateDesignDocumentContext`:
 *    the derivative is known, belongs to the named Asset, is a `READY`
 *    editor-safe kind, is completely measured, matches the stored intrinsic
 *    dimensions, is not a second derivative of an Asset already placed through
 *    another, and does not push the design past the decoded-pixel budget.
 * 4. **Geometry** (`APP3-P02`, via `APP3-S03`) — quantization, containment and
 *    physical size, asked in `APP3-S03`'s accepted order.
 *
 * Step 3 is the one S05 deliberately skipped. Its comment said so: calling
 * `validateDesignDocumentContext` with an empty derivative map would refuse a
 * perfectly valid image the customer never touched. S06 is the checkpoint that
 * finally has the authority to fill that map — the `READY` status projection
 * carries the canonical derivative identity and the whole `APP3-DB01` quartet —
 * so the check is asked in full rather than skipped, and the map is built from
 * the *server's* measurements, never from a decoded `<img>`.
 *
 * Nothing here reads `naturalWidth`, calls `getBBox`, measures the DOM or
 * inspects a Blob. `APP3-P02` is the only geometry authority and the derivative
 * metadata is the only intrinsic-size authority; a browser's idea of how big a
 * picture is has no standing over either.
 */
import {
  validateDesignDocumentComplexity,
  validateDesignDocumentContext,
  validateDesignDocumentStructure,
  type DerivativeAuthorityRecord,
  type DesignDocument,
  type DesignDocumentFinding,
} from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import {
  ruleOnCandidate,
  type StudioAreaLimits,
  type TransformRefusal,
} from './studio-transform-authority';

/**
 * One editor-safe image, exactly as the server measured it.
 *
 * Built only from a `READY` status projection. There is no constructor that
 * takes a width from anywhere else, which is what stops a decoded `<img>` or a
 * Blob's size from becoming document authority by accident.
 */
export interface StudioImageMedia {
  readonly assetId: string;
  readonly derivativeId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly mediaType: string;
  readonly byteSize: number;
}

export type ImageRefusal =
  'too-many-elements' | 'ineligible-media' | 'invalid-candidate' | TransformRefusal;

export type ImageOutcome =
  | { readonly ok: true; readonly document: DesignDocument; readonly elementId: string }
  | { readonly ok: false; readonly refusal: ImageRefusal };

/**
 * The derivative map `APP3-P01-C1` compares against, for one image.
 *
 * Deliberately built per candidate rather than accumulated: the only image whose
 * eligibility this checkpoint can prove is the one the server just reported
 * `READY`. Images already in the document were proved eligible when the Session
 * opened (`APP3-B07`) or when they were saved (`APP3-B08`), and re-deriving that
 * here from an empty map would refuse them — which is precisely the trap
 * `APP3-S05` documented and avoided by not calling context validation at all.
 */
function contextFor(
  media: StudioImageMedia,
  document: DesignDocument,
): { readonly derivatives: ReadonlyMap<string, DerivativeAuthorityRecord> } {
  const derivatives = new Map<string, DerivativeAuthorityRecord>();
  for (const record of carriedRecords(document)) derivatives.set(record.derivativeId, record);
  derivatives.set(media.derivativeId, {
    derivativeId: media.derivativeId,
    assetId: media.assetId,
    // The two eligible values, restated from what the server already proved by
    // answering `READY` at all: the status projection reports `READY` only for a
    // `READY`, unwatermarked `NORMALIZED` derivative carrying the whole quartet.
    kind: 'NORMALIZED',
    status: 'READY',
    widthPx: media.widthPx,
    heightPx: media.heightPx,
    mediaType: media.mediaType,
    byteSize: media.byteSize,
  });
  return { derivatives };
}

/**
 * The images the working document already carries, entered at their own values.
 *
 * Their eligibility was proved by the server before they could reach this
 * document — at clone time by `APP3-B07`, or at save time by `APP3-B08`, both
 * against real database authority — and this client holds none, so they are
 * carried forward rather than re-derived or dropped. Entering them cannot widen
 * anything: an image the document does not contain gets no entry, so the map is
 * a function of the document rather than an input to it.
 *
 * Two of the six fields are placeholders and it is worth being exact about which,
 * because a fabricated number that *did* decide something would be a real defect:
 *
 * - `widthPx`/`heightPx` are **not** placeholders. `APP3-P01-C1` requires a
 *   valid document's stored intrinsics to equal its derivative's, so for any
 *   document that ever passed validation these are the canonical values — which
 *   is what keeps the decoded-pixel budget below a real total rather than a
 *   guess.
 * - `mediaType` and `byteSize` are placeholders. `APP3-P01-C1` checks only that
 *   they are present, non-empty and positive, and compares them to nothing here:
 *   no `allowedMediaTypes` is passed, and `byteSize` participates in no rule.
 *   They exist to satisfy a presence check, and neither can change an outcome.
 */
function carriedRecords(document: DesignDocument): readonly DerivativeAuthorityRecord[] {
  const records: DerivativeAuthorityRecord[] = [];
  for (const element of document.elements) {
    if (element.type !== 'image') continue;
    records.push({
      derivativeId: element.derivativeId,
      assetId: element.assetId,
      kind: 'NORMALIZED',
      status: 'READY',
      widthPx: element.intrinsicWidthPx,
      heightPx: element.intrinsicHeightPx,
      mediaType: CARRIED_MEDIA_TYPE,
      byteSize: CARRIED_BYTE_SIZE,
    });
  }
  return records;
}

/** Presence placeholders for already-validated images. See `carriedRecords`. */
const CARRIED_MEDIA_TYPE = 'image/webp';
const CARRIED_BYTE_SIZE = 1;

function contextRefusal(findings: readonly DesignDocumentFinding[]): ImageRefusal {
  return findings.length === 0 ? 'invalid-candidate' : 'ineligible-media';
}

/**
 * Rules on a candidate document carrying one added or replaced image.
 *
 * `elementId` names the image under test so a refusal is about the change the
 * customer made. Nothing is repaired, clamped, scaled down or re-centred on the
 * way through: `IMP-D045` PO-09 forbids every one of those, and a placement
 * quietly adjusted to fit is a placement the customer never chose.
 */
export function ruleOnImageCandidate(
  candidate: DesignDocument,
  elementId: string,
  media: StudioImageMedia,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): ImageOutcome {
  const structure = validateDesignDocumentStructure(candidate);
  if (!structure.ok) return { ok: false, refusal: 'invalid-candidate' };

  const complexity = validateDesignDocumentComplexity(structure.value);
  if (complexity.length > 0) {
    const measure = complexity.find((item) => item.meta?.measure !== undefined)?.meta?.measure;
    return {
      ok: false,
      refusal: measure === 'elements' ? 'too-many-elements' : 'ineligible-media',
    };
  }

  const context = validateDesignDocumentContext(
    structure.value,
    contextFor(media, structure.value),
  );
  if (context.length > 0) return { ok: false, refusal: contextRefusal(context) };

  const geometry = ruleOnCandidate(candidate, elementId, scope, limits);
  if (!geometry.ok) return { ok: false, refusal: geometry.refusal };
  return { ok: true, document: geometry.document, elementId };
}
