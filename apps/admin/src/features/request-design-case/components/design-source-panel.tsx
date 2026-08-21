'use client';

import type {
  AdminRequestAssetResponse,
  AdminSubmittedDesignSourceResponse,
} from '@embroidery/api-client';

import { useRequestEvidenceImage } from '../hooks/use-request-evidence-image';
import { readWorkingDocument } from '../model/design-authoring-document';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { DesignDocumentPreview } from './design-document-preview';

/**
 * The roles this screen may open.
 *
 * `ATTACHMENT` is not in the Admin contract's role enum at all, so filtering by
 * this set is a second, explicit guarantee rather than a restatement of the
 * type: an asset carrying a role the client does not recognise is never fetched.
 *
 * Stated here rather than imported from `APP5-A02`, which publishes only its
 * screen — reaching past that boundary for a constant would couple two bounded
 * features by deep import.
 */
const VIEWABLE_ASSET_ROLES: readonly string[] = ['COP_IMAGE', 'REFERENCE'] as const;

interface CatalogSourcePanelProps {
  readonly source: AdminSubmittedDesignSourceResponse | null;
  readonly absent: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
}

/**
 * `692:3` and `694:3` — the submitted Catalog design source.
 *
 * ### An absent source is not an error
 *
 * `APP6-B07` answers `200` with `submittedDesign: null` when the request's
 * Design Session is no longer available. That is a successful read, and it
 * renders the approved honest-absence frame — **not** the load-error frame, and
 * not a fabricated blank document. `APP6-A02` §24 names turning this into a
 * network error as a defect, so the three states are separate props rather than
 * one nullable value.
 *
 * ### `submitted_session_id` is provenance, never authorization
 *
 * The panel names no session id, and none is a parameter of anything it calls:
 * the request is the address, and the server selects the source from its own
 * pointer after the request itself has been authorised.
 *
 * ### The document is rendered client-side
 *
 * Native SVG, from the persisted document. There is no server raster, no
 * derivative, no export and no download control anywhere on this panel.
 */
export function CatalogSourcePanel({
  source,
  absent,
  isLoading,
  isError,
  onRetry,
}: CatalogSourcePanelProps) {
  if (isLoading) {
    return (
      <p className="request-design-case__hint" role="status" data-testid="design-source-loading">
        {COPY.source.loading}
      </p>
    );
  }

  if (isError) {
    return (
      <div className="request-design-case__notice" role="alert" data-testid="design-source-error">
        <p>{COPY.states.errorRetryable}</p>
        <button className="request-design-case__button" type="button" onClick={onRetry}>
          {COPY.states.retry}
        </button>
      </div>
    );
  }

  if (absent || source === null) {
    return (
      <div className="request-design-case__notice" data-testid="design-source-absent">
        <h3 className="request-design-case__notice-title">{COPY.source.absentTitle}</h3>
        <p>{COPY.source.absentBody}</p>
      </div>
    );
  }

  // P01's own validator decides whether the persisted document can be drawn.
  // A document it refuses is reported as absent-for-preview rather than drawn
  // partially — a half-rendered design would misinform the operator about what
  // the customer sent.
  const document = readWorkingDocument(source.document);

  return (
    <div data-testid="design-source-catalog">
      <h3 className="request-design-case__notice-title">{COPY.source.catalogTitle}</h3>
      <p className="request-design-case__hint">{COPY.source.catalogHint}</p>
      {document === null ? (
        <p className="request-design-case__hint">{COPY.source.absentBody}</p>
      ) : (
        <DesignDocumentPreview document={document} testId="design-source-preview" />
      )}
    </div>
  );
}

interface CustomerOwnedSourcePanelProps {
  readonly requestId: string;
  readonly assets: readonly AdminRequestAssetResponse[];
}

/**
 * `694:111` — the customer-owned-product branch.
 *
 * ### It states the truth about why there is no Design Session
 *
 * A customer-owned request has none **by design** (`APP6-G01`), so the digitizing
 * source is the request's own evidence: the images the customer attached. The
 * panel says exactly that. Nothing here fabricates a Catalog row, a session id
 * or a blank document to make the branch look like the other one.
 *
 * ### Evidence follows the APP5 protected-blob lifecycle
 *
 * Each image is fetched by `requestId + assetId` through the Admin session
 * cookie, turned into an object URL by the hook that owns it, and revoked when
 * that hook's render ends. No presigned URL, no storage key and no object URL in
 * a route, a query parameter or any browser storage.
 */
export function CustomerOwnedSourcePanel({ requestId, assets }: CustomerOwnedSourcePanelProps) {
  const viewable = assets.filter(
    // A tombstoned file publishes no `mimeType` while the association stays
    // listed. Requesting it would be a call that is certain to be refused.
    (asset) => VIEWABLE_ASSET_ROLES.includes(asset.role) && asset.mimeType !== undefined,
  );

  return (
    <div data-testid="design-source-cop">
      <h3 className="request-design-case__notice-title">{COPY.source.copTitle}</h3>
      <p className="request-design-case__hint">{COPY.source.copBody}</p>
      {viewable.length === 0 ? (
        <p className="request-design-case__hint" data-testid="design-source-cop-empty">
          {COPY.source.copEmpty}
        </p>
      ) : (
        <ul className="request-design-case__evidence">
          {viewable.map((asset, index) => (
            <li key={asset.assetId} className="request-design-case__evidence-item">
              <EvidenceFigure requestId={requestId} assetId={asset.assetId} index={index + 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface EvidenceFigureProps {
  readonly requestId: string;
  readonly assetId: string;
  readonly index: number;
}

/** One evidence image. One hook instance owns exactly one object URL. */
function EvidenceFigure({ requestId, assetId, index }: EvidenceFigureProps) {
  const image = useRequestEvidenceImage({ requestId, assetId, enabled: true });

  if (image.isLoading) {
    return <p className="request-design-case__hint">{COPY.source.evidenceLoading}</p>;
  }
  if (image.failed || image.objectUrl === null) {
    return (
      <div className="request-design-case__notice">
        <p>{COPY.source.evidenceFailed}</p>
        <button className="request-design-case__button" type="button" onClick={image.retry}>
          {COPY.source.evidenceRetry}
        </button>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a blob: object URL
       for private bytes cannot go through the Next image optimizer, which would
       need a fetchable public address; the handle is revoked when this render
       ends. Written as a block comment, as `APP5-A02` does: with line comments
       the directive lands on the next *comment* line rather than on the tag. */
    <img
      className="request-design-case__evidence-image"
      src={image.objectUrl}
      alt={COPY.source.evidenceAlt(index)}
      data-testid={`design-evidence-${assetId}`}
    />
  );
}
