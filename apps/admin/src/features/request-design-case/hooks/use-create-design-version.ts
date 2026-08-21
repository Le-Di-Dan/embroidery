'use client';

/**
 * Appending one new DRAFT version (`APP6-A02` §16).
 *
 * ### History is append-only, and this is the only way to add to it
 *
 * There is no update-version API and this hook offers no `update`. Every save
 * that becomes persisted formal history is a **new** version; a previously
 * persisted DRAFT stays exactly as it was. Nothing here edits a row, and nothing
 * here can: the create operation is the whole of its surface.
 *
 * ### The body carries only what a caller may supply
 *
 * The document, and — on the customer-owned branch — the two agreed placement
 * labels and the positive envelope. The request id, the design case, the branch,
 * the Catalog quartet, the status, the version number, the parent and the hash
 * are server-owned, and `APP6-B08`'s schema is `.strict()`: sending one is a
 * refusal naming the unrecognised key, not a silently ignored field. So the
 * screen never assembles one.
 *
 * ### Nothing double-fires
 *
 * The same `inFlight` ref the send uses, for the same reason: a double-click
 * reaches the handler one render before `disabled` applies, and two creates
 * would append two versions to history — a duplicate the server has no reason to
 * refuse, because both are legitimate.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AuthorDesignVersionBody } from '@embroidery/api-client';

import {
  classifyAuthoringFailure,
  type AuthoringFailure,
} from '../model/request-design-case-failure';
import { createDesignVersion } from '../services/request-design-case.service';
import { useDesignCaseRefresh } from './use-design-case-refresh';

export type CreateOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'created'; readonly versionId: string }
  | { readonly kind: 'failure'; readonly failure: AuthoringFailure };

export interface CreateState {
  readonly running: boolean;
  readonly outcome: CreateOutcome;
  readonly run: (body: AuthorDesignVersionBody) => void;
  readonly reset: () => void;
}

interface UseCreateDesignVersionInput {
  readonly requestId: string;
  /** Points the screen at the version the server just created. */
  readonly onVersionCreated: (versionId: string) => void;
}

export function useCreateDesignVersion({
  requestId,
  onVersionCreated,
}: UseCreateDesignVersionInput): CreateState {
  const { refreshAll } = useDesignCaseRefresh(requestId);
  const [outcome, setOutcome] = useState<CreateOutcome>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: (body: AuthorDesignVersionBody) => createDesignVersion({ requestId, body }),
  });

  const settle = useCallback((next: CreateOutcome) => {
    inFlight.current = false;
    setRunning(false);
    setOutcome(next);
  }, []);

  const run = useCallback(
    (body: AuthorDesignVersionBody) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setRunning(true);
      setOutcome({ kind: 'idle' });

      mutation.mutate(body, {
        onSuccess: (result) => {
          void (async () => {
            // The list is re-read rather than appended to: the response is a
            // receipt for one row, while the list is the history authority and
            // knows where the new version sits and which pointer now names it.
            await refreshAll();
            onVersionCreated(result.version.versionId);
            settle({ kind: 'created', versionId: result.version.versionId });
          })();
        },
        onError: (error: unknown) => {
          const failure = classifyAuthoringFailure(error);
          if (failure !== 'ineligible') {
            settle({ kind: 'failure', failure });
            return;
          }
          // The request left its authoring states under the operator. Re-read
          // before reporting, so the gate and the action matrix describe what is
          // now true rather than what was true when the dialog opened.
          void (async () => {
            await refreshAll();
            settle({ kind: 'failure', failure });
          })();
        },
      });
    },
    [mutation, onVersionCreated, refreshAll, settle],
  );

  const reset = useCallback(() => {
    if (inFlight.current) {
      return;
    }
    setOutcome({ kind: 'idle' });
  }, []);

  return { running, outcome, run, reset };
}
