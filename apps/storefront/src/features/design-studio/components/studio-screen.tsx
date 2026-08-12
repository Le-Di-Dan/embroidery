'use client';

import { useEffect, useReducer, useRef } from 'react';

import { useStudioPlacement } from '../hooks/use-studio-placement';
import { useStudioSession } from '../hooks/use-studio-session';
import { useTemplateDetail } from '../hooks/use-template-detail';
import { useTemplateList } from '../hooks/use-template-list';
import { useTemplatePreview } from '../hooks/use-template-preview';
import { STUDIO_COPY } from '../model/studio-copy';
import { codesOf, findArea, findSide, tripleOf } from '../model/studio-placement';
import { EMPTY_STUDIO_SELECTION, studioSelectionReducer } from '../model/studio-selection';
import { areaLimitsOf, type StudioAreaLimits } from '../model/studio-transform-authority';
import { previewReferenceOf } from '../model/studio-template';
import { StudioPlacementPicker } from './studio-placement-picker';
import { StudioSessionExpired } from './studio-session-expired';
import { StudioStageScreen } from './studio-stage-screen';
import { StudioStartActions } from './studio-start-actions';
import { StudioTemplatePicker } from './studio-template-picker';
import { StudioTemplatePreview } from './studio-template-preview';
import { StudioUnavailable } from './studio-unavailable';

export interface StudioScreenProps {
  readonly productSlug: string;
  readonly productName: string;
}

/**
 * The Studio bootstrap island (`APP3-S01`).
 *
 * Everything on this screen is one chain, and the chain is what enforces the
 * rules rather than a sequence of guards:
 *
 *     placement → side → area → triple → template list → detail → preview
 *                                     ↘ codes → session
 *
 * Each stage is `undefined` until the one before it resolves, so there is no
 * state in which a Template is requested without a complete triple, a preview
 * is requested without a published version, or a Session is opened without the
 * exact placement the visitor is looking at.
 *
 * The route ends here. Once a Session snapshot exists, S01 has done its job and
 * hands over to the `APP3-S02` stage — it does not create the editor's state
 * container, and it shows no editing control it cannot honour.
 */
