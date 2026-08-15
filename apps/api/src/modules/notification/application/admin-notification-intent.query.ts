/**
 * The Admin notification delivery read (`APP4-B08` §9–§12).
 *
 * It answers two questions and no others: *was this notification delivered?* and
 * *what safe failure class was recorded?* Everything it returns is either a
 * server-generated identifier, a template reference, a lifecycle state, or a
 * bounded error class an operator can act on.
 *
 * ### The status is the persisted one
 *
 * No effective state is computed. DB3 owns the five values and their meaning,
 * and a projection that re-derived one would be a second lifecycle authority
 * that could disagree with the row an operator finds in the database.
 *
 * There is deliberately no `canReplay` flag either. Whether a `FAILED` intent can
 * actually be replayed depends on the underlying challenge or grant still being
 * live, which this list does not check — computing it per row would mean a
 * business lookup for every entry on the page, and computing it from status
 * alone would be a confident lie. `APP4-A01` attempts the replay and handles the
 * canonical conflict.
 *
 * ### The attempt timeline is evidence, not a machine
 *
 * `notification_delivery_attempts` is append-only. This class orders those rows
 * and projects three fields from each; it derives no attempt number, writes no
 * counter and infers nothing the worker did not record.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationDeliveryOutcome, NotificationIntentState } from '@embroidery/database';

import {
  NOTIFICATION_INTENT_REPOSITORY,
  type IntentId,
  type NotificationIntentRepository,
} from '../domain/repositories/notification-intent.repository';

/**
 * The page size, and the reason there is no `limit` parameter.
 *
 * A bounded default rather than caller-supplied paging: B08's list exists for an
 * operator triaging recent delivery failures, `APP4-A01` renders one screen of
 * it, and a keyset cursor framework would be a pagination contract invented for
 * a surface that has not asked for one. If A01 later needs paging, it arrives as
 * the repository's existing keyset convention rather than as a second one here.
 */
export const ADMIN_INTENT_PAGE_SIZE = 50;

export interface AdminAttemptView {
  readonly attemptedAt: Date;
  readonly channel: string;
  readonly outcome: NotificationDeliveryOutcome;
  readonly errorClass: string | undefined;
}

export interface AdminNotificationIntentView {
  readonly intentId: string;
  readonly status: NotificationIntentState;
  readonly channel: string;
  readonly recipientMasked: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly createdAt: Date;
  readonly attempts: readonly AdminAttemptView[];
}

export interface AdminIntentListQuery {
  readonly status?: NotificationIntentState | undefined;
  /**
   * Narrows to the notifications explicitly bound to one Customer.
   *
   * Passed straight through to the repository, which resolves it through the
   * persisted contact-point reference. This class derives nothing from it and
   * compares no projected field against it — in particular it never filters the
   * page it got back by `recipientMasked`, which would be the mask-inference
   * `APP4-A01` §8 forbids, wearing the clothes of a Customer filter.
   */
  readonly customerId?: string | undefined;
}

@Injectable()
export class AdminNotificationIntentQuery {
  constructor(
    @Inject(NOTIFICATION_INTENT_REPOSITORY)
    private readonly intents: NotificationIntentRepository,
  ) {}

  async list(query: AdminIntentListQuery): Promise<readonly AdminNotificationIntentView[]> {
    const rows = await this.intents.listForAdmin({
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
      limit: ADMIN_INTENT_PAGE_SIZE,
    });

    // One timeline read per row on a bounded page. A join would fold the two
    // shapes into one result set that then has to be regrouped, and the regroup
    // is where an attempt gets attached to the wrong intent.
    return Promise.all(
      rows.map(async (row) => ({
        intentId: row.id,
        status: row.status,
        channel: row.channel,
        recipientMasked: row.recipientMasked,
        templateKey: row.templateKey,
        templateVersion: row.templateVersion,
        createdAt: row.createdAt,
        attempts: await this.timelineFor(row.id),
      })),
    );
  }

  /**
   * The ordered attempt evidence for one intent.
   *
   * A function whose return type has nowhere to put `params`, a provider body, a
   * recipient or an envelope — so no later edit to the projection can leak one
   * without also changing this signature.
   */
  private async timelineFor(intentId: IntentId): Promise<readonly AdminAttemptView[]> {
    const attempts = await this.intents.listAttempts(intentId);
    return attempts.map((attempt) => ({
      attemptedAt: attempt.attemptedAt,
      channel: attempt.channel,
      outcome: attempt.outcome,
      errorClass: attempt.errorClass,
    }));
  }
}
