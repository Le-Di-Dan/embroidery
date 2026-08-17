import type { AdminRequestModerationNoteResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { noteKindLabel, presentInstant } from '../model/request-detail-presentation';

interface RequestNoteHistoryProps {
  readonly notes: readonly AdminRequestModerationNoteResponse[];
}

/**
 * The internal moderation notes (`670:148`).
 *
 * Rendered as a separate record from the transition history, because they are
 * one: a note explains a decision, it is not itself a state change, and merging
 * the two lists would put entries with no `fromStatus` into a lifecycle
 * timeline.
 *
 * ### Append-only, and it looks append-only
 *
 * No edit control and no delete control, because `APP5-B05` publishes no route
 * for either — a changed decision is a new note. The panel says so out loud
 * rather than leaving an operator hunting for the pencil icon.
 *
 * ### Internal means internal
 *
 * A note is never shown to the customer and never presented here as if it were
 * customer communication. That distinction is stated in the panel, because the
 * same screen also collects customer-visible text a few inches away, and an
 * operator who confuses the two writes a private assessment into a message the
 * customer reads.
 *
 * The order, the sequence, the author and the timestamp are all the server's.
 */
export function RequestNoteHistory({ notes }: RequestNoteHistoryProps) {
  return (
    <section className="request-detail__panel" aria-labelledby="request-notes-heading">
      <h2 className="request-detail__panel-title" id="request-notes-heading">
        {COPY.sections.notes}
      </h2>
      <p className="request-detail__hint">{COPY.notes.internalOnly}</p>

      {notes.length === 0 ? (
        <p className="request-detail__hint" data-testid="request-notes-empty">
          {COPY.notes.empty}
        </p>
      ) : (
        <ol className="request-timeline" data-testid="request-notes">
          {notes.map((note) => (
            <li className="request-timeline__entry" key={note.sequence}>
              <p className="request-timeline__headline">
                <span className="request-timeline__sequence">
                  {`${COPY.history.sequence} ${String(note.sequence)}`}
                </span>
                <span className="request-timeline__kind" data-note-kind={note.kind}>
                  {noteKindLabel(note)}
                </span>
              </p>
              <p className="request-timeline__note">{note.note}</p>
              <p className="request-timeline__meta">
                {`${COPY.notes.author} · ${presentInstant(note.createdAt)}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      <p className="request-detail__hint">{COPY.notes.appendOnly}</p>
    </section>
  );
}
