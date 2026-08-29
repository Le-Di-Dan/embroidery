'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  AdminCustomerContactResponse,
  AdminNotificationIntentResponse,
  AdminSecureGrantResponse,
} from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { useCustomerLookup } from '../hooks/use-customer-lookup';
import { useCustomerSupportQueries } from '../hooks/use-customer-support-queries';
import { useContactMaintenance } from '../hooks/use-contact-maintenance';
import { useGrantRevocation } from '../hooks/use-grant-revocation';
import { useNotificationReplay } from '../hooks/use-notification-replay';
import { useProfileMaintenance } from '../hooks/use-profile-maintenance';
import type { ContactAction } from '../model/customer-maintenance-failure';
import { ContactActionDialog } from './contact-action-dialog';
import { CustomerContactPanel } from './customer-contact-panel';
import { CustomerLookupPanel } from './customer-lookup-panel';
import { NotificationPanel } from './notification-panel';
import { ReplayDialog } from './replay-dialog';
import { RevokeDialog } from './revoke-dialog';
import { SecureGrantPanel } from './secure-grant-panel';

/**
 * `/support/customer-access` — the Admin customer-access support capability.
 *
 * One screen over `APP4-B07` and `APP4-B08`, answering the questions the phase
 * audit fixed for it: is the contact verified, which one is primary, is the link
 * still live, when does it expire, can it be revoked, did a notification fail,
 * what safe error class was recorded, can the delivery be replayed, and has
 * replay become ineligible.
 *
 * ### Local state is UI state only
 *
 * Which dialog is open, and which grant or intent it is about. Every server fact
 * — the Customer, the grants, the notifications — lives in TanStack, keyed by
 * the resolved Customer id, and nothing is duplicated into component state where
 * the two could disagree. The resolved id itself is the one piece of session
 * state the screen owns, and it is an opaque identifier rather than anything
 * about a person.
 *
 * ### The operator never leaves the route
 *
 * Revoke and replay both settle in place: the dialog closes, a banner reports
 * what the server said, and the affected query refetches. There is no navigation
 * and no reload, which is what `APP4-A01`'s acceptance asks for.
 *
 * ### `APP10-A01` extends this screen; it does not replace it
 *
 * The lookup, the grant card and the notification card are `APP4-A01`'s and are
 * untouched. What APP10 adds sits inside the existing left-hand customer card:
 * the two profile fields `APP10-B01` makes writable, and the promote-primary and
 * deactivate transitions on the contacts already listed there. There is still no
 * customer list, directory or search — discovery remains exact-contact
 * resolution — and no merge affordance, which is `APP10-A02`'s route.
 *
 * All three maintenance mutations answer 204 and republish nothing, so each one
 * ends in a re-read of the authoritative customer. Nothing the operator typed or
 * clicked is written into the cache as if the server had confirmed it.
 */
