import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import {
  presentOptional,
  subjectKindLabel,
  type SubjectBranch,
} from '../model/request-detail-presentation';
import { RequestDefinitionRow } from './request-definition-row';

interface RequestSubjectPanelProps {
  readonly branch: SubjectBranch;
}

/**
 * The subject of one request — the Catalog branch (`665:3`) or the
 * customer-owned branch (`665:115`), decided by the contract's discriminator.
 *
 * The two branches share no fields. A catalog product's variant labels never
 * appear on a customer-owned item, and an item's physical dimensions never
 * appear on a catalog product, because neither request *has* the other's data —
 * rendering an empty row for it would suggest the value went missing.
 *
 * ### The Catalog branch names no design it cannot open
 *
 * `FU-APP5-B04-DESIGN-PREVIEW-01` is still open: there is no authorized way for
 * this Admin surface to render a Catalog design session, and `designSessionId`
 * is provenance, not a credential — `APP5-B04` says so explicitly and the id
 * alone authorizes nothing. So the panel states that the artwork is not viewable
 * here and shows the session id as a traceable origin. It does not call an APP3
 * private preview through a fabricated customer context, invent an endpoint, or
 * offer a control that would fail.
 *
 * ### The customer-owned branch has no design at all
 *
 * Not "no preview available" — none exists. A COP request is triaged from the
 * photographs the customer sent (`G01-D10`), which are the whole description of
 * the physical object, and the panel says so rather than leaving a gap that
 * looks like a loading failure.
 */
export function RequestSubjectPanel({ branch }: RequestSubjectPanelProps) {
  return (
    <section className="request-detail__panel" aria-labelledby="request-subject-heading">
      <h2 className="request-detail__panel-title" id="request-subject-heading">
        {COPY.sections.subject}
      </h2>
      <p className="request-detail__badge" data-subject-kind={branch.kind}>
        {subjectKindLabel(branch)}
      </p>

      {branch.kind === 'CATALOG' ? (
        <>
          <dl className="request-detail__definitions" data-testid="request-subject-catalog">
            <RequestDefinitionRow
              term={COPY.subject.productName}
              value={presentOptional(branch.subject.productName)}
            />
            <RequestDefinitionRow
              term={COPY.subject.productSlug}
              value={presentOptional(branch.subject.productSlug)}
            />
            <RequestDefinitionRow
              term={COPY.subject.variantColor}
              value={presentOptional(branch.subject.variantColorName)}
            />
            <RequestDefinitionRow
              term={COPY.subject.variantSize}
              value={presentOptional(branch.subject.variantSizeLabel)}
            />
          </dl>
          <div className="request-detail__note" data-testid="request-design-preview-fallback">
            <h3 className="request-detail__note-title">{COPY.designPreview.heading}</h3>
            <p className="request-detail__note-body">{COPY.designPreview.unavailable}</p>
            {branch.subject.designSessionId === undefined ? null : (
              <>
                <dl className="request-detail__definitions">
                  <RequestDefinitionRow
                    term={COPY.subject.designSession}
                    value={branch.subject.designSessionId}
                  />
                </dl>
                <p className="request-detail__hint">{COPY.designPreview.provenanceHelp}</p>
              </>
            )}
          </div>
        </>
      ) : null}

      {branch.kind === 'CUSTOMER_OWNED' ? (
        <>
          <dl className="request-detail__definitions" data-testid="request-subject-cop">
            <RequestDefinitionRow term={COPY.subject.itemName} value={branch.subject.name} />
            <RequestDefinitionRow
              term={COPY.subject.itemDescription}
              value={branch.subject.description ?? COPY.subject.noDescription}
            />
            <RequestDefinitionRow
              term={COPY.subject.width}
              value={
                branch.subject.physicalWidthMm === undefined
                  ? COPY.subject.unavailableLabel
                  : `${branch.subject.physicalWidthMm} ${COPY.subject.millimetres}`
              }
            />
            <RequestDefinitionRow
              term={COPY.subject.height}
              value={
                branch.subject.physicalHeightMm === undefined
                  ? COPY.subject.unavailableLabel
                  : `${branch.subject.physicalHeightMm} ${COPY.subject.millimetres}`
              }
            />
          </dl>
          <p className="request-detail__hint">{COPY.subject.copHasNoDesign}</p>
        </>
      ) : null}

      {branch.kind === 'UNKNOWN' ? (
        <p className="request-detail__hint" data-testid="request-subject-unknown">
          {COPY.subject.unavailableLabel}
        </p>
      ) : null}
    </section>
  );
}
