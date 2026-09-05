'use client';

/**
 * One Customer as an operator may see them, on both merge screens.
 *
 * ### One card, two response shapes, no cast
 *
 * The selection screen holds `AdminCustomerDetailResponse` (the support detail
 * read) and the case screen holds `MergeParticipantResponse` (the merge
 * projection). The two are different contracts owned by different checkpoints —
 * the merge one deliberately publishes *less*: no `notes` and no `contactId`,
 * because a merge screen compares two people and maintains neither. So this
 * component takes the intersection structurally rather than either named type:
 * whichever card the caller has satisfies it, and if a future contract drops a
 * field the compiler says so at the call site instead of a cast hiding it.
 *
 * ### The mask is rendered exactly as it arrives
 *
 * There is no masking function in this feature and no transform of any kind on a
 * contact — no truncation, no re-formatting, no reveal. `APP4-P01` owns masking,
 * it happens server-side, and the mask is deterministic so an operator can
 * recognise the same contact on two cards without either address being
 * disclosed. That recognition is the whole point of the comparison, and any
 * client-side transform could only make it less reliable.
 *
 * The raw, normalized and display forms are not merely unrendered: neither
 * response type has a field to put them in.
 *
 * ### The role is a heading, not a colour
 *
 * "Khách giữ lại" and "Khách được gộp" are rendered as words, each with its
 * definition line, on both screens. The direction of an irreversible operation
 * is never left to position, colour or a number.
 */
import { formatInstant } from '../../../shared/presentation/instant';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import type { ParticipantRole } from '../hooks/use-participant-selection';

const COPY = CUSTOMER_MERGE_COPY.selection;

interface ParticipantContactView {
  /**
   * Both response types publish an enum whose members are exactly `EMAIL` and
   * `PHONE`, but they are two separately generated enums. `string` is the honest
   * structural intersection: this card compares the value to `'EMAIL'` and
   * renders one of two labels, so a third kind added to either enum would render
   * as a phone rather than crash — and the two call sites keep their own exact
   * types.
   */
  readonly kind: string;
  readonly maskedValue: string;
  readonly verified: boolean;
  readonly primary: boolean;
}

export interface ParticipantView {
  readonly customerId: string;
  readonly displayName?: string | undefined;
  readonly verifiedAt: string;
  readonly contacts: readonly ParticipantContactView[];
}

interface MergeParticipantCardProps {
  readonly role: ParticipantRole;
  readonly participant: ParticipantView;
  readonly testId: string;
}

export function MergeParticipantCard({ role, participant, testId }: MergeParticipantCardProps) {
  return (
    <div className="customer-merge-participant" data-testid={testId} data-role={role}>
      <p className="customer-merge-participant__name" data-testid={`${testId}-display-name`}>
        {participant.displayName ?? COPY.displayNameEmpty}
      </p>
      {/* `V01-UX-032`, `APP12-V02` §21.4. Both participants rendered "Chưa có"
          beside two masked addresses, so an operator confirming an irreversible
          merge was choosing between two blanks. Nothing here invents a name —
          §21.4 forbids substituting the recipient frozen on an order, which is a
          property of that order and not the identity of a person. Instead the
          card says *why* the name is absent and names the existing screen that
          can set one (`APP10-B01`'s `displayName` patch, already shipped at
          `/support/customer-access`), and prints the customer reference the
          decision is actually taken against — because `maskContact` is lossy and
          two different addresses can produce the same mask, which would leave
          the two cards indistinguishable. */}
      {participant.displayName === undefined ? (
        <p className="customer-merge-participant__name-hint">{COPY.displayNameEmptyHint}</p>
      ) : null}
      <p className="customer-merge-participant__reference">
        {COPY.customerReference}{' '}
        <span
          className="customer-merge-participant__reference-value"
          title={participant.customerId}
          data-testid={`${testId}-customer-reference`}
        >
          {truncateIdentifier(participant.customerId)}
        </span>
      </p>
      <p className="customer-merge-participant__verified">
        {COPY.verifiedAt}{' '}
        {/* One instant format across both applications (`V01-UX-021`): the
            shared `formatInstant`, not a local `toLocaleString`. */}
        <time dateTime={participant.verifiedAt}>{formatInstant(participant.verifiedAt)}</time>
      </p>

      <h4 className="customer-merge-participant__contacts-heading">{COPY.contactsHeading}</h4>
      <ul className="customer-merge-participant__contacts" data-testid={`${testId}-contacts`}>
        {/*
          Keyed by position. `maskContact` is deterministic and lossy, so two
          addresses at one domain sharing a first character produce the *same*
          mask — and a merge survivor holds precisely that pair, which made
          `kind-maskedValue` a duplicate key that React warns may duplicate or
          omit a row. `APP10-B02` publishes no `contactId` on a merge
          participant (an id is published when an operation is addressed by it,
          and none here is), so no server identity exists to use instead. The
          index is the right key for this list and only this kind of list: it is
          a read-only, server-ordered projection that is never reordered,
          filtered, inserted into or edited in the browser.
        */}
        {participant.contacts.map((contact, index) => (
          <li className="customer-merge-participant__contact" key={index}>
            <span className="customer-merge-participant__kind">
              {contact.kind === 'EMAIL' ? COPY.kindEmail : COPY.kindPhone}
            </span>
            <span className="customer-merge-participant__value">{contact.maskedValue}</span>
            {/* Status carries its own word; the tint only reinforces it. */}
            <span className="admin-status" data-verified={contact.verified}>
              {contact.verified ? COPY.verified : COPY.unverified}
            </span>
            {contact.primary ? <span className="admin-status">{COPY.primary}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
