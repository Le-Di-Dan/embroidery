'use client';

/**
 * The manual replay, and the authoritative outcome it reports.
 *
 * ### The outcome comes from the server, and only from the server
 *
 * `NotificationReplayResponse.outcome` is `CREATED` or `EXISTING`, published by
 * `APP4-B08` under the Product Owner's A01 ruling. This hook stores that value
 * verbatim and the screen keys the two approved states on it.
 *
 * It is worth being explicit about what is *not* used, because each was
 * available and each is wrong. Elapsed time says nothing — a first replay can be
 * slow and a duplicate can be instant. A `replayIntentId` matching one this
 * session already saw would catch a double click and miss the case the design
 * actually names, where another operator raised the replay a moment ago and this
 * browser has never seen the id. The `PENDING` status is identical either way,
 * by construction. The number of rows in the list is worse still: `APP4-B08`
 * leaves the origin `FAILED`, so a `status=FAILED` list looks the same after a
 * successful replay as before one.
 *
 * ### The invalidation is the notification query alone
 *
 * A replay creates a new notification and changes nothing about the Customer or
 * their grants, so nothing else is invalidated. The refetched FAILED list will
 * usually still contain the origin — correctly, because B08 does not reopen it —
 * which is why the command's outcome is reported from the mutation result rather
 * than inferred from whether the list changed.
 *
 * No polling follows. Accepted for transport is not delivered; `APP4-W01` owns
 * delivery, and this screen does not watch it.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationReplayResponseOutcome } from '@embroidery/api-client';
import type { NotificationReplayResponse } from '@embroidery/api-client';

import { classifyReplayFailure, type ReplayFailure } from '../model/customer-access-failure';
import { customerAccessKeys } from '../model/customer-access-keys';
import { replayNotification } from '../services/customer-access.service';

/** The two approved success states, named for the frames they render. */
export type ReplayOutcome = 'created' | 'existing';

export interface NotificationReplayState {
  readonly running: boolean;
  readonly outcome: ReplayOutcome | null;
  readonly failure: ReplayFailure | null;
  readonly run: (intentId: string) => void;
  readonly reset: () => void;
}

export function useNotificationReplay(
  customerId: string | null,
  onSettled: () => void,
): NotificationReplayState {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<ReplayOutcome | null>(null);
  const [failure, setFailure] = useState<ReplayFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: (intentId: string) => replayNotification(intentId),
  });

  const run = useCallback(
    (intentId: string) => {
      setOutcome(null);
      setFailure(null);
      mutation.mutate(intentId, {
        onSuccess: (result: NotificationReplayResponse) => {
          setOutcome(
            result.outcome === NotificationReplayResponseOutcome.CREATED ? 'created' : 'existing',
          );
          if (customerId !== null) {
            void queryClient.invalidateQueries({
              queryKey: customerAccessKeys.notifications(customerId),
            });
          }
          onSettled();
        },
        onError: (error: unknown) => {
          setFailure(classifyReplayFailure(error));
          onSettled();
        },
      });
    },
    [customerId, mutation, onSettled, queryClient],
  );

  return {
    running: mutation.isPending,
    outcome,
    failure,
    run,
    reset: useCallback(() => {
      setOutcome(null);
      setFailure(null);
    }, []),
  };
}
