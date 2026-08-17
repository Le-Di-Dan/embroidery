'use client';

import { useEffect, useState } from 'react';

import { useModerationMutation } from '../hooks/use-moderation-mutation';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { buildAppendNoteBody, validateStandaloneNote } from '../model/moderation-command';
import { appendModerationNote } from '../services/custom-request-moderation.service';
import { ModerationTextArea } from './moderation-text-area';

interface ModerationNoteFormProps {
  readonly requestId: string;
}

/**
 * Appending one standalone internal note (`FIG-APP5-A02-NOTE-APPEND`, `670:148`).
 *
 * ### It sends a note and nothing else
 *
 * `AppendModerationNoteBody` has two members — the kind and the text. There is
 * no client note id, no author and no timestamp, because the operator, the
 * sequence and the instant are all derived server-side. The request does not
 * move: appending a note raises no transition and no notification.
 *
 * ### Always `NOTE`
 *
 * A freeform note written while reading a request is an observation, not a
 * decision. `CLARIFY`, `REJECT` and `SPAM` are written by the dialogs that
 * actually perform those transitions, and offering them here would let an
 * operator file a rejection verdict against a request that was never rejected.
 *
 * After a successful append the detail is re-read, so what appears is the
 * persisted note in the server's own sequence — never a local echo of what was
 * typed.
 */
export function ModerationNoteForm({ requestId }: ModerationNoteFormProps) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const command = useModerationMutation({ requestId, send: appendModerationNote });
  const outcomeKind = command.outcome.kind;
  const succeeded = outcomeKind === 'success';

  // Cleared on success only. A failed append keeps the text: the note was never
  // recorded, and making the operator retype it is how an observation is lost.
  useEffect(() => {
    if (succeeded) setNote('');
  }, [succeeded]);

  const submit = () => {
    if (command.running) return;
    const found = validateStandaloneNote(note);
    setError(found);
    if (found !== undefined) return;
    command.run(buildAppendNoteBody(note));
  };

  const announcement = command.running
    ? COPY.notes.addSubmitting
    : succeeded
      ? COPY.notes.added
      : '';

  return (
    <section className="request-detail__panel" aria-labelledby="request-note-form-heading">
      <h2 className="request-detail__panel-title" id="request-note-form-heading">
        {COPY.notes.addHeading}
      </h2>

      <ModerationTextArea
        label={COPY.notes.addLabel}
        value={note}
        onChange={(next) => {
          setNote(next);
          if (error !== undefined) setError(undefined);
        }}
        help={COPY.notes.internalOnly}
        disabled={command.running}
        testId="moderation-note-input"
        {...(error === undefined ? {} : { error })}
      />

      <div className="moderation-note-form__actions">
        <button
          type="button"
          className="moderation-note-form__submit"
          disabled={command.running}
          data-testid="moderation-note-submit"
          onClick={submit}
        >
          {command.running ? COPY.notes.addSubmitting : COPY.notes.addSubmit}
        </button>
      </div>

      <p className="request-detail__sr-status" role="status" aria-live="polite">
        {announcement}
      </p>

      {command.outcome.kind === 'failure' ? (
        <p className="moderation-note-form__failure" role="alert" data-testid="note-failure">
          {COPY.outcome.failureHeading}
        </p>
      ) : null}

      {command.outcome.kind === 'conflict' ? (
        <p className="moderation-note-form__failure" role="alert" data-testid="note-conflict">
          {COPY.outcome.conflictHeading}
        </p>
      ) : null}
    </section>
  );
}
