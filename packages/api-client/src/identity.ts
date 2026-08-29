/**
 * Who is calling, and how they proved it: staff sessions (`APP1`), customer
 * contact verification and secure-link resolution (`APP4-B03`, `APP4-B04`,
 * `APP4-B06`), and the Admin customer-support and notification-delivery surface
 * (`APP4-B07`, `APP4-B08`).
 *
 * The two actors are grouped together because they are one subject seen from two
 * sides — a customer identity, and the operator surface that supports it — and
 * because the secure-link primitives every other domain's customer surface
 * depends on are defined by this one.
 *
 * Every customer-facing operation here carries its credential in a request
 * **body**, never a path or query parameter (`ADR-APP4-001` §11). That rule is
 * restated in the comments below because it is the reason several of these are a
 * `POST` that writes nothing.
 */

// Staff session operations (APP1). Exposed on the public boundary so feature
// and server code (Admin login screen, server-side session resolution) never
// deep-imports the generated tree.
export { staffSessionCreate, staffSelfGet, staffSessionDelete } from './generated/embroidery-api';
export type {
  StaffLoginRequest,
  StaffSelfGet200,
  CurrentStaffResponse,
} from './generated/embroidery-api.schemas';

// Public contact-verification operations (APP4-B03, APP4-B04), consumed by the
// Storefront verification capability (APP4-S01). Exposed here so that feature
// never deep-imports the generated tree.
//
// `publicVerificationReadStatus` is included deliberately: the refusals carry no
// business error code, so a 422 mismatch and a 422 expired challenge — and a 429
// lockout and a 429 rate limit — are indistinguishable by code alone. The status
// read is the only way to resolve an authoritative terminal state after a
// refusal, and the alternative is parsing human-readable messages.
export {
  publicVerificationIssue,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
  publicVerificationReadStatus,
} from './generated/embroidery-api';
export {
  // Values, not just types: the contact kind, the purpose and the lifecycle
  // state are all things the UI branches on, and a mistyped string literal is a
  // comparison that is simply never true.
  IssueVerificationChallengeBodyContactKind,
  IssueVerificationChallengeBodyPurpose,
  VerificationChallengeStatusResponseState,
} from './generated/embroidery-api.schemas';
export type {
  IssueVerificationChallengeBody,
  SubmitVerificationAttemptBody,
  VerificationChallengeResponse,
  VerificationChallengeStatusResponse,
} from './generated/embroidery-api.schemas';

// Public secure-link resolution (APP4-B06), consumed by the Storefront
// secure-link landing (APP4-S02). Exposed here so that feature never
// deep-imports the generated tree.
//
// It crosses alone. There is no companion operation and there must not be one:
// every token that does not open a live grant — unknown, expired, revoked,
// superseded, wrong target, wrong purpose — answers one identical
// `404 SECURE_LINK_UNAVAILABLE`, and a second "why did that fail" operation
// beside it would be the enumeration oracle the collapse exists to prevent
// (`APP4-G01` PO-04, approved annotation `634:59`).
//
// The token travels in `ResolveSecureLinkBody` — a request **body**, never a
// path segment, query parameter or header — which is what keeps a bearer
// credential out of every access log between the browser and the API. The type
// is exported so the caller names the wire shape at the transport seam rather
// than assembling an object literal that would compile just as well with the
// token in the wrong field.
//
// `SecureLinkResolutionResponseScopeKind` is re-exported as a **value** because
// the landing page branches on the scope it was granted, and a mistyped string
// literal is a comparison that is simply never true.
export { publicSecureLinkResolve } from './generated/embroidery-api';
export { SecureLinkResolutionResponseScopeKind } from './generated/embroidery-api.schemas';
export type {
  ResolveSecureLinkBody,
  SecureLinkResolutionResponse,
} from './generated/embroidery-api.schemas';

