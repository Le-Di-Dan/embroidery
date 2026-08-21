'use client';

/**
 * Creating the first quotation, and appending every later version
 * (`APP6-A01` §10, §11).
 *
 * One hook serves both writes because their lifecycle is identical — in flight,
 * settled, refused — and only the address differs. The create path additionally
 * has to *discover* an id; the append path already has one.
 *
 * ### Nothing retries, and nothing double-fires
 *
 * `retry: false` covers the library. The `inFlight` ref covers the operator: a
 * `disabled` attribute is one render behind a fast double-click, so the second
 * click reaches the handler with the button still enabled. The ref is read and
 * set synchronously in the same tick, which is the only guard ahead of the
 * event.
 *
 * ### `QUOTATION_ALREADY_EXISTS` is recovered, not reported and abandoned
 *
 * Another tab or another operator created the quotation first. The response is
 * to re-read the request detail, take the durable locator from it, and load the
 * history — so the operator lands on the quotation that exists instead of being
 * stranded on a form that will never submit. The id is **never** parsed out of
 * the error: an error code is not an address.
 *
 * ### Success is never assumed
 *
 * The receipt's `quotationId` is used to *address* the next reads, and the
 * screen still renders what those reads return. No amount from the receipt is
 * written into the history cache.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AddQuotationVersionBody, CreateQuotationDraftBody } from '@embroidery/api-client';

import {
  classifyDraftingFailure,
  preservesDraftFields,
  type DraftingFailure,
} from '../model/request-quotation-failure';
import { addQuotationVersion, createQuotation } from '../services/request-quotation.service';
import { useQuotationRefresh } from './use-quotation-refresh';

export type DraftingOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly versionId: string }
  | { readonly kind: 'reconciled' }
  | { readonly kind: 'failure'; readonly failure: DraftingFailure };

export interface DraftingState {
  readonly running: boolean;
  readonly outcome: DraftingOutcome;
  /** True exactly when the operator's typed figures should stay on screen. */
  readonly keepEnteredFields: boolean;
  readonly createFirst: (body: CreateQuotationDraftBody) => void;
  readonly addVersion: (quotationId: string, body: AddQuotationVersionBody) => void;
  readonly reset: () => void;
}

interface UseQuotationDraftingInput {
  readonly requestId: string;
  /**
   * Called once a write has settled, so the screen can drop a manual version
   * pick and fall back to the newest DRAFT — which is the version just created.
   * It carries no id: the durable one arrives through the context re-read below,
   * and passing it here would invite a caller to treat it as the locator.
   */
  readonly onDraftSettled: () => void;
}

type DraftingCommand =
  | { readonly mode: 'create'; readonly body: CreateQuotationDraftBody }
  | {
      readonly mode: 'append';
      readonly quotationId: string;
      readonly body: AddQuotationVersionBody;
    };

export function useQuotationDrafting({
  requestId,
  onDraftSettled,
}: UseQuotationDraftingInput): DraftingState {
  const { refreshContext, refreshQuotation } = useQuotationRefresh(requestId);
  const [outcome, setOutcome] = useState<DraftingOutcome>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (command: DraftingCommand) =>
      command.mode === 'create'
        ? createQuotation(command.body)
        : addQuotationVersion(command.quotationId, command.body),
  });

  const settle = useCallback((next: DraftingOutcome) => {
    inFlight.current = false;
    setRunning(false);
    setOutcome(next);
  }, []);

  const run = useCallback(
    (command: DraftingCommand) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setRunning(true);
      setOutcome({ kind: 'idle' });

      mutation.mutate(command, {
        onSuccess: (receipt) => {
          onDraftSettled();
          // The context re-read is what makes the new DRAFT survive a reload:
          // until it lands, `quotationId` is only in memory.
          void (async () => {
            await refreshContext();
            await refreshQuotation(receipt.quotationId);
            settle({ kind: 'success', versionId: receipt.versionId });
          })();
        },
        onError: (error: unknown) => {
          const failure = classifyDraftingFailure(error);
          if (failure !== 'exists') {
            settle({ kind: 'failure', failure });
            return;
          }
          // Someone won the race. Re-read the locator rather than parse the
          // refusal, and hand the screen whatever the server says exists.
          void (async () => {
            await refreshContext();
            settle({ kind: 'reconciled' });
          })();
        },
      });
    },
    [mutation, onDraftSettled, refreshContext, refreshQuotation, settle],
  );

  const createFirst = useCallback(
    (body: CreateQuotationDraftBody) => {
      run({ mode: 'create', body });
    },
    [run],
  );

  const addVersion = useCallback(
    (quotationId: string, body: AddQuotationVersionBody) => {
      run({ mode: 'append', quotationId, body });
    },
    [run],
  );

  const reset = useCallback(() => {
    if (inFlight.current) {
      return;
    }
    setOutcome({ kind: 'idle' });
  }, []);

  return {
    running,
    outcome,
    keepEnteredFields:
      outcome.kind === 'failure' ? preservesDraftFields(outcome.failure) : outcome.kind === 'idle',
    createFirst,
    addVersion,
    reset,
  };
}
