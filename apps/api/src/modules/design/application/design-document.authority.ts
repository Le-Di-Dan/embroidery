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
  readSchemaVersion,
  validateDesignDocumentComplexity,
  validateDesignDocumentStructure,
  type DesignDocument,
} from '@embroidery/design-document';
import {
  validateDocumentWithinEmbroideryArea,
  validatePlacementSnapshot,
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
} from '@embroidery/design-engine';

import type { ResolvedDesignScope } from './design-session-scope.resolver';

/** Why a document may not open. Internal; the caller publishes one shape. */
export type DocumentRejection =
  | 'DOCUMENT_STRUCTURE_INVALID'
  | 'DOCUMENT_SCHEMA_UNSUPPORTED'
  | 'DOCUMENT_TOO_COMPLEX'
  | 'DOCUMENT_PLACEMENT_MISMATCH'
  | 'DOCUMENT_OUT_OF_BOUNDS';

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