// Admin Customer support and notification delivery (APP4-B07, APP4-B08),
// consumed by the Admin customer-access support screen (APP4-A01). Exposed here
// so that feature never deep-imports the generated tree.
//
// Five operations, and the shape of the set is the boundary. There is no Admin
// grant *issue* or *reissue* here and there must not be: revocation mints
// nothing, and restoring access is a fresh issue through the business flow
// (`APP4-B05`), which has no HTTP surface at all. There is no customer list,
// create, update or merge, because none exists to export.
//
// `adminCustomerSupportResolve` is the screen's entry point and the one
// operation that carries a real contact. It takes `ResolveCustomerByContactBody`
// — a request **body**, never a query parameter — which is what keeps an email
// or a phone number out of every access log and browser history entry between
// the operator and the API. The body type is exported so the caller names the
// wire shape at the transport seam instead of assembling a literal that would
// compile just as well with the value in the wrong field.
//
// Three enums cross as **values**, because the screen branches on each and a
// mistyped string literal is a comparison that is simply never true:
// `ResolveCustomerByContactBodyContactKind` (which kind the operator is
// submitting), `AdminNotificationIntentListStatus` (the screen asks the server
// for FAILED rather than downloading everything and filtering) and
// `NotificationReplayResponseOutcome` — the authoritative CREATED/EXISTING the
// replay states are keyed on, which exists precisely so a client never has to
// infer a duplicate from timing or a remembered id.
export {
  adminCustomerSupportResolve,
  adminCustomerSupportDetail,
  adminCustomerSupportGrants,
  adminSecureGrantRevoke,
  adminNotificationIntentList,
  adminNotificationIntentReplay,
} from './generated/embroidery-api';
export {
  ResolveCustomerByContactBodyContactKind,
  AdminCustomerContactResponseKind,
  AdminSecureGrantResponseStatus,
  AdminNotificationIntentListStatus,
  AdminNotificationIntentResponseStatus,
  AdminNotificationAttemptResponseOutcome,
  NotificationReplayResponseOutcome,
} from './generated/embroidery-api.schemas';
export type {
  ResolveCustomerByContactBody,
  AdminCustomerResolutionResponse,
  AdminCustomerDetailResponse,
  AdminCustomerContactResponse,
  AdminCustomerGrantsResponse,
  AdminSecureGrantResponse,
  RevokeSecureGrantBody,
  AdminNotificationIntentListParams,
  AdminNotificationIntentListResponse,
  AdminNotificationIntentResponse,
  AdminNotificationAttemptResponse,
  NotificationReplayResponse,
} from './generated/embroidery-api.schemas';

// Admin Customer profile and contact maintenance (APP10-B01), consumed by the
// Admin customer-access support screen (APP10-A01).
//
// Three operations, and the shape of the set is again the boundary. There is no
// customer create, no customer list and no contact **create** here, and there
// must not be: a Customer identity is possession of a verified channel, so a
// staff endpoint that minted or rewrote a contact value or a verification
// instant would replace a proof with a session. What is exported is exactly the
// three writes that need no new evidence — patch the two profile fields an
// operator maintains, move the primary designation between contacts that are
// already verified, and retire one.
//
// All three answer `204` and republish nothing, which is deliberate and is why
// the caller re-reads `adminCustomerSupportDetail` afterwards instead of
// predicting the new state from what it just sent.
//
// `UpdateCustomerProfileBody` crosses as a type so the caller names the wire
// shape at the transport seam. Its two fields are tri-state — omitted leaves a
// value unchanged, `null` clears it — and assembling that literal blind is how
// a "clear the note" would arrive as "leave the note alone".
export {
  adminCustomerUpdate,
  adminCustomerContactPromote,
  adminCustomerContactDeactivate,
} from './generated/embroidery-api';
export type { UpdateCustomerProfileBody } from './generated/embroidery-api.schemas';

// Admin Customer merge lifecycle and execution (APP10-B02, APP10-B03),
// consumed by the Admin guarded merge workflow (APP10-A02).
//
// Four operations, and again the shape of the set is the boundary. There is no
// merge **list**, no duplicate-candidate search and no unmerge, because none
// exists to export: a case is addressed by the id its own creation returned, and
// `customer_merge_events` is written by B03 but published by no HTTP operation
// at all. Both participants are chosen by the operator through the exact-contact
// resolver above; neither this barrel nor the API offers any other way to name a
// Customer.
//
// `adminCustomerMerge_execute` takes **no body** on purpose: survivor and loser
// come from the case, so no caller can tell it to merge a different pair, swap
// them, or skip a step. `OpenCustomerMergeBody` and `RejectCustomerMergeBody`
// cross as types so the two reasons — why the case was raised, and why it was
// declined — are named at the transport seam; they are different fields on
// different operations and the case row keeps only the first.
//
// Two enums cross as **values** because the screen branches on each and a
// mistyped literal is a comparison that is never true:
// `AdminCustomerMergeCaseResponseStatus` (REQUESTED / EXECUTED / REJECTED — the
// authoritative case state, never derived from a local mutation) and
// `AdminCustomerMergeExecutedResponseOutcome`, whose ALREADY_EXECUTED exists
// precisely so a client never has to infer a replay from timing.
export {
  adminCustomerMergeOpen,
  adminCustomerMergeDetail,
  adminCustomerMergeExecute,
  adminCustomerMergeReject,
} from './generated/embroidery-api';
export {
  AdminCustomerMergeCaseResponseStatus,
  AdminCustomerMergeExecutedResponseOutcome,
  MergeParticipantContactResponseKind,
} from './generated/embroidery-api.schemas';
export type {
  OpenCustomerMergeBody,
  RejectCustomerMergeBody,
  AdminCustomerMergeOpenedResponse,
  AdminCustomerMergeExecutedResponse,
  AdminCustomerMergeCaseResponse,
  MergeParticipantResponse,
  MergeParticipantContactResponse,
  MergeConsequencePreviewResponse,
  MergeBusinessProfileReadinessResponse,
} from './generated/embroidery-api.schemas';
