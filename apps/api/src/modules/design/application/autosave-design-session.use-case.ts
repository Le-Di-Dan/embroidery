/**
 * Design Session autosave (`APP3-B08`, `IMP-D043` PO-08).
 *
 * One operation, one durable statement: replace the working document under
 * optimistic concurrency. `ACTIVE → ACTIVE`; nothing else about the Session
 * moves.
 *
 * The ordering is the whole design. Everything expensive — placement lookup,
 * P01 structure and complexity, quantization, canonicalization, P02 geometry,
 * media eligibility — happens **before** the transaction opens, against a
 * consistent read of the Session. The transaction then contains exactly one
 * guarded UPDATE. Validating inside it would hold a row lock across work that
 * cannot fail the CAS, and revalidating after it would be too late to matter.
 *
 * Reading the Session before validating and then writing under
 * `expectedRevision` is not a race: the CAS is what decides. If another writer
 * lands between the read and the write, the revision has moved and this save
 * loses — which is precisely the contract. There is no idempotency record and no
 * replay, because a save whose outcome is unknown must be *refetched*, never
 * repeated: replaying a document blindly would resurrect an edit the customer
 * may have already undone.
 *
 * `expires_at` is never touched. The 30-day lifetime is absolute (`IMP-D043`),
 * so a Session cannot be kept alive by typing in it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  designSessionStaleWrite,
  designSessionUnauthorized,
} from '../domain/design-session-authorization';
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSession,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';
import { DesignDocumentAuthority, type DocumentRejection } from './design-document.authority';
import { SessionDocumentMediaAuthority } from './session-document-media.authority';
import { SessionPlacementResolver } from './session-placement.authority';
import { toSessionSnapshot, type DesignSessionSnapshotView } from './design-session-snapshot';

export interface AutosaveDesignSessionInput {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly document: unknown;
}

/** Refused because the document is not saveable. Distinct from a stale write. */
export class DesignDocumentRejectedError extends Error {
  constructor(readonly rejection: DocumentRejection) {
    super('That design document cannot be saved.');
    this.name = 'DesignDocumentRejectedError';
  }
}

@Injectable()
export class AutosaveDesignSessionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly documents: DesignDocumentAuthority,
    private readonly placements: SessionPlacementResolver,
    private readonly media: SessionDocumentMediaAuthority,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
  ) {}

  async execute(input: AutosaveDesignSessionInput): Promise<DesignSessionSnapshotView> {
    const id = input.sessionId as DesignSessionId;
    const session = await this.sessions.findById(id);
    // The guard already proved this Session and this caller. A row that has
    // vanished between the guard and here is answered with the same
    // non-enumerating refusal the guard itself uses.
    if (session === undefined) throw designSessionUnauthorized();

    const placement = await this.placements.resolve(session);
    if (placement === undefined) {
      // The Side or Area the Session was opened against no longer resolves, so
      // there is no authority left to judge the geometry against.
      throw new DesignDocumentRejectedError('DOCUMENT_PLACEMENT_MISMATCH');
    }

    const context = await this.media.contextFor(session);
    const outcome = this.documents.validateForSave(input.document, placement, context);
    if (!outcome.ok) throw new DesignDocumentRejectedError(outcome.rejection);

    const saved = await this.save(
      id,
      outcome.document,
      outcome.schemaVersion,
      input.expectedRevision,
    );
    return toSessionSnapshot(saved, undefined, undefined);
  }

  /**
   * The one durable statement.
   *
   * `saveDocument` is DB7's own CAS (G-DB7-19): ACTIVE, unexpired and at
   * `expectedRevision`, revision `+1`. It is reused rather than restated so
   * there is exactly one definition of what an autosave is allowed to touch.
   */
  private async save(
    id: DesignSessionId,
    document: object,
    schemaVersion: number,
    expectedRevision: number,
  ): Promise<DesignSession> {
    try {
      return await this.transactions.runInTransaction(() =>
        this.sessions.saveDocument({
          id,
          designDocument: document as Record<string, unknown>,
          documentSchemaVersion: schemaVersion,
          expectedRevision,
        }),
      );
    } catch (error: unknown) {
      // A revision, status or expiry mismatch is the published 409. Anything
      // else — a dropped connection, a serialization failure — stays what it is,
      // because reporting an outage as a conflict would tell the client to
      // refetch and retry against a database that is not answering.
      if (
        isPersistenceError(error) &&
        (error.code === 'STALE_WRITE' || error.code === 'RECORD_NOT_FOUND')
      ) {
        throw designSessionStaleWrite();
      }
      throw error;
    }
  }
}
