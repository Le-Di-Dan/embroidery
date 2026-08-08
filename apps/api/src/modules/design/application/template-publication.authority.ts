/**
 * `GRD-T01` — everything that must be true before a Design Template publishes
 * (`APP3-B04` §6, `IMP-D042` PO-07).
 *
 * PO-07 says it in one sentence and means it literally: *"no backend checkpoint
 * may implement a reduced publish guard"*. So this composes the whole thing in
 * one place, and every part of it is delegated to the authority that owns it —
 * `APP3-P01` for the document, `APP3-P02` for geometry, the Catalog placement
 * port for the scope chain, `IMP-D044` for media. Nothing is re-derived here.
 *
 * The guard is **read-only**. It never repairs a document, never re-canonicalizes
 * an immutable version, never fills in a missing scope and never creates a
 * derivative: a template that is not publishable stays exactly as it was, and the
 * Admin fixes it through the operations that own those fields.
 *
 * Why the checks run in this order: the cheap identity facts first, then the
 * document, then geometry, then media. Each stage is a precondition of the next —
 * there is no point validating containment against an Area the template does not
 * legitimately claim.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  prepareDesignDocument,
  readSchemaVersion,
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  type DesignDocument,
} from '@embroidery/design-document';
import {
  validateDocumentWithinEmbroideryArea,
  validatePlacementSnapshot,
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
} from '@embroidery/design-engine';

import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../catalog/domain/repositories/product-placement.repository';
import type { ProductId } from '../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  DesignTemplate,
  DesignTemplateVersion,
} from '../domain/repositories/design-template.repository';
import { TemplateDocumentMediaAuthority, assetIdsIn } from './template-document-media.authority';

/** Why a template may not publish. Internal; the caller publishes one shape. */
export type PublicationRefusal =
  | 'NO_IMMUTABLE_VERSION'
  | 'SCOPE_INCOMPLETE'
  | 'SCOPE_UNRESOLVED'
  | 'DOCUMENT_INVALID'
  | 'PLACEMENT_MISMATCH'
  | 'OUT_OF_BOUNDS'
  | 'MEDIA_INELIGIBLE';

export type PublicationOutcome =
  | { readonly ok: true; readonly version: DesignTemplateVersion }
  | { readonly ok: false; readonly refusal: PublicationRefusal };

@Injectable()
export class TemplatePublicationAuthority {
  constructor(
    @Inject(PRODUCT_PLACEMENT_REPOSITORY)
    private readonly placement: ProductPlacementRepository,
    private readonly media: TemplateDocumentMediaAuthority,
  ) {}

  /**
   * Decides whether this template may publish its current version.
   *
   * `version` is the highest immutable version the caller already read; the guard
   * never selects a different one, because the publication subject must be the
   * version the caller believes it is publishing.
   */
  async evaluate(
    template: DesignTemplate,
    version: DesignTemplateVersion | undefined,
  ): Promise<PublicationOutcome> {
    // 4/5 — a header with no version has nothing to publish. `APP3-B03` creates
    // exactly that state, so this is the ordinary refusal, not an edge case.
    if (version === undefined || template.currentVersion < 1) {
      return { ok: false, refusal: 'NO_IMMUTABLE_VERSION' };
    }

    // 7 — APP3 publishes area-scoped templates only, and a draft is allowed to be
    // incomplete right up to this moment.
    if (
      template.productId === undefined ||
      template.productSideId === undefined ||
      template.embroideryAreaId === undefined
    ) {
      return { ok: false, refusal: 'SCOPE_INCOMPLETE' };
    }

    // 6 — the durable document, validated read-only. `APP3-B03A` canonicalized it
    // on the way in; this proves it is *still* valid rather than trusting that,
    // because a schema-semantic change or a corrupted row must fail closed.
    const schemaVersion = readSchemaVersion(version.designDocument);
    if (!schemaVersion.ok || schemaVersion.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, refusal: 'DOCUMENT_INVALID' };
    }
    const prepared = prepareDesignDocument(version.designDocument);
    if (!prepared.ok) return { ok: false, refusal: 'DOCUMENT_INVALID' };
    // The prepared form is used for geometry only. It is never written back: the
    // version is immutable, and repairing it here would publish something the
    // Admin never saved.
    const document: DesignDocument = prepared.value.document;

