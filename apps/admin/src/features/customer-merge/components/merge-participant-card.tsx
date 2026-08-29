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
      <p className="customer-merge-participant__verified">
        {COPY.verifiedAt}{' '}
        <time dateTime={participant.verifiedAt}>
          {new Date(participant.verifiedAt).toLocaleString('vi-VN')}
        </time>
      </p>

      <h4 className="customer-merge-participant__contacts-heading">{COPY.contactsHeading}</h4>
      <ul className="customer-merge-participant__contacts" data-testid={`${testId}-contacts`}>
        {participant.contacts.map((contact) => (
          <li
            className="customer-merge-participant__contact"
            key={`${contact.kind}-${contact.maskedValue}`}
          >
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
