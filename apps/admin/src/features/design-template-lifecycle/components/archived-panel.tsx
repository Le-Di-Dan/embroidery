'use client';

import { formatDate } from '../../../shared/presentation/instant';
import { LIFECYCLE_COPY, withValue } from '../model/lifecycle-copy';

interface ArchivedPanelProps {
  readonly name: string;
  /** The current archive marker. Cleared by restore, so it is gone afterwards. */
  readonly archivedAt: string | undefined;
  readonly busy: boolean;
  readonly onRestore: () => void;
}

/**
 * The `ARCHIVED` state, and the one command that leaves it.
 *
 * The design frame for this state was drawn while restore was
 * `BLOCKED_BY_APP3-B04A` and showed the control disabled with that annotation.
 * `APP3-B04A` is accepted, so the runtime control is **live** — the annotation
 * was provenance about a dependency, not a design decision about the button.
 *
 * The archive **reason** is deliberately not rendered. It is written to the
 * audit trail and no accepted Admin read publishes it, so showing one would mean
 * inventing a source. The caption says where it lives instead.
 */
export function ArchivedPanel({ name, archivedAt, busy, onRestore }: ArchivedPanelProps) {
  const copy = LIFECYCLE_COPY.archived;
  const archivedDate = archivedAt === undefined ? null : formatDate(archivedAt);

  return (
    <section className="template-lifecycle-archived" aria-labelledby="lifecycle-archived-title">
      <h2 className="template-lifecycle-archived__title" id="lifecycle-archived-title">
        {copy.title}
      </h2>
      <p className="template-lifecycle-archived__heading">{withValue(copy.heading, name)}</p>
      <p className="template-lifecycle-archived__body">
        {archivedDate === null ? copy.bodyNoDate : withValue(copy.body, archivedDate)}
      </p>
      <p className="template-lifecycle-archived__note">{copy.reasonNote}</p>
      <button
        type="button"
        className="template-lifecycle-archived__restore"
        data-testid="lifecycle-restore"
        disabled={busy}
        onClick={onRestore}
      >
        {busy ? LIFECYCLE_COPY.outcome.working : copy.restore}
      </button>
      <p className="template-lifecycle-archived__note">{copy.restoreNote}</p>
    </section>
  );
}
