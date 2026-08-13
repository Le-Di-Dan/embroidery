'use client';

import { useEffect, useReducer, useRef } from 'react';

import { useStudioPlacement } from '../hooks/use-studio-placement';
import { useStudioResume } from '../hooks/use-studio-resume';
import { useStudioSession } from '../hooks/use-studio-session';
import { useTemplateDetail } from '../hooks/use-template-detail';
import { useTemplateList } from '../hooks/use-template-list';
import { useTemplatePreview } from '../hooks/use-template-preview';
import { STUDIO_COPY } from '../model/studio-copy';
import { codesOf, findArea, findSide, tripleOf } from '../model/studio-placement';
import { resumedScopeOf } from '../model/studio-resume-scope';
import { EMPTY_STUDIO_SELECTION, studioSelectionReducer } from '../model/studio-selection';
import { areaLimitsOf, type StudioAreaLimits } from '../model/studio-transform-authority';
import { previewReferenceOf } from '../model/studio-template';
import { StudioPlacementPicker } from './studio-placement-picker';
import { StudioResumePrompt } from './studio-resume-prompt';
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

  /*
   * The resume handle for the placement currently on screen (`APP3-S10`).
   *
   * Namespaced by `product → side → area`, so it is found only under the exact
   * placement it was written for: a Session opened on one Area is not offered as
   * the resumable design of another, where its coordinates would mean something
   * else. `undefined` until the placement chain resolves, which is also the
   * moment the namespace can first be composed.
   */
  const resume = useStudioResume(productSlug, codes?.sideCode, codes?.areaCode);
  const { forget: forgetSession, remember: rememberSession } = resume;

  // A Session that exists is a Session worth remembering — created or resumed,
  // and only ever its **id**. Writing it here rather than at the create call
  // covers both, and covers a resume that returned a Session this browser had
  // stopped holding.
  const openSessionId = session.snapshot?.sessionId ?? null;
  useEffect(() => {
    if (openSessionId !== null) rememberSession(openSessionId);
  }, [openSessionId, rememberSession]);

  // A dead Session must not be offered again after a reload. The handle for this
  // placement — and no other — is dropped the moment the server refuses it.
  const sessionExpired = session.isExpired;
  useEffect(() => {
    if (sessionExpired) forgetSession();
  }, [forgetSession, sessionExpired]);

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
    // Both ways forward return to the accepted `APP3-S01` start path; neither
    // opens a Session by itself, and nothing tries to revive the dead one.
    return (
      <StudioSessionExpired
        onPickTemplate={() => {
          // Back to the picker with nothing chosen, so "chọn mẫu khác" really is
          // a fresh choice rather than the same screen under a second label.
          session.restart();
          dispatch({ type: 'clear-template' });
        }}
        onRestart={session.restart}
      />
    );
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

    /*
     * The placement geometry, for a Session that was resumed rather than created.
     *
     * `APP3-B07` returns `scope` on create and omits it on resume, so a Session
     * reopened from a stored handle after a full reload arrives without the
     * geometry the stage draws from. It is composed from the manifest this screen
     * already holds — the same rows the server itself resolved — and only for the
     * placement the handle was namespaced to, which is the placement on screen.
     * Nothing is computed, scaled or defaulted: every field is copied.
     */
    const stageScope =
      session.scope ??
      (side === undefined || area === undefined ? null : resumedScopeOf(productSlug, side, area));

    return (
      <StudioStageScreen
        areaLimits={areaLimits.current}
        isResuming={session.isResuming}
        onExpired={session.expire}
        onResume={session.resume}
        scope={stageScope}
        snapshot={session.snapshot}
        templateName={clonedName}
      />
    );
  }

  /*
   * The approved resume state (`APP3-S10`, `610:159`).
   *
   * Shown *before* the picker, and before anything is opened: a stored handle
   * says a Session exists on this placement, not that the customer wants to be
   * back inside it. Neither answer is taken for them.
   */
  if (resume.offered && resume.handle !== null) {
    const handle = resume.handle;
    return (
      <StudioResumePrompt
        hasFailed={session.hasResumeFailed}
        isResuming={session.isResuming}
        onContinue={() => {
          session.resumeById(handle);
        }}
        onRestart={resume.forget}
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
