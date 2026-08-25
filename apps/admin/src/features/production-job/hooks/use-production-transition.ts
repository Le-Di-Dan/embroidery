'use client';

/**
 * One transition dialog's whole interaction: what was confirmed, what was sent,
 * what came back, and what the screen is allowed to believe afterwards
 * (`786:3` … `786:202`, `787:149`).
 *
 * ### Four phases, and the server decides every move between them
 *
 * `form` → `submitting` → (dialog closes on success) | `refused`.
 *
 * Nothing advances optimistically. The status pill, the timestamps, the history
 * and the reservation rows all keep showing the last **read** truth while a
 * command is in flight, and they change only after the authoritative re-read
 * lands (`786:197`). There is no local lifecycle state machine mirroring LC-18
 * anywhere in this feature.
 *
 * ### A refusal reloads truth and never resends
 *
 * `787:149` fixes the sequence: submit → refuse → one focused message → reload
 * job truth → recompute available actions. This hook implements exactly that.
 * There is no retry loop, no backoff and no automatic second attempt in any
 * branch — including the ambiguous one, where the command may already have
 * committed and a resend would be a second command against a job that moved.
 *
 * ### The reason is validated locally only to avoid a certain refusal
 *
 * A blank or whitespace-only cancellation reason is blocked in place and no
 * request is issued (`786:171`). That is not the client claiming authority: the
 * server validates every submitted transition regardless, and this check only
 * declines to send a command whose sole possible outcome is a `400`.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AdminProductionTransitionResultResponse } from '@embroidery/api-client';

import {
  validateCancellationReason,
  type CancellationReasonError,
} from '../model/cancellation-reason';
import {
  requiresCancellationReason,
  type ProductionJobAction,
} from '../model/production-job-actions';
import {
  classifyProductionTransitionRefusal,
  preservesCancellationReason,
  type ProductionTransitionRefusal,
} from '../model/production-job-failure';
import {
  cancelProductionBody,
  completeProductionBody,
  startProductionBody,
  submitProductionTransition,
} from '../services/production-transition.service';
import { useProductionJobRefresh } from './use-production-job-query';

export type ProductionTransitionPhase = 'form' | 'submitting' | 'refused';

export interface ProductionTransitionController {
  readonly phase: ProductionTransitionPhase;
  readonly reason: string;
  readonly reasonError: CancellationReasonError | null;
  readonly refusal: ProductionTransitionRefusal | null;
  readonly setReason: (value: string) => void;
  readonly submit: () => void;
  /** Returns from a refusal to the form, with the typed reason where it survives. */
  readonly dismissRefusal: () => void;
}

export interface UseProductionTransitionInput {
  readonly jobId: string;
  readonly action: ProductionJobAction;
  /** Called once the command committed **and** the authoritative re-read landed. */
  readonly onCommitted: (result: AdminProductionTransitionResultResponse) => void;
}

export function useProductionTransition({
  jobId,
  action,
  onCommitted,
}: UseProductionTransitionInput): ProductionTransitionController {
  const { refreshJob, refreshJobAndQueue } = useProductionJobRefresh(jobId);

  const [reason, setReasonValue] = useState('');
  const [reasonError, setReasonError] = useState<CancellationReasonError | null>(null);
  const [refusal, setRefusal] = useState<ProductionTransitionRefusal | null>(null);

  const mutation = useMutation({
    mutationFn: submitProductionTransition,
    // No retry. A resend is a second command against a job whose state may
    // already have moved, and `APP8-B04` publishes no idempotency key.
    retry: false,
  });

  const setReason = useCallback((value: string) => {
    setReasonValue(value);
    setReasonError(null);
  }, []);

  const dismissRefusal = useCallback(() => {
    setRefusal(null);
  }, []);

  const submit = useCallback(() => {
    // The duplicate-submit guard. The button is disabled while in flight, but a
    // keyboard submit or a double-fire must not reach the wire either: this
    // command consumes stock and moves an order, and sending it twice is two
    // commands, not one.
    if (mutation.isPending) return;

    let body;
    if (requiresCancellationReason(action)) {
      const validation = validateCancellationReason(reason);
      if (!validation.ok) {
        setReasonError(validation.error);
        return;
      }
      body = cancelProductionBody(validation.reason);
    } else {
      body = action === 'start' ? startProductionBody() : completeProductionBody();
    }

    setReasonError(null);
    setRefusal(null);

    mutation.mutate(
      { jobId, body },
      {
        onSuccess: (result) => {
          // The receipt is evidence, not the new screen state: the detail is
          // re-read and the queue that lists this job invalidated before the
          // caller is told the move landed.
          void refreshJobAndQueue().then(() => {
            onCommitted(result);
          });
        },
        onError: (error: unknown) => {
          const classified = classifyProductionTransitionRefusal(error);
          if (!preservesCancellationReason(classified)) setReasonValue('');
          setRefusal(classified);
          // Step 4 of `787:149`: whatever the refusal was, the screen no longer
          // knows the job's state, so it reads it again. This never resends the
          // command — it is a `GET`.
          void refreshJob();
        },
      },
    );
  }, [action, jobId, mutation, onCommitted, reason, refreshJob, refreshJobAndQueue]);

  const phase: ProductionTransitionPhase = mutation.isPending
    ? 'submitting'
    : refusal !== null
      ? 'refused'
      : 'form';

  return { phase, reason, reasonError, refusal, setReason, submit, dismissRefusal };
}
