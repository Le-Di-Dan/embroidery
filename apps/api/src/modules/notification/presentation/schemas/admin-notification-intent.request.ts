/**
 * Request-side validation for the two Admin notification operations
 * (`APP4-B08` §9, §13).
 *
 * Both schemas are `.strict()`: an unknown field is a client bug worth
 * reporting, and silently dropping one is how a caller believes it filtered
 * something it did not.
 *
 * ### The list filter is one closed-set status and nothing else
 *
 * Deliberately absent, and each for its own reason:
 *
 * - no `recipient` / `email` / `phone` / `contact` — the masked recipient exists
 *   so an operator can *recognise* a destination, not look one up. A filter on
 *   it would answer "does this address have notifications?" for any address, and
 *   filtering on the mask is the same question with fewer steps;
 * - no `templateKey` free-text or `q` — a search box over an operational list is
 *   how a support screen becomes a query engine over other people's messages;
 * - no `providerMessageRef` — APP4 has no provider;
 * - no date range or cursor — the page is bounded server-side, and inventing a
 *   pagination contract for a surface that has not asked for one would freeze it
 *   into every generated client.
 *
 * ### `customerId` is the one narrowing that was added, and why it is different
 *
 * The Product Owner authorized it for the `APP4-A01` support screen, which shows
 * one Customer's delivery failures beside their contacts and grants. It is not a
 * search parameter and it is not the customer history `ADR-DB2-003` r7 rules
 * out: it takes an id the operator already resolved and follows a *persisted*
 * reference — `recipient_contact_point_id` to the contact point's owner — rather
 * than matching a value they typed.
 *
 * The difference that matters is directional. A recipient filter answers "whose
 * address is this?" for any address a caller can guess. This one answers "what
 * failed for a Customer I can already name", and a caller who cannot name one
 * learns nothing from it.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { PUBLISHED_INTENT_STATES } from './admin-notification-intent.response';

export const listNotificationIntentsQuerySchema = z
  .object({
    status: z
      .enum(PUBLISHED_INTENT_STATES)
      .optional()
      .meta({
        description:
          'Show only notifications in this lifecycle state. Omit for the most recent ' +
          'notifications in every state.',
      }),
    customerId: z
      .string()
      .uuid()
      .optional()
      .meta({
        description:
          'Show only notifications explicitly bound to this Customer. A notification is bound ' +
          'when the contact point it was addressed to belongs to the Customer — a stored ' +
          'reference, never a match on the masked destination, the template or the time. ' +
          'Notifications sent to a destination that is not a contact point have no owner and ' +
          'are never returned by this filter. Omit for the global operational list.',
        example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
      }),
  })
  .strict()
  .meta({
    id: 'ListNotificationIntentsQuery',
    description: 'Filters the Admin notification list by lifecycle state and bound Customer.',
  });

export class ListNotificationIntentsQuery extends createZodDto(
  listNotificationIntentsQuerySchema,
) {}

/**
 * UUID path parameter — rejected before any repository call.
 *
 * The origin intent id comes from the path and only the path. It is the entire
 * input to a replay: everything else — which template, which channel, which
 * masked recipient, which business object, which sealed envelope — is read from
 * the persisted record, so there is no field in which a caller could redirect a
 * customer's credential to somewhere else.
 */
export const notificationIntentIdParamSchema = z.object({ intentId: z.string().uuid() }).strict();

export class NotificationIntentIdParam extends createZodDto(notificationIntentIdParamSchema) {}

registerZodDtos(ListNotificationIntentsQuery, NotificationIntentIdParam);
