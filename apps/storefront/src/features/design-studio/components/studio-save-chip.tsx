'use client';

/**
 * The save chip in the Studio topbar (`APP3-S10`, `610:3` and `610:41`).
 *
 * ## The time is the server's, or there is no time
 *
 * `610:3` draws `Đã lưu · lúc 14:03`. That timestamp is rendered only from an
 * actual successful response or an authoritative read — never from the moment a
 * request was *sent*, and never from a clock consulted because a chip has a slot
 * for one. A Session that has not saved since it opened is genuinely saved (the
 * server holds its bootstrap document) and shows no time, which is the truthful
 * answer rather than a fabricated one.
 *
 * The time is composed from the local `Date` rather than a locale formatter, so
 * the string is `HH:MM` on every machine and in every test, and carries no date,
 * no seconds and no timezone — none of which the frame draws.
 *
 * ## Not colour alone
 *
 * Every state has a **word**. The tone modifier changes the colour as well, but
 * a customer who cannot distinguish the colours reads exactly the same six
 * distinct sentences, and a screen reader announces the change because the chip
 * is a live region.
 */
import { saveToneOf, type StudioSaveFailure, type StudioSaveState } from '../model/studio-autosave';
import { STUDIO_SAVE_COPY } from '../model/studio-autosave-copy';

export interface StudioSaveChipProps {
  readonly state: StudioSaveState;
  readonly failure: StudioSaveFailure | null;
  readonly lastSavedAt: number | null;
}

const TONE_LABEL = {
  saved: STUDIO_SAVE_COPY.chipSaved,
  saving: STUDIO_SAVE_COPY.chipSaving,
  dirty: STUDIO_SAVE_COPY.chipDirty,
  offline: STUDIO_SAVE_COPY.chipOffline,
  conflict: STUDIO_SAVE_COPY.chipConflict,
  failed: STUDIO_SAVE_COPY.chipFailed,
} as const;

function clockOf(at: number): string {
  const moment = new Date(at);
  const hours = String(moment.getHours()).padStart(2, '0');
  const minutes = String(moment.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function StudioSaveChip({ state, failure, lastSavedAt }: StudioSaveChipProps) {
  const tone = saveToneOf(state, failure);
  // Only the saved state carries a time, and only when one was really recorded.
  const at = tone === 'saved' && lastSavedAt !== null ? clockOf(lastSavedAt) : null;

  return (
    <p
      className={`studio-save-chip studio-save-chip--${tone}`}
      data-testid="studio-save-chip"
      data-tone={tone}
      aria-label={STUDIO_SAVE_COPY.chipLabel}
      role="status"
    >
      <span className="studio-save-chip__state">{TONE_LABEL[tone]}</span>
      {at === null ? null : (
        <span className="studio-save-chip__at" data-testid="studio-save-chip-at">
          {STUDIO_SAVE_COPY.chipSavedAtPrefix} {at}
        </span>
      )}
    </p>
  );
}
