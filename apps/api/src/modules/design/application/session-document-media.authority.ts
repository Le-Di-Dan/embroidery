/**
 * Which images this Session is allowed to place (`APP3-B08` §8, `IMP-D044`).
 *
 * `validateDesignDocumentContext` decides eligibility from a map of derivative
 * records. This builds that map — and the map *is* the allowlist. Nothing else
 * enforces "no cross-Session reference": a derivative belonging to another
 * Session's upload is simply never put in, so the document's reference resolves
 * to nothing and P01-C1 rejects it as unknown. Fail-closed by construction beats
 * a comparison someone can forget to write.
 *
 * Two sources of eligible Assets, and the asymmetry between them is the point:
 *
 * - **This Session's own uploads** (`design_session_assets`). `APP3-B06B` is the
 *   only way a row gets there, and it lands `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`.
 * - **Assets already present in the Session's persisted document.** A Template
 *   clone carries Template-controlled media that was validated when the Session
 *   opened, and those Assets are in no `design_session_assets` row. Re-deriving
 *   Template visibility here would be a second definition of what a published
 *   Template may show; carrying forward what an accepted document already
 *   references is narrower and cannot widen visibility, because a save can only
 *   ever keep or drop those references — never add one that was not already
 *   there.
 *
 * The consequence worth stating plainly: a **new** image reference can only ever
 * name an Asset this Session uploaded itself.
 *
 * No object-storage call happens here. `IMP-D044` forbids reading the binary to
 * decide a document write, so eligibility is decided entirely from the canonical
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
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSession,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';

@Injectable()
export class SessionDocumentMediaAuthority {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
  ) {}

  async contextFor(session: DesignSession): Promise<DesignDocumentContext> {
    const eligible = new Set<string>(await this.sessions.listAssetIds(session.id));
    for (const assetId of assetIdsIn(session.designDocument)) eligible.add(assetId);

    if (eligible.size === 0) return { derivatives: new Map() };

    const derivatives = await this.assets.listDerivativesFor([...eligible] as AssetId[]);
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
 * Filtering ineligible rows out of the map would collapse two different failures
 * into one: a derivative that is still processing would report as "unknown"
 * rather than "not ready". P01-C1 already distinguishes them, so the map carries
 * everything measured and lets the one authority decide.
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

/**
 * Every `assetId` an already-persisted document references.
 *
 * Read defensively rather than through the document schema: the persisted value
 * is `unknown` on the repository contract, and this runs before the incoming
 * document has been validated. An unreadable stored document simply contributes
 * no Assets, which can only ever make the allowlist smaller.
 */
function assetIdsIn(document: unknown): readonly string[] {
  if (typeof document !== 'object' || document === null) return [];
  const elements = (document as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];

  const ids: string[] = [];
  for (const element of elements) {
    if (typeof element !== 'object' || element === null) continue;
    const assetId = (element as { assetId?: unknown }).assetId;
    if (typeof assetId === 'string' && assetId.length > 0) ids.push(assetId);
  }
  return ids;
}
