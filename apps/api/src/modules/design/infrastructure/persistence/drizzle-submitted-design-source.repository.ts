/**
 * The durable half of the submitted-design source read (`APP6-B07` §5, §13).
 *
 * One statement, one row, four columns. The session's identity, the handover
 * pointer back to the request and the `SUBMITTED` lifecycle state are all
 * expressed as the `WHERE` of a single query, so PostgreSQL evaluates them
 * against one consistent snapshot. Asking in sequence — find the session, then
 * check whose it is, then check its state — would open windows in which the TTL
 * sweep could commit, and the earlier answers would have proved nothing about
 * the document finally returned.
 *
 * ## The pointer is correlated, not trusted
 *
 * `submitted_request_id = :requestId` is the other half of `APP6-B07` §13. The
 * request names a session, and the session must name the same request back; a
 * session belonging to another customer, another placement or another request is
 * therefore unreachable rather than fetched and then rejected. There is no
 * ordering of these predicates in which a foreign row is a candidate, and no
 * fallback to "the latest active session", the design case's current version, the
 * Template document or a blank document — this file has one statement and it has
 * no `OR`.
 *
 * ## `SUBMITTED`, and nothing looser
 *
 * `APP5-B01` transitions the session to `SUBMITTED` at handover, and only a row
 * still in that state is truthful submitted evidence. An `ACTIVE`, `EXPIRED` or
 * `DELETED` row matches nothing here, which is the same answer a purged row
 * gets — absence — because the caller must not be able to tell them apart.
 *
 * ## No secret column
 *
 * `session_secret_hash` is neither selected nor compared. `expires_at`,
 * `last_activity_at`, `template_id`, `template_version` and the placement chain
 * are likewise not projected: the four columns listed are what `APP6-B08` needs,
 * and a column that is never retrieved is redaction nobody downstream can
 * forget.
 *
 * There is no `insert`, `update`, `delete` or `for('update')` in this file, and
 * the absence is the guarantee rather than an accident of what the route needed.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type {
  SubmittedDesignSource,
  SubmittedDesignSourceLookup,
  SubmittedDesignSourceRepository,
} from '../../domain/repositories/submitted-design-source.repository';

const { designSessions } = schema;

/** LC-07's handover state. The only state that is submitted evidence. */
const SUBMITTED_SESSION_STATE = 'SUBMITTED';

@Injectable()
export class DrizzleSubmittedDesignSourceRepository
  extends DrizzleRepository
  implements SubmittedDesignSourceRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findSubmittedSource(
    lookup: SubmittedDesignSourceLookup,
  ): Promise<SubmittedDesignSource | undefined> {
    return this.run('findSubmittedSource', async () => {
      const [row] = await this.db
        .select({
          id: designSessions.id,
          designDocument: designSessions.designDocument,
          documentSchemaVersion: designSessions.documentSchemaVersion,
          autosaveRevision: designSessions.autosaveRevision,
        })
        .from(designSessions)
        .where(
          and(
            eq(designSessions.id, lookup.sessionId),
            eq(designSessions.submittedRequestId, lookup.requestId),
            eq(designSessions.status, SUBMITTED_SESSION_STATE),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        sessionId: row.id,
        document: row.designDocument,
        documentSchemaVersion: row.documentSchemaVersion,
        revision: row.autosaveRevision,
      };
    });
  }
}
