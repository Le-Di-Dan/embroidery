/**
 * Path validation for Admin transfer-evidence delivery (`APP7-B06` §10, §26).
 *
 * `.strict()`: an unknown path field is a 400, not a silently ignored one. There
 * is no query object and no body at all — no size parameter, no format
 * parameter, no `?variant=`, no `?download=` and, above all, no `assetId` and no
 * `attemptId`. A rendition selector is not merely unimplemented here; it is
 * absent, because the one deliverable artifact is the inspection-approved source
 * and any parameter that could choose between artifacts is a parameter that
 * could eventually choose something else.
 *
 * One segment, and it is `payment_transfer_evidence.id` — the association id
 * `APP7-B04` publishes. Refusing a malformed UUID at the boundary keeps it from
 * arriving as a predicate that matches nothing, which would be
 * indistinguishable from a legitimately absent row.
 *
 * It is not a credential and is not trusted alone. The operator's identity comes
 * from `AuthenticatedAdminGuard`; this only says *which* evidence is being asked
 * for, and the association, the attempt it names and the asset behind it are
 * proved against the database on every request.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const adminPaymentEvidenceParamSchema = z.object({ evidenceId: z.string().uuid() }).strict();

export class AdminPaymentEvidenceParam extends createZodDto(adminPaymentEvidenceParamSchema) {}

registerZodDtos(AdminPaymentEvidenceParam);
