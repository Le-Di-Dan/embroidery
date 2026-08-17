'use client';

import type { AdminRequestAssetResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { VIEWABLE_ASSET_ROLES } from '../model/request-detail-presentation';
import { RequestEvidenceFigure } from './request-evidence-figure';

interface RequestEvidenceGalleryProps {
  readonly requestId: string;
  readonly assets: readonly AdminRequestAssetResponse[];
}

/**
 * The images the customer submitted (`665:115`).
 *
 * The gallery decides *which* assets exist and in what order; each figure
 * decides what happens to its own bytes. The split matters: one image failing is
 * contained to its own tile, and the gallery never learns whether any particular
 * fetch succeeded.
 *
 * Assets are grouped by role, `COP_IMAGE` first — a customer-owned request is
 * triaged from the photographs of the object itself, and the references are
 * supporting material. Within a role the server's own order is preserved and the
 * one-based position becomes the image's alt text, so the operator can refer to
 * "ảnh món đồ của khách 2" without an asset id ever appearing on screen.
 *
 * `ATTACHMENT` is never requested. It is not in the Admin contract's role enum
 * at all, and an asset carrying any unrecognised role is listed by its figure
 * and never fetched.
 */
export function RequestEvidenceGallery({ requestId, assets }: RequestEvidenceGalleryProps) {
  const grouped = VIEWABLE_ASSET_ROLES.flatMap((role) =>
    assets
      .filter((asset) => asset.role === role)
      .map((asset, index) => ({ asset, positionInRole: index + 1 })),
  );
  const unknownRole = assets.filter((asset) => !VIEWABLE_ASSET_ROLES.includes(asset.role));
  const ordered = [
    ...grouped,
    ...unknownRole.map((asset, index) => ({ asset, positionInRole: index + 1 })),
  ];

  return (
    <section className="request-detail__panel" aria-labelledby="request-evidence-heading">
      <h2 className="request-detail__panel-title" id="request-evidence-heading">
        {COPY.sections.evidence}
      </h2>

      {ordered.length === 0 ? (
        <p className="request-detail__hint" data-testid="request-evidence-empty">
          {COPY.evidence.empty}
        </p>
      ) : (
        <ul className="request-evidence__list" data-testid="request-evidence-list">
          {ordered.map(({ asset, positionInRole }) => (
            <li className="request-evidence__slot" key={asset.assetId}>
              <RequestEvidenceFigure
                requestId={requestId}
                asset={asset}
                positionInRole={positionInRole}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
