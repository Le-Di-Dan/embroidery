'use client';

/**
 * The exact-contact lookup — the screen's entry point, and the only place a real
 * contact exists in this application.
 *
 * ### The draft is cleared the moment it has done its job
 *
 * The typed value lives in component state, is handed to the mutation, and is
 * wiped in `onSuccess` before anything renders the resolved Customer. That is
 * deliberate sequencing, not tidiness: from the moment the id is known, the
 * screen has a safe handle on the Customer and no further need for their
 * address, so keeping it would be keeping a person's email in browser memory for
 * the rest of the session with nothing asking for it.
 *
 * It is not written to `localStorage`, `sessionStorage`, the URL, the history or
 * a query key. A mutation is what makes that enforceable — a query would have to
 * key on the contact, which is precisely how the value would end up somewhere it
 * can be read back.
 *
 * ### It is a mutation that changes nothing
 *
 * `useMutation` is chosen for lifecycle, not semantics: the server operation is
 * a read that uses POST to keep the contact out of the URL, and this hook uses a
 * mutation to keep it out of the cache. `retry: false`, because a lookup that
 * missed will miss again, and re-sending a contact is re-sending a contact.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ResolveCustomerByContactBodyContactKind } from '@embroidery/api-client';

import { classifyLookupFailure, type LookupFailure } from '../model/customer-access-failure';
import { resolveCustomerByContact } from '../services/customer-access.service';

export interface CustomerLookupState {
  /** The resolved Customer, or `null` before the first successful lookup. */
  readonly customerId: string | null;
  readonly running: boolean;
  readonly failure: LookupFailure | null;
  readonly submit: (kind: ResolveCustomerByContactBodyContactKind, contact: string) => void;
  readonly clearFailure: () => void;
}

export function useCustomerLookup(onResolved?: () => void): CustomerLookupState {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [failure, setFailure] = useState<LookupFailure | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      kind,
      contact,
    }: {
      kind: ResolveCustomerByContactBodyContactKind;
      contact: string;
    }) => resolveCustomerByContact(kind, contact),
  });

  const submit = useCallback(
    (kind: ResolveCustomerByContactBodyContactKind, contact: string) => {
      setFailure(null);
      mutation.mutate(
        { kind, contact },
        {
          onSuccess: (resolved) => {
            setCustomerId(resolved);
            // The caller wipes the field here, before the Customer renders.
            onResolved?.();
          },
          onError: (error: unknown) => {
            // A failed lookup must not leave the previous Customer on screen: the
            // operator asked about somebody else, and answering with the person
            // they were looking at a moment ago is the worst possible answer.
            setCustomerId(null);
            setFailure(classifyLookupFailure(error));
          },
        },
      );
    },
    [mutation, onResolved],
  );

  return {
    customerId,
    running: mutation.isPending,
    failure,
    submit,
    clearFailure: useCallback(() => {
      setFailure(null);
    }, []),
  };
}
