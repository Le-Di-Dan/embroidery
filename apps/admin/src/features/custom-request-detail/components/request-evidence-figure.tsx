'use client';

import type { AdminRequestAssetResponse } from '@embroidery/api-client';

import { useRequestEvidence } from '../hooks/use-request-evidence';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import {
  assetAltText,
  assetRoleLabel,
  evidenceStateCopy,
  isViewableAsset,
  presentByteSize,
  presentInstant,
} from '../model/request-detail-presentation';

interface RequestEvidenceFigureProps {
  readonly requestId: string;
  readonly asset: AdminRequestAssetResponse;
  /** Position within its role group — the alt text, never the asset id. */
  readonly positionInRole: number;
}

/**
 * One piece of submitted evidence (`665:115`).
 *
 * The component owns exactly one image, and the hook it calls owns exactly one
 * object URL. That pairing is the whole reason a failing image does not fail the
 * page: each figure has its own query, its own failure and its own retry, so a
 * request whose second photograph was tombstoned still renders the first one and
 * still lets the operator moderate.
 *
 * ### What a failure is allowed to say
 *
 * One bounded sentence. `APP5-B06` answers the same way whether the asset
 * belongs to another request, failed inspection, was deleted or carries an
 * unsupported media type — and a screen that split those cases apart would
 * rebuild exactly the oracle the endpoint refuses to be. The retry appears only
 * in the transient band; a refusal will be refused again, so offering a button
 * for it would be an invitation to hammer a private endpoint.
 *
 * ### No download control
 *
 * The approved frames show inline evidence and no download affordance, so none
 * is invented here — and a `download` link would hand a customer's private
 * photograph to the operator's filesystem, outside every re-check `APP5-B06`
 * performs per request.
 */
export function RequestEvidenceFigure({
  requestId,
  asset,
  positionInRole,
}: RequestEvidenceFigureProps) {
  const viewable = isViewableAsset(asset);
  const evidence = useRequestEvidence({ requestId, assetId: asset.assetId, enabled: viewable });
  const roleLabel = assetRoleLabel(asset.role);

  return (
    <figure className="request-evidence" data-testid="request-evidence-item" data-role={asset.role}>
      <div className="request-evidence__frame">
        {evidence.objectUrl === null ? (
          <p className="request-evidence__state" data-testid="request-evidence-state">
            {evidenceStateCopy(viewable, evidence.failure)}
          </p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- a blob: object
             URL for private bytes cannot go through the Next image optimizer,
             which would need a fetchable public address. */
          <img
            className="request-evidence__image"
            src={evidence.objectUrl}
            alt={assetAltText(asset.role, positionInRole)}
            data-testid="request-evidence-image"
          />
        )}
      </div>

      {evidence.failure === 'retryable' ? (
        <button
          type="button"
          className="request-evidence__retry"
          data-testid="request-evidence-retry"
          onClick={evidence.retry}
        >
          {COPY.evidence.retry}
        </button>
      ) : null}

      <figcaption className="request-evidence__caption">
        <span className="request-evidence__role">{roleLabel}</span>
        <span className="request-evidence__meta">
          {`${COPY.evidence.linkedAt}: ${presentInstant(asset.linkedAt)}`}
        </span>
        <span className="request-evidence__meta">
          {`${COPY.evidence.size}: ${presentByteSize(asset.sizeBytes)}`}
        </span>
      </figcaption>
    </figure>
  );
}
