/**
 * Which images a Design Template draft may place (`APP3-B03A` §11, `IMP-D044`).
 *
 * `validateDesignDocumentContext` decides eligibility from a map of derivative
 * records, and — as at `APP3-B08` — **the map is the allowlist**. Nothing else
 * enforces "only Template artwork": an Asset of any other kind is simply never
 * put in, so the document's reference resolves to nothing and `APP3-P01-C1`
 * rejects it as unknown. Fail-closed by construction beats a comparison someone
 * can forget to write.
 *
 * The eligible kind is **`TEMPLATE_SOURCE`**, which is what
 * `association-resolution.service.ts` maps the `TEMPLATE_ASSET` processing
 * profile to. Scoping is done by `findScopedByIds`, whose contract already says
 * an id outside the requested kind *"is simply absent, so this cannot be used to
 * discover that a private asset exists"* — a customer upload named in a Template
 * document is therefore indistinguishable from an id that does not exist.
 *
 * The lookup is driven by the ids the candidate document actually references, so
 * it is bounded by `IMP-D044` PO-09's twenty-unique-assets limit rather than by
 * the size of the asset library.
 *
 * The asymmetry with the Session authority is deliberate. A Session may only
 * ever place media it uploaded itself, because a customer must not reach another
 * customer's file. An Admin authoring a Template is authorized over the whole
 * Template-artwork library, and the association this save creates is the *record*
 * of that choice rather than a precondition for it — which is exactly why
 * `APP3-B03A` and not `APP3-B03` owns the association producer.
 *
 * No object-storage call happens here. `IMP-D044` forbids reading the binary to
 * decide a document write, so eligibility comes entirely from the canonical
 * metadata a worker already measured.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { DerivativeAuthorityRecord, DesignDocumentContext } from '@embroidery/design-document';

import {
  ASSET_REPOSITORY,
  type AssetDerivative,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';

/**
 * The one Asset lane a Design Template document may reference.
 *
 * `TEMPLATE_SOURCE` is what `association-resolution.service.ts` maps the
 * `TEMPLATE_ASSET` processing profile to, and `PRODUCTION_SENSITIVE` is the
 * classification a store-authored private original carries — never `PUBLIC`,
 * which would make the original itself servable, and never `CUSTOMER_PRIVATE`,
 * which is the Session lane `APP3-B06B` owns. Both halves are part of the scope:
 * `findScopedByIds` requires them together, and an Asset matching only one is
 * absent from the result exactly as an unknown id is.
 */
export const TEMPLATE_ARTWORK_ASSET_KIND = 'TEMPLATE_SOURCE' as const;
export const TEMPLATE_ARTWORK_ASSET_CLASSIFICATION = 'PRODUCTION_SENSITIVE' as const;

@Injectable()
export class TemplateDocumentMediaAuthority {
  constructor(@Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository) {}

  /**
   * Builds the allowlist for one candidate document.
   *
   * Reads the candidate defensively: this runs *before* the document has been
   * validated, so an unreadable value simply contributes no Assets — which can
   * only ever make the allowlist smaller.
   */
  async contextFor(candidate: unknown): Promise<DesignDocumentContext> {
    const referenced = assetIdsIn(candidate);
    if (referenced.length === 0) return { derivatives: new Map() };

    const eligible = await this.assets.findScopedByIds(referenced as AssetId[], {
      kind: TEMPLATE_ARTWORK_ASSET_KIND,
      classification: TEMPLATE_ARTWORK_ASSET_CLASSIFICATION,
    });
    if (eligible.length === 0) return { derivatives: new Map() };

    const derivatives = await this.assets.listDerivativesFor(eligible.map((asset) => asset.id));
    const map = new Map<string, DerivativeAuthorityRecord>();
    for (const derivative of derivatives) {
      map.set(derivative.id, toAuthorityRecord(derivative));
    }
    return { derivatives: map };
  }
}

/**
 * The record `APP3-P01` compares against — kind and status included rather than
 * filtered out here.
 *
 * Filtering ineligible rows out would collapse two different failures into one:
 * a derivative still processing would report as "unknown" rather than "not
 * ready". P01-C1 already distinguishes them, so the map carries everything
 * measured and lets the one authority decide.
 */
function toAuthorityRecord(derivative: AssetDerivative): DerivativeAuthorityRecord {
  return {
    derivativeId: derivative.id,
    assetId: derivative.assetId,
    kind: derivative.kind,
    status: derivative.status,
    widthPx: derivative.widthPx ?? null,
    heightPx: derivative.heightPx ?? null,
    mediaType: derivative.mediaType ?? null,
    byteSize: derivative.byteSize ?? null,
  };
}

/** Every distinct `assetId` a candidate document references, read defensively. */
export function assetIdsIn(document: unknown): readonly string[] {
  if (typeof document !== 'object' || document === null) return [];
  const elements = (document as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];

  const ids = new Set<string>();
  for (const element of elements) {
    if (typeof element !== 'object' || element === null) continue;
    const assetId = (element as { assetId?: unknown }).assetId;
    if (typeof assetId === 'string' && assetId.length > 0) ids.add(assetId);
  }
  return [...ids];
}
