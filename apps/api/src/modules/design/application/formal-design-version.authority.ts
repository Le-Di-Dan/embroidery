/**
 * Document validation for a **formal** Design Version (`APP6-B08` §10, §12).
 *
 * `DesignDocumentAuthority` validates what an anonymous customer types into a
 * live Catalog Session. This validates what an authorised operator submits as a
 * formal version, and the two differ in ways that make one class unable to serve
 * both: a formal version may be on the customer-owned-product branch, where
 * there is no Catalog placement to reconcile against at all, and it is pinned to
 * whichever schema version its branch requires rather than to the single Studio
 * one.
 *
 * Nothing geometric or structural is re-implemented here. `APP3-P01` owns
 * structure, schema version, complexity and quantization; `APP3-P02` owns every
 * geometric consequence; this composes them in the order their own contracts
 * require and turns any finding into one bounded refusal.
 *
 * ## What it deliberately does not do
 *
 * It does **not** canonicalize-and-hash the document as B09's review artifact.
 * `prepareDesignDocument` does produce canonical bytes on the way to
 * re-validating after quantization — that is P01's own contract, and the reason a
 * stored document is the *prepared* one rather than the caller's object — but no
 * hash is computed, nothing is frozen, and `document_hash` stays NULL until
 * `TR-LC08-02`. CST-074 permits exactly that for a DRAFT and requires a hash the
 * moment the row leaves it, which is `APP6-B09`'s job.
 */
import { Injectable } from '@nestjs/common';
import {
  BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  prepareDesignDocument,
  readSchemaVersion,
  type DesignDocument,
} from '@embroidery/design-document';
import {
  quantizedEquals,
  validateDocumentWithinEmbroideryArea,
  validatePlacementSnapshot,
  type EmbroideryAreaAuthority,
} from '@embroidery/design-engine';

import { rejectionForFindings, type DocumentRejection } from './design-document.authority';
import type { SessionPlacementAuthority } from './session-placement.authority';

export type FormalDocumentOutcome =
  | { readonly ok: true; readonly document: DesignDocument; readonly schemaVersion: number }
  | { readonly ok: false; readonly rejection: DocumentRejection };

/** The frozen positive embroidery envelope of a customer-owned-product version. */
export interface CustomerOwnedEnvelope {
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
}

