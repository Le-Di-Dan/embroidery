'use client';

/**
 * The save-state surface (`APP3-S10`) — `610:3`, `610:41`, `610:77`, `610:118`.
 *
 * ## Why one region, above the stage, at every tier
 *
 * The approved 1440 frames draw the state as a panel on the right. Two of the
 * four states it carries are **decisions**: a conflict where the customer
 * chooses which of two documents survives, and a failure where their only unsaved
 * work is in this tab. At 1024 the one accepted right-hand region is a drawer
 * that is closed by default (`618:140`), so honouring the drawn side would put a
 * decision about losing work behind a toggle — and at 390 there is no right-hand
 * region at all.
 *
 * So this sits in the frame's own column, directly under the topbar, at every
 * tier. It is one region, not a second competing right-side one, and it is
 * always visible. The deviation is from *placement*, and it is recorded rather
 * than taken quietly.
 *
 * ## Two choices in a conflict, and never a third
 *
 * `610:118` authorizes exactly `Tải bản mới nhất` and `Giữ bản trên màn hình`.
 * There is no merge, no "save mine as a copy" and no automatic resolution: the
 * server is left untouched until the customer says which document is the design.
 */
import { useEffect, useId, useRef } from 'react';

import type { UseStudioAutosaveResult } from '../hooks/use-studio-autosave';
import { STUDIO_SAVE_COPY } from '../model/studio-autosave-copy';

export interface StudioSaveStateProps {
  readonly save: UseStudioAutosaveResult;
}

export function StudioSaveState({ save }: StudioSaveStateProps) {
  const headingId = useId();
  const region = useRef<HTMLElement | null>(null);

  const conflict = save.state === 'CONFLICT';
  const failed = save.failure !== null && !conflict && save.state !== 'EXPIRED';
  const decision = conflict || failed;

  /*
   * Focus moves into a decision, once.
   *
   * A customer working with the keyboard is somewhere on the stage when a save
   * fails or a conflict appears, and the region that asks them to choose is
   * above it — reachable only by tabbing backwards past everything. Focus is
   * moved when the decision *appears* and never afterwards, so it cannot be
   * stolen mid-edit by a retry that fails again into the same state.
   */
  useEffect(() => {
    if (!decision || save.dismissed) return;
    region.current?.focus();
  }, [decision, save.dismissed]);

  // Dismissed by `Tiếp tục thiết kế`: the message goes, the truth stays. The
  // chip still reports the failure and the navigation warning is still armed.
  if (decision && save.dismissed) return null;
  if (save.state === 'EXPIRED') return null;

  const content = conflict
    ? {
        heading: STUDIO_SAVE_COPY.conflictHeading,
        body: STUDIO_SAVE_COPY.conflictBody,
        note: null,
      }
    : failed
      ? {
          heading:
            save.failure === 'ambiguous'
              ? STUDIO_SAVE_COPY.offlineHeading
              : STUDIO_SAVE_COPY.failedHeading,
          body:
            save.failure === 'ambiguous'
              ? STUDIO_SAVE_COPY.offlineBody
              : STUDIO_SAVE_COPY.failedBody,
          note: save.retryPending ? STUDIO_SAVE_COPY.offlineNote : null,
        }
      : save.state === 'SAVING'
        ? {
            heading: STUDIO_SAVE_COPY.savingHeading,
            body: STUDIO_SAVE_COPY.savingBody,
            note: null,
          }
        : save.state === 'CLEAN'
          ? {
              heading: STUDIO_SAVE_COPY.savedHeading,
              body: STUDIO_SAVE_COPY.savedBody,
              note: null,
            }
          : null;

  // `DIRTY` and `RECONCILING` with nothing wrong draw no surface: the chip has
  // already said the design is not saved yet, and a panel repeating it on every
  // edit would be noise the frames do not draw.
  if (content === null) return null;

  return (
    <section
      className={`studio-save${decision ? ' studio-save--decision' : ''}`}
      data-testid="studio-save-state"
      data-state={save.state}
      aria-labelledby={headingId}
      ref={region}
      tabIndex={-1}
    >
      <h2 className="studio-save__heading" id={headingId}>
        {content.heading}
      </h2>
      <p className="studio-save__body">{content.body}</p>
      {content.note === null ? null : <p className="studio-save__note">{content.note}</p>}

      {conflict ? (
        <div className="studio-save__actions">
          <button
            className="studio-button studio-button--primary"
            data-testid="studio-save-load-latest"
            onClick={save.loadLatest}
            type="button"
          >
            {STUDIO_SAVE_COPY.conflictLoadLatest}
          </button>
          <button
            className="studio-button"
            data-testid="studio-save-keep-local"
            onClick={save.keepLocal}
            type="button"
          >
            {STUDIO_SAVE_COPY.conflictKeepLocal}
          </button>
          {/* What each choice costs, before it is made. One of the two documents
              is going to be the one that survives. */}
          <p className="studio-save__note">
            {STUDIO_SAVE_COPY.conflictLoadLatestNote} {STUDIO_SAVE_COPY.conflictKeepLocalNote}
          </p>
        </div>
      ) : null}

      {failed ? (
        <div className="studio-save__actions">
          <button
            className="studio-button studio-button--primary"
            data-testid="studio-save-retry"
            onClick={save.retry}
            type="button"
          >
            {STUDIO_SAVE_COPY.offlineRetry}
          </button>
          <button
            className="studio-button"
            data-testid="studio-save-dismiss"
            onClick={save.dismiss}
            type="button"
          >
            {STUDIO_SAVE_COPY.offlineDismiss}
          </button>
        </div>
      ) : null}
    </section>
  );
}
