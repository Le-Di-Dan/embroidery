/**
 * Document construction and validation for a Session bootstrap (`APP3-B07`).
 *
 * Both modes end here, and both are validated identically. A blank document is
 * *not* trusted because it is empty: its placement snapshot still has to agree
 * with the real Side and Area, and skipping that would mean the one document the
 * server itself authored is the only one nobody checked. A cloned document is
 * validated because a Template published under one placement must not open on
 * another.
 *
 * `APP3-P01` owns structure, schema version and complexity; `APP3-P02` owns
 * every geometric consequence — placement agreement and containment. Neither is
 * re-implemented here; this composes them in the order their own contracts
 * require and turns any finding into one safe refusal.
 */
import { Injectable } from '@nestjs/common';
import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  prepareDesignDocument,
  readSchemaVersion,
  validateDesignDocumentComplexity,
  validateDesignDocumentContext,
  validateDesignDocumentStructure,
  type DesignDocument,
  type DesignDocumentContext,
  type DesignDocumentFinding,
} from '@embroidery/design-document';
import {
  validateDocumentWithinEmbroideryArea,
  validatePlacementSnapshot,
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
} from '@embroidery/design-engine';

import type { ResolvedDesignScope } from './design-session-scope.resolver';
import type { SessionPlacementAuthority } from './session-placement.authority';

/** Why a document may not open. Internal; the caller publishes one shape. */
export type DocumentRejection =
  | 'DOCUMENT_STRUCTURE_INVALID'
  | 'DOCUMENT_SCHEMA_UNSUPPORTED'
  | 'DOCUMENT_TOO_COMPLEX'
  | 'DOCUMENT_PLACEMENT_MISMATCH'
  | 'DOCUMENT_OUT_OF_BOUNDS'
  /** A referenced image is unknown, ineligible or unmeasured (`APP3-B08`). */
  | 'DOCUMENT_MEDIA_INELIGIBLE';

export type DocumentOutcome =
  | { readonly ok: true; readonly document: DesignDocument; readonly schemaVersion: number }
  | { readonly ok: false; readonly rejection: DocumentRejection };

@Injectable()
export class DesignDocumentAuthority {
  /**
   * The canonical empty document for a resolved placement.
   *
   * Built from the Side and Area the caller actually resolved, so the snapshot
   * it carries is true by construction — and then validated anyway, because
   * "true by construction" is a claim about code that changes.
   */
  buildEmptyDocument(scope: ResolvedDesignScope): DesignDocument {
    return {
      schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      placement: {
        productSideId: scope.productSideId,
        embroideryAreaId: scope.embroideryAreaId,
        canvasWidthPx: scope.view.canvasWidthPx,
        canvasHeightPx: scope.view.canvasHeightPx,
        physicalWidthMm: scope.view.physicalWidthMm,
        physicalHeightMm: scope.view.physicalHeightMm,
        pxPerMm: scope.view.pxPerMm,
      },
      elements: [],
    };
  }

  /**
   * Proves an arbitrary document may open on this placement.
   *
   * Order matters: structure first, because everything after it reads fields
   * that structure is what guarantees exist.
   */
  validate(candidate: unknown, scope: ResolvedDesignScope): DocumentOutcome {
    const version = readSchemaVersion(candidate);
    if (!version.ok || version.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED' };
    }

    const structure = validateDesignDocumentStructure(candidate);
    if (!structure.ok) return { ok: false, rejection: 'DOCUMENT_STRUCTURE_INVALID' };
    const document = structure.value;

    // Complexity returns findings rather than a verdict: an empty list is the
    // pass, and treating the array itself as truthy would accept every document.
    if (validateDesignDocumentComplexity(document).length > 0) {
      return { ok: false, rejection: 'DOCUMENT_TOO_COMPLEX' };
    }

    const side = placementAuthorityOf(scope);
    const area = areaAuthorityOf(scope);

    if (!validatePlacementSnapshot(document.placement, side, area).ok) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }
    if (!validateDocumentWithinEmbroideryArea(document, area).ok) {
      return { ok: false, rejection: 'DOCUMENT_OUT_OF_BOUNDS' };
    }