@Injectable()
export class FormalDesignVersionAuthority {
  /**
   * A Catalog formal version: the full APP3 reconciliation, unchanged.
   *
   * The document is checked against the **authoritative** Side and Area the
   * server resolved, never against the ids the document happens to carry. A
   * document is data; treating its `productSideId` as proof of which Side it was
   * authored against is how a version ends up frozen onto a placement nobody
   * validated.
   *
   * `HISTORICAL_RENDER` rather than `NEW_EDITING`: the customer already authored
   * this artwork against this placement, and digitizing it is not the moment a
   * placement is *chosen*. A Side retired between submission and digitizing must
   * not strand a quote-accepted request — retirement withdraws a placement from
   * new selection, it does not withdraw work already done on it (PO-11).
   */
  validateCatalog(candidate: unknown, placement: SessionPlacementAuthority): FormalDocumentOutcome {
    const version = readSchemaVersion(candidate);
    // Pinned to the Studio version: a Catalog formal version is authored from
    // what the customer submitted, and that document is v1. Accepting a v2 here
    // would accept one whose placement ids are null — a Catalog version with no
    // Catalog placement, which is the row CST-129 exists to reject.
    if (!version.ok || version.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED' };
    }

    const prepared = prepareDesignDocument(candidate);
    if (!prepared.ok) return { ok: false, rejection: rejectionForFindings(prepared.findings) };
    const document = prepared.value.document;

    const reconciled = validatePlacementSnapshot(
      document.placement,
      placement.side,
      placement.area,
      'HISTORICAL_RENDER',
    );
    if (!reconciled.ok) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }
    if (!validateDocumentWithinEmbroideryArea(document, placement.area).ok) {
      return { ok: false, rejection: 'DOCUMENT_OUT_OF_BOUNDS' };
    }
    return { ok: true, document, schemaVersion: version.value };
  }

  /**
   * A customer-owned-product formal version: containment against the envelope.
   *
   * Four things are checked and each is a rule from `ADR-APP6-001` §3.3/§3.4:
   *
   * 1. the document declares v2 and both placement ids are `null` — a COP
   *    document that names a Catalog Side is claiming an identity the request
   *    does not have, and P01 has already rejected a half-null pair;
   * 2. the document's own physical dimensions equal the version's frozen
   *    envelope, compared **quantized-exact** on both sides, the same rule
   *    `validatePlacementSnapshot` applies to Catalog. Without it the row's
   *    envelope and the document's geometry could disagree about the size of the
   *    thing being stitched;
   * 3. the canvas *is* the envelope, so no element has somewhere legal to sit
   *    that is outside the area to be stitched;
   * 4. every element is contained by that envelope.
   *
   * `validatePlacementSnapshot` deliberately does **not** run: there is no
   * Catalog authority to reconcile against, and constructing one to satisfy the
   * signature would mean fabricating a Side and Area — the exact failure the ADR
   * exists to prevent.
   */
  validateCustomerOwned(
    candidate: unknown,
    envelope: CustomerOwnedEnvelope,
  ): FormalDocumentOutcome {
    const version = readSchemaVersion(candidate);
    if (!version.ok || version.value !== BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED' };
    }

    const prepared = prepareDesignDocument(candidate);
    if (!prepared.ok) return { ok: false, rejection: rejectionForFindings(prepared.findings) };
    const document = prepared.value.document;

    // P01 guarantees the pair is null-together or present-together; this is the
    // branch check, not a repeat of that one.
    if (document.placement.productSideId !== null || document.placement.embroideryAreaId !== null) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }
    if (
      !quantizedEquals(document.placement.physicalWidthMm, envelope.physicalWidthMm) ||
      !quantizedEquals(document.placement.physicalHeightMm, envelope.physicalHeightMm)
    ) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }

    const area = envelopeAuthority(document, envelope);
    if (
      !quantizedEquals(document.placement.canvasWidthPx, area.boundWidthPx) ||
      !quantizedEquals(document.placement.canvasHeightPx, area.boundHeightPx)
    ) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }
    if (!validateDocumentWithinEmbroideryArea(document, area).ok) {
      return { ok: false, rejection: 'DOCUMENT_OUT_OF_BOUNDS' };
    }
    return { ok: true, document, schemaVersion: version.value };
  }
}

/**
 * The envelope rectangle, as the engine's area-authority argument.
 *
 * `ADR-APP6-001` §3.3: the engine imports no schema and receives its authority
 * as an argument, so the COP branch needs no engine change — containment simply
 * runs against this rectangle. The bounds are the whole envelope in document
 * pixels, anchored at the origin.
 *
 * The three identity fields are **empty strings, deliberately**. The containment
 * path reads only the four bound values (`areaBounds`), and there is no Catalog
 * Area here to name; putting a plausible-looking id in them would be exactly the
 * fabrication this ADR exists to prevent, and it would be a value that could
 * later be copied somewhere it is trusted. The two millimetre maxima are the
 * envelope itself, so a physical-size check reading them could never find a cap
 * that contradicts the bounds.
 */
function envelopeAuthority(
  document: DesignDocument,
  envelope: CustomerOwnedEnvelope,
): EmbroideryAreaAuthority {
  const pxPerMm = document.placement.pxPerMm;
  return {
    embroideryAreaId: '',
    productSideId: '',
    code: '',
    retiredAt: null,
    boundXPx: 0,
    boundYPx: 0,
    boundWidthPx: envelope.physicalWidthMm * pxPerMm,
    boundHeightPx: envelope.physicalHeightMm * pxPerMm,
    maxWidthMm: envelope.physicalWidthMm,
    maxHeightMm: envelope.physicalHeightMm,
  };
}
