'use client';

/**
 * The two participant slots, before a case exists.
 *
 * ### This is the only local state that means anything on the selection screen
 *
 * Two Customer ids and two lookup outcomes. Both ids are opaque; neither slot
 * ever holds a contact. The typed value lives in the slot component, is handed
 * to `resolveCustomerByContact`, and is gone when the promise settles — that is
 * `customer-access-support`'s rule and this screen inherits it by using its
 * resolver rather than re-implementing the call.
 *
 * ### Replaceable until the case exists, and not one moment longer
 *
 * `clear(role)` exists because `APP10-A02` §6.2 requires the operator to be able
 * to change their mind before opening. After `POST /customer-merges` succeeds
 * the workflow leaves this screen entirely and the case detail is read from the
 * server, so there is nothing here for a "swap" to act on — which is exactly why
 * no swap control exists on the case screen. Direction is chosen once, in words,
 * and is thereafter a property of the case.
 *
 * ### The same-customer guard is a client courtesy, not the authority
 *
 * `APP10-B02` refuses the pair itself. The guard here only stops the operator
 * spending a request to be told something both slots already show — it never
 * sends a knowingly invalid open in order to harvest the error.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ResolveCustomerByContactBodyContactKind } from '@embroidery/api-client';

import { classifyLookupFailure, resolveCustomerByContact } from '../../customer-access-support';
import type { LookupFailure } from '../../customer-access-support';

export type ParticipantRole = 'survivor' | 'loser';

export interface ParticipantSelectionState {
  readonly survivorCustomerId: string | null;
  readonly loserCustomerId: string | null;
  /** Which slot has a lookup in flight, or `null`. One at a time by construction. */
  readonly resolving: ParticipantRole | null;
  readonly failure: Readonly<Partial<Record<ParticipantRole, LookupFailure>>>;
  /** True once both slots hold the same Customer. Blocks the open action. */
  readonly sameCustomer: boolean;
  readonly bothChosen: boolean;
  readonly resolve: (
    role: ParticipantRole,
    kind: ResolveCustomerByContactBodyContactKind,
    contact: string,
  ) => void;
  readonly clear: (role: ParticipantRole) => void;
}

export function useParticipantSelection(): ParticipantSelectionState {
  const [survivorCustomerId, setSurvivor] = useState<string | null>(null);
  const [loserCustomerId, setLoser] = useState<string | null>(null);
  const [resolving, setResolving] = useState<ParticipantRole | null>(null);
  const [failure, setFailure] = useState<Partial<Record<ParticipantRole, LookupFailure>>>({});

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      kind,
      contact,
    }: {
      role: ParticipantRole;
      kind: ResolveCustomerByContactBodyContactKind;
      contact: string;
    }) => resolveCustomerByContact(kind, contact),
  });

  const assign = useCallback((role: ParticipantRole, customerId: string | null) => {
    if (role === 'survivor') setSurvivor(customerId);
    else setLoser(customerId);
  }, []);

  const resolve = useCallback(
    (role: ParticipantRole, kind: ResolveCustomerByContactBodyContactKind, contact: string) => {
      setFailure((current) => ({ ...current, [role]: undefined }));
      setResolving(role);
      mutation.mutate(
        { role, kind, contact },
        {
          onSuccess: (customerId) => {
            assign(role, customerId);
            setResolving(null);
          },
          onError: (error: unknown) => {
            // A failed lookup must not leave the previous Customer in the slot:
            // the operator asked about somebody else, and an irreversible
            // operation must never be aimed at whoever happened to be there.
            assign(role, null);
            setFailure((current) => ({ ...current, [role]: classifyLookupFailure(error) }));
            setResolving(null);
          },
        },
      );
    },
    [assign, mutation],
  );

  const clear = useCallback(
    (role: ParticipantRole) => {
      assign(role, null);
      setFailure((current) => ({ ...current, [role]: undefined }));
    },
    [assign],
  );

  const sameCustomer = survivorCustomerId !== null && survivorCustomerId === loserCustomerId;

  return {
    survivorCustomerId,
    loserCustomerId,
    resolving,
    failure,
    sameCustomer,
    bothChosen: survivorCustomerId !== null && loserCustomerId !== null,
    resolve,
    clear,
  };
}
