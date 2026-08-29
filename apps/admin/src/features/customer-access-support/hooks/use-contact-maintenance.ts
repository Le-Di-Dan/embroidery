'use client';

/**
 * The two contact transitions, and the re-read that both of them end in.
 *
 * ### Nothing is flipped optimistically, on either path
 *
 * Promotion moves the default destination for every future notification and
 * deactivation retires a channel, so neither is shown as done before the server
 * says so. No `setQueryData` writes the new primary ahead of the response, and
 * the confirm button is disabled while the request is in flight so a second
 * click cannot send a second transition.
 *
 * ### The refusal path re-reads too, and that is what makes it legible
 *
 * `APP10-B01` raises every refusal without a business code, so a 409 alone
 * cannot say whether the contact is the primary one, the last verified one, or
 * whether the whole Customer has been merged away. The hook therefore re-reads
 * the Customer **before** classifying, and the reason is read off what the
 * server now says is true. That also leaves the operator looking at the current
 * record rather than the stale card they clicked on — the same rule
 * `useGrantRevocation` follows for a conflicted revoke.
 *
 * A success re-reads for the ordinary reason: the operations answer 204 and
 * republish nothing, so the new primary designation, and the disappearance of a
 * deactivated contact from the current list, are facts only the detail read has.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import {
  classifyContactFailure,
  type ContactAction,
  type ContactFailure,
} from '../model/customer-maintenance-failure';
import {
  deactivateContact,
  promoteContactToPrimary,
} from '../services/customer-maintenance.service';

export interface ContactMaintenanceState {
  readonly running: boolean;
  /** Set once the server confirmed the transition. Drives the success state. */
  readonly succeeded: boolean;
  readonly failure: ContactFailure | null;
  readonly run: (action: ContactAction, contactId: string) => void;
  readonly reset: () => void;
}

export function useContactMaintenance(
  customerId: string | null,
  refetchCustomer: () => Promise<AdminCustomerDetailResponse | undefined>,
): ContactMaintenanceState {
  const [succeeded, setSucceeded] = useState(false);
  const [failure, setFailure] = useState<ContactFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      id,
      action,
      contactId,
    }: {
      id: string;
      action: ContactAction;
      contactId: string;
    }) =>
      action === 'promote'
        ? promoteContactToPrimary(id, contactId)
        : deactivateContact(id, contactId),
  });

  const run = useCallback(
    (action: ContactAction, contactId: string) => {
      if (customerId === null) return;
      setSucceeded(false);
      setFailure(null);
      mutation.mutate(
        { id: customerId, action, contactId },
        {
          onSuccess: () => {
            setSucceeded(true);
            void refetchCustomer();
          },
          onError: (error: unknown) => {
            void refetchCustomer().then((fresh) => {
              setFailure(classifyContactFailure(action, error, fresh, contactId));
            });
          },
        },
      );
    },
    [customerId, mutation, refetchCustomer],
  );

  return {
    running: mutation.isPending,
    succeeded,
    failure,
    run,
    reset: useCallback(() => {
      setSucceeded(false);
      setFailure(null);
    }, []),
  };
}
