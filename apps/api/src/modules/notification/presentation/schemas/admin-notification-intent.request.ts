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
 * - no `customerId` — a customer's notification history is `ADR-DB2-003` r7
 *   territory and has no support surface in this phase;
 * - no `templateKey` free-text or `q` — a search box over an operational list is
 *   how a support screen becomes a query engine over other people's messages;
 * - no `providerMessageRef` — APP4 has no provider;
 * - no date range or cursor — the page is bounded server-side, and inventing a
 *   pagination contract for a surface that has not asked for one would freeze it
 *   into every generated client.
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
  })
  .strict()
  .meta({
    id: 'ListNotificationIntentsQuery',
    description: 'Filters the Admin notification list by lifecycle state.',
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
