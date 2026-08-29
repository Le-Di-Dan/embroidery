'use client';

/**
 * The profile block: display name and internal notes, read or edited in place
 * (`FIG-APP10-A01-PROFILE-EDITING` `831:3` and its four sibling states).
 *
 * Two fields and no more, because `PATCH /api/admin/customers/{customerId}`
 * accepts two. There is no contact field, no verification control and no merge
 * affordance here — not hidden, not disabled, simply absent, because the
 * operation cannot express them and a control that could would be a promise the
 * contract does not keep.
 *
 * Both fields are bound to their feedback through `aria-describedby` and
 * `aria-invalid`, and every refusal carries words rather than a colour. Both
 * buttons disable while the request is in flight, which is what stops a second
 * submit producing a second patch.
 */
import { useId } from 'react';
import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { CUSTOMER_MAINTENANCE_COPY } from '../model/customer-maintenance-copy';
import { DISPLAY_NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from '../model/profile-draft';
import type { ProfileMaintenanceState } from '../hooks/use-profile-maintenance';

const COPY = CUSTOMER_MAINTENANCE_COPY.profile;
const SHARED = CUSTOMER_ACCESS_COPY.customer;

interface CustomerProfileFormProps {
  readonly customer: AdminCustomerDetailResponse;
  readonly profile: ProfileMaintenanceState;
}

/** The refusal sentence for each classified profile failure. */
const FAILURE_COPY = {
  validation: COPY.validation,
  merged: COPY.merged,
  stale: COPY.stale,
  unauthenticated: COPY.unauthenticated,
  forbidden: COPY.forbidden,
  generic: COPY.generic,
} as const;

const PROBLEM_COPY = {
  unchanged: COPY.unchanged,
  'display-name-too-long': COPY.displayNameTooLong,
  'notes-too-long': COPY.notesTooLong,
} as const;

export function CustomerProfileForm({ customer, profile }: CustomerProfileFormProps) {
  const nameId = useId();
  const notesId = useId();
  const problemId = useId();
  const draft = profile.draft;

  return (
    <div className="customer-access-profile">
      <h3 className="customer-access-card__subheading">{COPY.heading}</h3>

      {draft === null ? (
        <>
          <dl className="customer-access-card__rows">
            <div className="customer-access-card__row">
              <dt>{SHARED.displayName}</dt>
              {/*
                Absent is a real answer, not an empty cell: a Customer exists from
                a verified contact alone and may never have supplied a name.
              */}
              <dd data-testid="customer-display-name">
                {customer.displayName ?? SHARED.displayNameEmpty}
              </dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.notesLabel}</dt>
              <dd data-testid="customer-notes">{customer.notes ?? COPY.notesEmpty}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="customer-access-card__primary"
            data-testid="profile-edit"
            onClick={() => {
              profile.begin(customer);
            }}
          >
            {COPY.edit}
          </button>
        </>
      ) : (
        <div className="customer-access-profile__form">
          <label className="customer-access-dialog__label" htmlFor={nameId}>
            {COPY.displayNameLabel}
          </label>
          <input
            id={nameId}
            type="text"
            className="customer-access-lookup__field"
            data-testid="profile-display-name"
            value={draft.displayName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={profile.running}
            aria-describedby={profile.problem === null ? undefined : problemId}
            aria-invalid={profile.problem !== null}
            onChange={(event) => {
              profile.change('displayName', event.target.value);
            }}
          />
          <p className="customer-access-dialog__hint">{COPY.displayNameHint}</p>

          <label className="customer-access-dialog__label" htmlFor={notesId}>
            {COPY.notesLabel}
          </label>
          <textarea
            id={notesId}
            className="customer-access-dialog__reason"
            data-testid="profile-notes"
            value={draft.notes}
            maxLength={NOTES_MAX_LENGTH}
            rows={4}
            disabled={profile.running}
            aria-describedby={profile.problem === null ? undefined : problemId}
            aria-invalid={profile.problem !== null}
            onChange={(event) => {
              profile.change('notes', event.target.value);
            }}
          />
          <p className="customer-access-dialog__hint">{COPY.notesHint}</p>

          {profile.problem === null ? null : (
            <p
              className="customer-access-dialog__error"
              id={problemId}
              role="alert"
              data-testid="profile-problem"
            >
              {PROBLEM_COPY[profile.problem]}
            </p>
          )}

          <div className="customer-access-dialog__actions">
            <button
              type="button"
              className="customer-access-card__primary"
              data-testid="profile-save"
              disabled={profile.running}
              onClick={() => {
                profile.save(customer);
              }}
            >
              {profile.running ? COPY.saving : COPY.save}
            </button>
            <button
              type="button"
              className="customer-access-dialog__secondary"
              data-testid="profile-cancel"
              disabled={profile.running}
              onClick={profile.cancel}
            >
              {COPY.cancel}
            </button>
          </div>
        </div>
      )}

      {profile.saved ? (
        <p className="customer-access-alert" data-tone="success" data-testid="profile-saved">
          {COPY.saved}
        </p>
      ) : null}
      {profile.failure === null ? null : (
        <p
          className="customer-access-alert"
          data-tone="error"
          role="alert"
          data-testid="profile-failure"
        >
          {FAILURE_COPY[profile.failure]}
        </p>
      )}

      <p className="customer-access-card__note">{COPY.scopeNote}</p>
    </div>
  );
}
