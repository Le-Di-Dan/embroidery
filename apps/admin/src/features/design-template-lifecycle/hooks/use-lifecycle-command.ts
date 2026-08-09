'use client';

/**
 * The one place a lifecycle command is sent, and the only place a conflict is
 * resolved.
 *
 * Three rulings live here.
 *
 * **Success is server truth.** Every command answers with the authoritative
 * Template detail, so the response is written straight into the detail cache and
 * the list root is invalidated. Nothing is flipped optimistically, no version is
 * incremented locally, and no redundant detail GET follows — the answer is
 * already complete, and asking again would only widen the window in which the
 * screen shows something the server did not say.
 *
 * **A conflict is never replayed.** `retry: false`, and a 409 triggers exactly
 * **one** authoritative re-read whose result replaces the cache. The available
 * actions are then recomputed from the returned status and version, so the
 * operator chooses again from what is true now rather than from what they saw a
 * moment ago. A blind replay is how an unpublish lands on a Template someone
 * else already archived.
 *
 * **A stale reason is a void confirmation.** When a conflict interrupts an
 * archive or a restore, the dialog closes and the typed reason is discarded. The
 * operator agreed to retire *that* Template in *that* state; after the state
 * moved, reusing their sentence would be putting words in their mouth — and the
 * reason is written verbatim into the audit trail.
 *
 * A publish refusal (422) deliberately does **not** re-read: `APP3-B04`
 * guarantees the guard is read-only and writes nothing, so a refetch would
 * discard a perfectly current entry and imply something moved when nothing did.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { designTemplateEditorKeys } from '../../design-template-editor';
import { designTemplateQueryKeys } from '../../design-templates';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import {
  classifyLifecycleFailure,
  requiresAuthoritativeReread,
  type LifecycleFailure,
} from '../model/lifecycle-failure';
import { requiresReason, type LifecycleAction } from '../model/lifecycle-actions';
import {
  fetchLifecycleDetail,
  sendLifecycleCommand,
} from '../services/design-template-lifecycle.service';

export interface LifecycleCommandRequest {
  readonly action: LifecycleAction;
  readonly expectedCurrentVersion: number;
  readonly reason?: string;
}

export interface LifecycleCommandState {
  /** The action in flight, or `null`. Drives the busy state on one button only. */
  readonly running: LifecycleAction | null;
  /** The last successful transition, for the polite live announcement. */
  readonly outcome: LifecycleAction | null;
  readonly failure: LifecycleFailure | null;
  /** True when a conflict discarded a reason the operator had already typed. */
  readonly reasonInvalidated: boolean;
  readonly run: (request: LifecycleCommandRequest) => void;
  readonly dismissFailure: () => void;
}

export function useLifecycleCommand(
  templateId: string,
  /**
   * Called once a command has settled, with whether its dialog should **stay
   * open**.
   *
   * Named for what the caller does with it rather than for the outcome. It was
   * `ok` first, and the screen read the same boolean as "keep open" — so a
   * successful publish reported `true` and left its confirmation on screen over
   * an already-published Template. A parameter whose two readings are exact
   * opposites is a defect waiting for a browser to find it, which is where this
   * one was found.
   *
   * Only a rejected *body* keeps the dialog open, because that is the one
   * failure the operator fixes in place.
   */
  onSettled: (action: LifecycleAction, keepOpen: boolean) => void,
): LifecycleCommandState {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<LifecycleAction | null>(null);
  const [failure, setFailure] = useState<LifecycleFailure | null>(null);
  const [reasonInvalidated, setReasonInvalidated] = useState(false);
  const [running, setRunning] = useState<LifecycleAction | null>(null);

  const adopt = useCallback(
    (detail: AdminDesignTemplateDetailResponse) => {
      queryClient.setQueryData(designTemplateEditorKeys.detail(templateId), detail);
      void queryClient.invalidateQueries({ queryKey: designTemplateQueryKeys.lists() });
    },
    [queryClient, templateId],
  );

  const mutation = useMutation({
    retry: false,
    mutationFn: (request: LifecycleCommandRequest) =>
      sendLifecycleCommand(request.action, {
        templateId,
        expectedCurrentVersion: request.expectedCurrentVersion,
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      }),
  });

  const run = useCallback(
    (request: LifecycleCommandRequest) => {
      setRunning(request.action);
      setFailure(null);
      setReasonInvalidated(false);
      mutation.mutate(request, {
        onSuccess: (detail) => {
          // The response *is* the new truth. Adopt it and announce what happened.
          adopt(detail);
          setRunning(null);
          setOutcome(request.action);
          // Closed: the transition happened, so its confirmation is spent.
          onSettled(request.action, false);
        },
        onError: (error: unknown) => {
          const classified = classifyLifecycleFailure(error);
          setOutcome(null);
          if (!requiresAuthoritativeReread(classified)) {
            setRunning(null);
            setFailure(classified);
            // A rejected body is fixable in place; everything else closes.
            onSettled(request.action, classified === 'rejected');
            return;
          }
          // Exactly one authoritative re-read, then recompute from what it says.
          void fetchLifecycleDetail(templateId)
            .then((detail) => {
              adopt(detail);
            })
            .catch(() => {
              // The re-read itself failed. The cache is left untouched rather
              // than overwritten with a guess, and the conflict still stands.
            })
            .finally(() => {
              setRunning(null);
              setFailure('stale-state');
              setReasonInvalidated(requiresReason(request.action));
              onSettled(request.action, false);
            });
        },
      });
    },
    [adopt, mutation, onSettled, templateId],
  );

  return {
    running,
    outcome,
    failure,
    reasonInvalidated,
    run,
    dismissFailure: useCallback(() => {
      setFailure(null);
      setReasonInvalidated(false);
    }, []),
  };
}
