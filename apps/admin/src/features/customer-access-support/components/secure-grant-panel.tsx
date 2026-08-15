'use client';

import type { AdminCustomerGrantsResponse, AdminSecureGrantResponse } from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { isRevocable, resolveGrantLiveness, selectPrimaryGrant } from '../model/grant-liveness';
import type { RevokeFailure } from '../model/customer-access-failure';

interface SecureGrantPanelProps {
  readonly grants: AdminCustomerGrantsResponse | undefined;
  readonly loading: boolean;
  readonly now: Date;
  readonly revokeSucceeded: boolean;
  readonly revokeFailure: RevokeFailure | null;
  readonly onRevoke: (grant: AdminSecureGrantResponse) => void;
}

const COPY = CUSTOMER_ACCESS_COPY.grant;

const STATUS_LABEL = {
  live: COPY.statusActive,
  'expired-by-time': COPY.statusExpiredByTime,
  expired: COPY.statusExpired,
  revoked: COPY.statusRevoked,
} as const;

/**
 * The Customer's secure grant, and the revoke entry point.
 *
 * ### The status shown is the truth about the link, not a rewrite of the row
 *
 * A grant stored `ACTIVE` whose `expiresAt` has passed opens nothing, and the
 * operator needs to know that — so the label reads "đã hết hạn". What the screen
 * does **not** do is claim the database says `EXPIRED`: the derivation lives in
 * `resolveGrantLiveness`, reads `status` and `expiresAt` together exactly as
 * `APP4-B07` instructs, and invents no persisted state. Both facts stay visible,
 * because the expiry instant is rendered beside the label.
 *
 * Revoke is offered only for a genuinely live grant. Offering it on a
 * time-expired row would produce a 409 the operator could not have predicted
 * from what they were looking at.
 *
 * ### Nothing here is a secret
 *
 * The token, its hash and any digest are absent from the response type
 * altogether — `APP4-B07` never selects the digest column — so there is no field
 * to render and no branch that could. What is shown is scope, request, status
 * and expiry: enough to answer "why did this link stop working".
 */
export function SecureGrantPanel({
  grants,
  loading,
  now,
  revokeSucceeded,
  revokeFailure,
  onRevoke,
}: SecureGrantPanelProps) {
  const grant = grants === undefined ? null : selectPrimaryGrant(grants.grants, now);
  const liveness = grant === null ? null : resolveGrantLiveness(grant, now);

  return (
    <section className="customer-access-card" aria-labelledby="grant-panel-heading">
      <h2 className="customer-access-card__heading" id="grant-panel-heading">
        {COPY.heading}
      </h2>

      {revokeSucceeded ? (
        <p
          className="customer-access-alert"
          data-tone="success"
          role="status"
          data-testid="revoke-success"
        >
          {CUSTOMER_ACCESS_COPY.revoke.success}
        </p>
      ) : null}
      {revokeFailure === 'conflict' ? (
        <p
          className="customer-access-alert"
          data-tone="warning"
          role="status"
          data-testid="revoke-conflict"
        >
          {CUSTOMER_ACCESS_COPY.revoke.conflict}
        </p>
      ) : null}
      {revokeFailure === 'missing' ? (
        <p
          className="customer-access-alert"
          data-tone="warning"
          role="status"
          data-testid="revoke-missing"
        >
          {CUSTOMER_ACCESS_COPY.revoke.missing}
        </p>
      ) : null}

      {loading || grants === undefined ? (
        <p className="customer-access-card__loading" data-testid="grant-panel-loading">
          {COPY.loading}
        </p>
      ) : grant === null || liveness === null ? (
        <p className="customer-access-card__empty" data-testid="grant-panel-empty">
          {COPY.none}
        </p>
      ) : (
        <>
          <p className="customer-access-badge" data-status={liveness} data-testid="grant-status">
            {STATUS_LABEL[liveness]}
          </p>
          <dl className="customer-access-card__rows">
            <div className="customer-access-card__row">
              <dt>{COPY.scope}</dt>
              <dd data-testid="grant-scope">{grant.scopeKind}</dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.request}</dt>
              <dd>{grant.customRequestId}</dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.expiresAt}</dt>
              <dd data-testid="grant-expires-at">
                <time dateTime={grant.expiresAt}>
                  {new Date(grant.expiresAt).toLocaleString('vi-VN')}
                </time>
              </dd>
            </div>
          </dl>

          <p className="customer-access-card__note">{COPY.secretNote}</p>

          {isRevocable(liveness) ? (
            <button
              type="button"
              className="customer-access-card__danger"
              data-testid="grant-revoke"
              onClick={() => {
                onRevoke(grant);
              }}
            >
              {COPY.revoke}
            </button>
          ) : (
            <p className="customer-access-card__empty" data-testid="grant-not-revocable">
              {COPY.noneActive}
            </p>
          )}
        </>
      )}
    </section>
  );
}
