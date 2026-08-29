'use client';

/**
 * One of the two slots on the selection screen (`FIG-APP10-A02-SELECT-EMPTY-DESKTOP`
 * `835:3`, `…-SELECT-FILLED-DESKTOP` `835:82`).
 *
 * ### The slot says what its role *means*, not which number it is
 *
 * Each slot carries a title and a sentence: the survivor stays the active
 * identity and receives everything live; the loser is marked merged away and
 * stops being an identity. That sentence is rendered whether the slot is empty
 * or filled, because it is the thing the operator has to get right and the one
 * fact no amount of care about the contact value can compensate for.
 *
 * ### Exactly one way to name a Customer
 *
 * An exact contact, submitted in a request body to the delivered resolver. There
 * is no list, no directory, no autocomplete, no prefix or fuzzy match and no
 * paging — the API publishes none of them and this component offers none. A
 * verified contact belongs to exactly one Customer, so a match is a single id or
 * a 404, and the 404 is deliberately one answer with one cause the screen cannot
 * name.
 *
 * ### The typed contact leaves as soon as it has done its job
 *
 * It lives in this component's state, goes into the request body, and the field
 * is cleared on success before the resolved card renders. It is not written to
 * the URL, to storage, to a query key or to the merge request that follows —
 * from the moment the id is known the workflow has a safe handle and no further
 * need for the address.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResolveCustomerByContactBodyContactKind } from '@embroidery/api-client';

import { customerAccessKeys, fetchCustomerDetail } from '../../customer-access-support';
import type { LookupFailure } from '../../customer-access-support';
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import type { ParticipantRole } from '../hooks/use-participant-selection';
import { MergeParticipantCard } from './merge-participant-card';

const COPY = CUSTOMER_MERGE_COPY.selection;

const FAILURE_COPY: Readonly<Record<LookupFailure, string>> = {
  // The same one-answer miss the support screen shows: the server refuses to
  // distinguish unknown, unverified, deactivated and malformed, and a client
  // that split them would rebuild the enumeration oracle the API declines to be.
  'not-found': CUSTOMER_MERGE_COPY.selection.loadError,
  unauthenticated: CUSTOMER_MERGE_COPY.openFailure.unauthenticated,
  forbidden: CUSTOMER_MERGE_COPY.openFailure.forbidden,
  generic: CUSTOMER_MERGE_COPY.openFailure.generic,
};

interface ParticipantSlotProps {
  readonly role: ParticipantRole;
  readonly customerId: string | null;
  readonly busy: boolean;
  readonly failure: LookupFailure | undefined;
  readonly onResolve: (kind: ResolveCustomerByContactBodyContactKind, contact: string) => void;
  readonly onClear: () => void;
}

export function ParticipantSlot({
  role,
  customerId,
  busy,
  failure,
  onResolve,
  onClear,
}: ParticipantSlotProps) {
  const [contact, setContact] = useState('');
  const [kind, setKind] = useState<ResolveCustomerByContactBodyContactKind>(
    ResolveCustomerByContactBodyContactKind.EMAIL,
  );
  const [blank, setBlank] = useState(false);
  const fieldId = useId();
  const kindId = useId();
  const headingId = useId();

  // Shares `customerAccessKeys.customer(id)` with the support screen, so the
  // same Customer read on either surface is one cached entry rather than two
  // that can disagree.
  const detail = useQuery({
    queryKey: customerAccessKeys.customer(customerId ?? ''),
    queryFn: ({ signal }) => fetchCustomerDetail(customerId ?? '', signal),
    enabled: customerId !== null,
  });

  const submit = () => {
    const trimmed = contact.trim();
    if (trimmed === '') {
      setBlank(true);
      return;
    }
    setBlank(false);
    onResolve(kind, trimmed);
    // Cleared before the resolved Customer renders: from here the workflow works
    // from an opaque id and has no further use for a person's address.
    setContact('');
  };

  const titles = role === 'survivor' ? COPY.survivorTitle : COPY.loserTitle;
  const meaning = role === 'survivor' ? COPY.survivorMeaning : COPY.loserMeaning;

  return (
    <section
      className="customer-merge-slot"
      data-role={role}
      data-testid={`merge-slot-${role}`}
      aria-labelledby={headingId}
    >
      <h3 className="customer-merge-slot__title" id={headingId}>
        {titles}
      </h3>
      <p className="customer-merge-slot__meaning">{meaning}</p>

      {customerId === null ? (
        <div className="customer-merge-slot__form">
          <label className="admin-field__label" htmlFor={kindId}>
            {COPY.kindLabel}
          </label>
          <select
            id={kindId}
            className="admin-field__control"
            data-testid={`merge-slot-${role}-kind`}
            value={kind}
            disabled={busy}
            onChange={(event) => {
              setKind(event.target.value as ResolveCustomerByContactBodyContactKind);
            }}
          >
            <option value={ResolveCustomerByContactBodyContactKind.EMAIL}>{COPY.kindEmail}</option>
            <option value={ResolveCustomerByContactBodyContactKind.PHONE}>{COPY.kindPhone}</option>
          </select>

          <label className="admin-field__label" htmlFor={fieldId}>
            {COPY.contactLabel}
          </label>
          <input
            id={fieldId}
            type="text"
            className="admin-field__control"
            data-testid={`merge-slot-${role}-contact`}
            value={contact}
            placeholder={COPY.placeholder}
            disabled={busy}
            aria-invalid={blank}
            onChange={(event) => {
              setContact(event.target.value);
              if (blank) setBlank(false);
            }}
          />
          <button
            type="button"
            className="customer-merge__primary"
            data-testid={`merge-slot-${role}-resolve`}
            disabled={busy}
            onClick={submit}
          >
            {busy ? COPY.resolving : COPY.resolve}
          </button>

          {blank ? (
            <p className="customer-merge__error" role="alert">
              {COPY.blank}
            </p>
          ) : null}
          {failure === undefined ? null : (
            <p
              className="customer-merge__error"
              role="alert"
              data-testid={`merge-slot-${role}-failure`}
            >
              {FAILURE_COPY[failure]}
            </p>
          )}
          <p className="customer-merge-slot__empty">{COPY.empty}</p>
        </div>
      ) : (
        <>
          {detail.isPending ? (
            <p className="customer-merge-slot__loading" data-testid={`merge-slot-${role}-loading`}>
              {COPY.loading}
            </p>
          ) : detail.isError || detail.data === undefined ? (
            <p className="customer-merge__error" role="alert">
              {COPY.loadError}
            </p>
          ) : (
            <MergeParticipantCard
              role={role}
              participant={detail.data}
              testId={`merge-slot-${role}-card`}
            />
          )}
          {/* Replaceable only while no case exists — after that the pair is a
              property of the case and this screen is gone. */}
          <button
            type="button"
            className="customer-merge__secondary"
            data-testid={`merge-slot-${role}-replace`}
            onClick={onClear}
          >
            {COPY.replace}
          </button>
        </>
      )}
    </section>
  );
}