    return { ok: true, document, schemaVersion: version.value };
  }

  /**
   * Proves an arbitrary document may be **saved** onto a live placement
   * (`APP3-B08` §6/§7/§8).
   *
   * Bootstrap validates a document the server itself just built or copied from a
   * published Template. Autosave validates one an anonymous caller typed, so it
   * runs three steps bootstrap does not need:
   *
   * - `prepareDesignDocument` quantizes and canonicalizes, and — the part that
   *   matters — **revalidates after quantization**, because rounding can push a
   *   value onto a boundary the schema rejects. What is persisted is the
   *   prepared document, never the caller's object.
   * - contextual validation, which is the only thing that decides whether a
   *   referenced image may be placed at all.
   * - the placement authority carries real `retiredAt` values, so a Side or Area
   *   retired since the Session opened is refused rather than assumed live.
   *
   * The order is the one the contracts require: structure before anything that
   * reads fields, quantization before geometry (geometry must judge the numbers
   * that will actually be stored), and context last because it is the only step
   * needing external authority.
   */
  validateForSave(
    candidate: unknown,
    placement: SessionPlacementAuthority,
    context: DesignDocumentContext,
  ): DocumentOutcome {
    const version = readSchemaVersion(candidate);
    if (!version.ok || version.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED' };
    }

    const prepared = prepareDesignDocument(candidate);
    if (!prepared.ok) {
      // `prepareDesignDocument` folds structure, complexity, quantization and
      // canonicalization into one result; the findings say which, and the
      // complexity codes are the ones that must not read as "malformed".
      return { ok: false, rejection: rejectionForFindings(prepared.findings) };
    }
    const document = prepared.value.document;

    if (!validatePlacementSnapshot(document.placement, placement.side, placement.area).ok) {
      return { ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' };
    }
    if (!validateDocumentWithinEmbroideryArea(document, placement.area).ok) {
      return { ok: false, rejection: 'DOCUMENT_OUT_OF_BOUNDS' };
    }
    if (validateDesignDocumentContext(document, context).length > 0) {
      return { ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' };
    }

    return { ok: true, document, schemaVersion: version.value };
  }
}

/**
 * Complexity is a different refusal from a malformed body.
 *
 * The codes are the vocabulary's own — `COMPLEXITY_LIMIT_EXCEEDED` and
 * `DECODED_PIXEL_LIMIT_EXCEEDED` — and an unsupported version keeps its own
 * verdict rather than being flattened into "invalid", because a client that sent
 * a future document needs to know it is the version that is wrong.
 */
function rejectionForFindings(findings: readonly DesignDocumentFinding[]): DocumentRejection {
  for (const entry of findings) {
    if (entry.code === 'UNSUPPORTED_SCHEMA_VERSION') return 'DOCUMENT_SCHEMA_UNSUPPORTED';
  }
  const tooComplex = findings.some(
    (entry) =>
      entry.code === 'COMPLEXITY_LIMIT_EXCEEDED' || entry.code === 'DECODED_PIXEL_LIMIT_EXCEEDED',
  );
  return tooComplex ? 'DOCUMENT_TOO_COMPLEX' : 'DOCUMENT_STRUCTURE_INVALID';
}

/** `retiredAt: null` — the resolver only returns a live Side. */
function placementAuthorityOf(scope: ResolvedDesignScope): PlacementAuthority {
  return {
    productSideId: scope.productSideId,
    code: scope.view.sideCode,
    retiredAt: null,
    imageWidthPx: scope.view.canvasWidthPx,
    imageHeightPx: scope.view.canvasHeightPx,
    physicalWidthMm: scope.view.physicalWidthMm,
    physicalHeightMm: scope.view.physicalHeightMm,
    pxPerMm: scope.view.pxPerMm,
  };
}

function areaAuthorityOf(scope: ResolvedDesignScope): EmbroideryAreaAuthority {
  return {
    embroideryAreaId: scope.embroideryAreaId,
    productSideId: scope.productSideId,
    code: scope.view.areaCode,
    retiredAt: null,
    boundXPx: scope.view.boundXPx,
    boundYPx: scope.view.boundYPx,
    boundWidthPx: scope.view.boundWidthPx,
    boundHeightPx: scope.view.boundHeightPx,
    maxWidthMm: scope.maxWidthMm,
    maxHeightMm: scope.maxHeightMm,
  };
}