export function CustomerAccessScreen() {
  const [revoking, setRevoking] = useState<AdminSecureGrantResponse | null>(null);
  const [replaying, setReplaying] = useState<AdminNotificationIntentResponse | null>(null);
  /**
   * The open contact confirmation: which transition, and which contact.
   *
   * The *contact* is held, not just its id, because the dialog names it by its
   * mask — and the mask is a fact the operator already has on screen, unlike the
   * id, which addresses the request and is never rendered.
   */
  const [contactAction, setContactAction] = useState<{
    readonly action: ContactAction;
    readonly contact: AdminCustomerContactResponse;
  } | null>(null);

  const lookup = useCustomerLookup();
  const customerId = lookup.customerId;
  const data = useCustomerSupportQueries(customerId);

  const closeRevoke = useCallback(() => {
    setRevoking(null);
  }, []);
  const closeReplay = useCallback(() => {
    setReplaying(null);
  }, []);

  const closeContactAction = useCallback(() => {
    setContactAction(null);
  }, []);

  const revocation = useGrantRevocation(customerId, closeRevoke);
  const replay = useNotificationReplay(customerId, closeReplay);
  const profile = useProfileMaintenance(customerId, data.refetchCustomer);
  const contacts = useContactMaintenance(customerId, data.refetchCustomer);

  const startContactAction = useCallback(
    (action: ContactAction, contact: AdminCustomerContactResponse) => {
      // The previous outcome is cleared as the dialog opens, so a success banner
      // from the last transition cannot be read as this one's answer.
      contacts.reset();
      setContactAction({ action, contact });
    },
    [contacts],
  );

  const dismissContactAction = useCallback(() => {
    contacts.reset();
    closeContactAction();
  }, [closeContactAction, contacts]);

  /**
   * One instant for the whole render.
   *
   * Grant liveness is derived from `expiresAt` against *now*, and calling
   * `new Date()` inside each comparison would let the status label and the
   * revoke button disagree about a grant expiring during the render.
   */
  const now = useMemo(() => new Date(), [data.grants]);

  const startLookup = useCallback(
    (kind: Parameters<typeof lookup.submit>[0], contact: string) => {
      // A new lookup discards the previous outcome banners: they described the
      // customer being replaced, and leaving them up would attach one person's
      // revoke confirmation to another person's record.
      revocation.reset();
      replay.reset();
      profile.reset();
      contacts.reset();
      setContactAction(null);
      lookup.submit(kind, contact);
    },
    [contacts, lookup, profile, replay, revocation],
  );

  const showNotFound = lookup.failure === 'not-found';
  const showLoadError = customerId !== null && data.failed;

  // A `section`, not a `main`: the Admin shell already renders the page's one
  // `main` landmark, and a second one nested inside it gives the document two
  // — which is what a browser pass caught here.
  return (
    <section className="customer-access">
      <header className="customer-access__header">
        <h1 className="customer-access__title">{CUSTOMER_ACCESS_COPY.page.title}</h1>
        <p className="customer-access__subtitle">{CUSTOMER_ACCESS_COPY.page.subtitle}</p>
      </header>

      <CustomerLookupPanel busy={lookup.running} onSubmit={startLookup} />

      {/*
        One live region for the whole screen's status, so a lookup outcome is
        announced whether it lands as a customer, a miss or a failure.
      */}
      <div className="customer-access__status" role="status" aria-live="polite">
        {lookup.running ? CUSTOMER_ACCESS_COPY.lookup.submitting : null}
      </div>

      {lookup.failure === 'unauthenticated' ? (
        <p className="customer-access-alert" data-tone="error" data-testid="lookup-unauthenticated">
          {CUSTOMER_ACCESS_COPY.failure.unauthenticated}
        </p>
      ) : null}
      {lookup.failure === 'forbidden' ? (
        <p className="customer-access-alert" data-tone="error" data-testid="lookup-forbidden">
          {CUSTOMER_ACCESS_COPY.failure.forbidden}
        </p>
      ) : null}
      {lookup.failure === 'generic' ? (
        <p className="customer-access-alert" data-tone="error" data-testid="lookup-generic">
          {CUSTOMER_ACCESS_COPY.failure.generic}
        </p>
      ) : null}

      {showNotFound ? (
        <section className="customer-access-empty" data-testid="customer-not-found">
          <h2 className="customer-access-empty__title">
            {CUSTOMER_ACCESS_COPY.failure.notFoundTitle}
          </h2>
          <p className="customer-access-empty__body">{CUSTOMER_ACCESS_COPY.failure.notFoundBody}</p>
          <p className="customer-access-empty__note">{CUSTOMER_ACCESS_COPY.failure.notFoundNote}</p>
        </section>
      ) : null}

      {showLoadError ? (
        <section className="customer-access-empty" data-testid="customer-load-error">
          <h2 className="customer-access-empty__title">{CUSTOMER_ACCESS_COPY.failure.loadError}</h2>
          <p className="customer-access-empty__body">
            {CUSTOMER_ACCESS_COPY.failure.loadErrorBody}
          </p>
          <button
            type="button"
            className="customer-access-card__primary"
            data-testid="customer-load-retry"
            onClick={data.refetch}
          >
            {CUSTOMER_ACCESS_COPY.failure.retry}
          </button>
        </section>
      ) : null}

      {customerId === null ? (
        showNotFound ? null : (
          <p className="customer-access__idle" data-testid="customer-access-idle">
            {CUSTOMER_ACCESS_COPY.lookup.idle}
          </p>
        )
      ) : showLoadError ? null : (
        <div className="customer-access__columns">
          <div className="customer-access__left">
            <CustomerContactPanel
              customer={data.customer}
              loading={data.loading}
              profile={profile}
              onContactAction={startContactAction}
            />
          </div>
          <div className="customer-access__right">
            <SecureGrantPanel
              grants={data.grants}
              loading={data.loading}
              now={now}
              revokeSucceeded={revocation.succeeded}
              revokeFailure={revocation.failure}
              onRevoke={setRevoking}
            />
            <NotificationPanel
              notifications={data.notifications}
              loading={data.loading}
              replayOutcome={replay.outcome}
              replayFailure={replay.failure}
              onReplay={setReplaying}
            />
          </div>
        </div>
      )}

      {revoking === null ? null : (
        <RevokeDialog
          busy={revocation.running}
          onConfirm={(reason) => {
            revocation.run(revoking.grantId, reason);
          }}
          onCancel={closeRevoke}
        />
      )}

      {contactAction === null ? null : (
        <ContactActionDialog
          action={contactAction.action}
          contact={contactAction.contact}
          busy={contacts.running}
          succeeded={contacts.succeeded}
          failure={contacts.failure}
          onConfirm={() => {
            contacts.run(contactAction.action, contactAction.contact.contactId);
          }}
          onClose={dismissContactAction}
        />
      )}

      {replaying === null ? null : (
        <ReplayDialog
          busy={replay.running}
          onConfirm={() => {
            replay.run(replaying.intentId);
          }}
          onCancel={closeReplay}
        />
      )}
    </section>
  );
}