    // 8/9/10 — the exact chain, and all three rows active. `findPlacement`
    // projects retired rows too, so retirement is a real value here rather than
    // an assumption.
    const chain = await this.resolveScope(
      template.productId,
      template.productSideId,
      template.embroideryAreaId,
    );
    if (chain === undefined) return { ok: false, refusal: 'SCOPE_UNRESOLVED' };

    // 11/12 — placement agreement and containment, in `NEW_EDITING` mode: a fresh
    // publication must satisfy today's geometry, not the laxer rules a historical
    // render is allowed. `validateDocumentWithinEmbroideryArea` also refuses an
    // ambiguous or cyclic element graph, which is `APP3-P02-C1`'s structural rule
    // arriving for free rather than as a second checker.
    if (!validatePlacementSnapshot(document.placement, chain.side, chain.area, 'NEW_EDITING').ok) {
      return { ok: false, refusal: 'PLACEMENT_MISMATCH' };
    }
    if (!validateDocumentWithinEmbroideryArea(document, chain.area).ok) {
      return { ok: false, refusal: 'OUT_OF_BOUNDS' };
    }

    // 13 — every referenced Asset still measured, still editor-safe, still in the
    // Template lane. The same allowlist `APP3-B03A` saves through, so publication
    // cannot admit media a save would have refused.
    if (!(await this.mediaEligible(document))) {
      return { ok: false, refusal: 'MEDIA_INELIGIBLE' };
    }

    return { ok: true, version };
  }

  /** The `Product → Side → Area` chain, or nothing when it no longer resolves. */
  private async resolveScope(
    productId: string,
    productSideId: string,
    embroideryAreaId: string,
  ): Promise<{ side: PlacementAuthority; area: EmbroideryAreaAuthority } | undefined> {
    const snapshot = await this.placement.findPlacement(productId as ProductId);
    if (snapshot === undefined) return undefined;

    const side = snapshot.sides.find((row) => row.id === productSideId);
    if (side === undefined || side.retiredAt !== undefined) return undefined;

    const area = snapshot.areas.find((row) => row.id === embroideryAreaId);
    // The Area must hang from *this* Side, or the geometry below would be
    // validated against a different Area of the same Product.
    if (area === undefined || area.retiredAt !== undefined || area.productSideId !== side.id) {
      return undefined;
    }

    const pxPerMm = Number(side.pxPerMm);
    const boundWidthPx = Number(area.boundWidthPx);
    const boundHeightPx = Number(area.boundHeightPx);

    return {
      side: {
        productSideId: side.id,
        code: side.code,
        retiredAt: side.retiredAt ?? null,
        imageWidthPx: side.imageWidthPx,
        imageHeightPx: side.imageHeightPx,
        physicalWidthMm: Number(side.physicalWidthMm),
        physicalHeightMm: Number(side.physicalHeightMm),
        pxPerMm,
      },
      area: {
        embroideryAreaId: area.id,
        productSideId: area.productSideId,
        code: area.code,
        retiredAt: area.retiredAt ?? null,
        boundXPx: Number(area.boundXPx),
        boundYPx: Number(area.boundYPx),
        boundWidthPx,
        boundHeightPx,
        // Absent mm caps mean "no cap beyond the area itself", exactly as the
        // Session resolvers read them. A zero would reject every document.
        maxWidthMm:
          area.maxWidthMm === undefined ? boundWidthPx / pxPerMm : Number(area.maxWidthMm),
        maxHeightMm:
          area.maxHeightMm === undefined ? boundHeightPx / pxPerMm : Number(area.maxHeightMm),
      },
    };
  }

  /**
   * Every referenced Asset resolves in the Template allowlist.
   *
   * A text-only template references none and is trivially eligible — which is the
   * correct answer, not a shortcut: `IMP-D044` constrains what may be *placed*,
   * and a document that places nothing places nothing ineligible.
   */
  private async mediaEligible(document: DesignDocument): Promise<boolean> {
    const referenced = assetIdsIn(document);
    if (referenced.length === 0) return true;

    const context = await this.media.contextFor(document);
    const eligible = new Set<string>();
    for (const record of context.derivatives.values()) {
      if (record.kind === 'NORMALIZED' && record.status === 'READY') eligible.add(record.assetId);
    }
    return referenced.every((assetId) => eligible.has(assetId));
  }
}