export function StudioScreen({ productSlug, productName }: StudioScreenProps) {
  const { placement, isLoading, hasError, retry } = useStudioPlacement(productSlug);
  const [selection, dispatch] = useReducer(studioSelectionReducer, EMPTY_STUDIO_SELECTION);

  // Re-derive against every manifest that arrives, not only the first. A Side or
  // Area retired since the last read is replaced here, which is what makes the
  // screen revocation-aware without polling for revocations.
  useEffect(() => {
    if (placement === undefined) return;
    dispatch({ type: 'reconcile', placement });
  }, [placement]);

  const side = placement === undefined ? undefined : findSide(placement, selection.sideId);
  const area = findArea(side, selection.areaId);
  const triple = placement === undefined ? undefined : tripleOf(placement, side, area);
  const codes = codesOf(side, area);

  const eligible = placement?.studioEligible === true;
  const list = useTemplateList(eligible ? triple : undefined);
  const detail = useTemplateDetail(eligible ? triple : undefined, selection.templateSlug);

  /**
   * A Template that has stopped being available authorises nothing further.
   *
   * `APP3-B05`'s detail read is the moment a listed Template can be found to
   * have been unpublished, archived or withdrawn. The selection is dropped for
   * every downstream purpose — preview, clone, the pressed state in the picker
   * — while the reason stays on screen. It is never silently converted into a
   * blank start: the visitor chose a Template, and Blank is a separate action
   * they have to take themselves.
   */
  const liveTemplateSlug = detail.failure === 'gone' ? null : selection.templateSlug;
  const previewReference =
    detail.detail === undefined || liveTemplateSlug === null
      ? undefined
      : previewReferenceOf(detail.detail);
  const preview = useTemplatePreview(previewReference);
  const session = useStudioSession(productSlug);

  /**
   * The Area's physical maxima, frozen at the moment the Session opens.
   *
   * `APP3-P02` needs `maxWidthMm`/`maxHeightMm` to rule on physical size and the
   * Session scope does not carry them, so they come from the manifest this
   * screen already holds — no second request. Recorded only while there is *no*
   * Session, because once one exists its placement is fixed: a manifest that
   * reconciles afterwards must not silently change the limits an open design is
   * being validated against.
   */
  const areaLimits = useRef<StudioAreaLimits | null>(null);
  useEffect(() => {
    if (session.snapshot !== null) return;
    areaLimits.current = area === undefined ? null : areaLimitsOf(area);
  }, [area, session.snapshot]);

  if (isLoading) {
    return (
      <p className="studio__status" role="status">
        {STUDIO_COPY.loadingPlacement}
      </p>
    );
  }

  if (hasError || placement === undefined) {
    return <StudioUnavailable reason="error" onRetry={retry} />;
  }

  if (session.isExpired) {
    return <StudioSessionExpired onRestart={session.restart} />;
  }

  // The handover to `APP3-S02`. Once a canonical Session snapshot exists the
  // bootstrap chain above has done its job, and the stage — not the picker — is
  // what the customer works in. The Session's own scope travels with it, so a
  // later change to the pre-bootstrap Side or Area selection cannot retarget an
  // open Session; nothing on the stage can even see that selection.
  if (session.snapshot !== null) {
    /*
     * The cloned Template's display name, for the `APP3-S08-C1` baseline row.
     *
     * From the detail this screen already fetched to draw the preview — no
     * second request, and none is made on a resume either. The slug is matched
     * against the Session's own lineage rather than assumed: the detail query
     * is keyed on the *selection*, and a name that did not come from the
     * Template this Session was actually cloned from would be a confident lie
     * on a row a customer reads as provenance.
     */
    const lineage = session.snapshot.lineage;
    const clonedName =
      lineage !== undefined && detail.detail?.slug === lineage.templateSlug
        ? detail.detail.name
        : null;

    return (
      <StudioStageScreen
        areaLimits={areaLimits.current}
        isResuming={session.isResuming}
        onResume={session.resume}
        scope={session.scope}
        snapshot={session.snapshot}
        templateName={clonedName}
      />
    );
  }

  // No Side at all is a Product with no placement to work on and nowhere else to
  // go, which is the same closed state as `studioEligible === false`. A Side
  // with no Area is not: that one keeps the screen open, below.
  if (!eligible || side === undefined) return <StudioUnavailable reason="ineligible" />;

  return (
    <div className="studio">
      <p className="studio__intro">
        {STUDIO_COPY.introPrefix} <strong>{productName}</strong>
      </p>

      <StudioPlacementPicker
        onSelectArea={(areaId) => {
          dispatch({ type: 'select-area', placement, areaId });
        }}
        onSelectSide={(sideId) => {
          dispatch({ type: 'select-side', placement, sideId });
        }}
        placement={placement}
        selection={selection}
      />

      {codes === undefined ? (
        /*
         * The selected Side carries no Area, so the placement chain is
         * incomplete and everything downstream of it is simply **absent** —
         * no Template section, no preview, no Blank or Clone action. Absent
         * rather than disabled: there is no affordance here to mis-click, and
         * no request that could be made without a triple to address it with.
         *
         * The Product is not declared unavailable. The Side selector above is
         * untouched, so the visitor moves to another Side themselves; nothing
         * moves them.
         */
        <p className="studio__notice" role="status">
          {STUDIO_COPY.sideWithoutArea}
          <span className="studio__notice-hint">{STUDIO_COPY.sideWithoutAreaHint}</span>
        </p>
      ) : (
        <>
          <section className="studio__templates" aria-labelledby="studio-templates-heading">
            <h2 className="studio__section-heading" id="studio-templates-heading">
              {STUDIO_COPY.templateHeading}
            </h2>
            <StudioTemplatePicker
              list={list}
              onSelect={(templateSlug) => {
                dispatch({ type: 'select-template', templateSlug });
              }}
              selectedSlug={liveTemplateSlug}
            />
          </section>

          {selection.templateSlug === null ? null : (
            <section className="studio__preview" aria-labelledby="studio-preview-heading">
              <h2 className="studio__section-heading" id="studio-preview-heading">
                {STUDIO_COPY.previewHeading}
              </h2>
              <StudioTemplatePreview
                detail={detail}
                isTextOnly={detail.detail !== undefined && previewReference === undefined}
                preview={preview}
              />
            </section>
          )}

          <StudioStartActions
            canStart
            onStartBlank={() => {
              session.startBlank(codes);
            }}
            onStartClone={() => {
              if (liveTemplateSlug !== null) session.startClone(codes, liveTemplateSlug);
            }}
            selectedTemplateSlug={liveTemplateSlug}
            session={session}
          />
        </>
      )}
    </div>
  );
}
