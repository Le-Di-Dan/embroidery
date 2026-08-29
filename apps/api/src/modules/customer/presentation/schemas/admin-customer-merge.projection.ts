/**
 * The merge case projection: an application view becomes a published payload
 * here, and only here (`APP10-B02` §7, `APP10-B03` §21).
 *
 * Lifted out of `admin-customer-merge.controller.ts` when `APP10-B03` added the
 * execute operation: serializing a view and routing a request are two jobs, and
 * the controller's remaining length is Swagger documentation for four
 * operations. Nothing about the projection changed in the move.
 *
 * Both functions are **total** — every published field is written explicitly and
 * no source object is spread into a response — so there is nowhere for a
 * normalized value, a display value, a merge pointer, a note or a contact id to
 * arrive by accident. A later edit that wanted to publish one would have to add
 * it here, in a file whose only purpose is to say what a merge surface may show.
 */
import type {
  CustomerMergeCaseView,
  MergeParticipantView,
} from '../../application/customer-merge-case.query';
import type {
  AdminCustomerMergeCasePayload,
  MergeParticipantPayload,
} from './admin-customer-merge.response';

export function toCasePayload(view: CustomerMergeCaseView): AdminCustomerMergeCasePayload {
  return {
    mergeCaseId: view.mergeCaseId,
    status: view.status,
    reason: view.reason,
    requestedByAdminId: view.requestedByAdminId,
    requestedAt: view.requestedAt.toISOString(),
    // Omitted rather than null while the case is open, matching how every other
    // optional field in this API is serialized.
    ...(view.decidedAt === undefined ? {} : { decidedAt: view.decidedAt.toISOString() }),
    ...(view.survivor === undefined ? {} : { survivor: toParticipant(view.survivor) }),
    ...(view.loser === undefined ? {} : { loser: toParticipant(view.loser) }),
    consequencePreview: {
      contactPoints: view.consequencePreview.contactPoints,
      activeSecureAccessGrants: view.consequencePreview.activeSecureAccessGrants,
      customRequests: view.consequencePreview.customRequests,
      orders: view.consequencePreview.orders,
      uploadedAssets: view.consequencePreview.uploadedAssets,
      // `APP10-B03` §10.2. Written out member by member rather than spread, for
      // the reason the rest of this file is: a readiness object that grew a
      // fourth member would otherwise reach a client without anyone deciding it
      // should.
      businessProfile: {
        loserHasProfile: view.consequencePreview.businessProfile.loserHasProfile,
        survivorHasProfile: view.consequencePreview.businessProfile.survivorHasProfile,
        conflict: view.consequencePreview.businessProfile.conflict,
      },
    },
  };
}

/** The participant projection. The masked value is the only contact form here. */
export function toParticipant(participant: MergeParticipantView): MergeParticipantPayload {
  return {
    customerId: participant.customerId,
    ...(participant.displayName === undefined ? {} : { displayName: participant.displayName }),
    verifiedAt: participant.verifiedAt.toISOString(),
    contacts: participant.contacts.map((contact) => ({
      kind: contact.kind,
      maskedValue: contact.maskedValue,
      verified: contact.verified,
      primary: contact.primary,
    })),
  };
}
