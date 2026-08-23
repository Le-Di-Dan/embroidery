/**
 * The customer's own evidence, for one exact attempt (`APP7-B05` §18, §20).
 *
 * ### Why a second operation exists at all
 *
 * Inspection is asynchronous, so the upload response is necessarily written
 * before the inspector has run. Without this read a customer's screen could only
 * say "sent" forever, or guess — and `APP7-G01` §12.2 requires the three facts
 * (transferred / evidence submitted / verified) to stay separately truthful,
 * which needs a way to observe the middle one after the fact.
 *
 * ### It reads one attempt, never an order's worth
 *
 * The chain proved is the same one the upload proves: grant → request → order →
 * live `DEPOSIT` obligation → the exact attempt named. Only that attempt's
 * associations are listed. No accepted document says a customer may see every
 * attempt's evidence at once, and aggregating across a retry's attempts would
 * invent one — LC-16 makes each retry a **new** attempt with its own set.
 *
 * ### Zero-write, by construction
 *
 * Nothing in this file writes. It holds no asset writer, no obligation writer
 * and no outbox: the two collaborators it does hold are the authorizer, which
 * takes locks and compares, and two readers. It changes no payment state and no
 * asset state, and it never dispatches an inspection.
 *
 * ### It cannot serve a byte
 *
 * There is no content operation, no object key, no bucket, no URL and no
 * presign anywhere on this surface. Binary delivery is `APP7-B06`'s, Admin-only
 * and `ACCEPTED`-only; this answers with metadata and a status and nothing else.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PaymentTransferEvidenceRepository, TransactionManager } from '@embroidery/persistence';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import {
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
} from '../../domain/evidence/transfer-evidence.policy';
import { EvidenceAttemptAuthorizer } from './evidence-attempt.authorizer';
import {
  toTransferEvidenceItem,
  type TransferEvidenceItemView,
  type TransferEvidenceListView,
} from './transfer-evidence.view';

@Injectable()
export class ReadTransferEvidence {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly authorizer: EvidenceAttemptAuthorizer,
    private readonly evidence: PaymentTransferEvidenceRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  /**
   * Lists this attempt's evidence, or refuses indistinguishably.
   *
   * `requireOpenAttempt` is false: a customer whose attempt has settled or
   * expired must still be able to see what they submitted. G01 §7.2 closes an
   * attempt to *further* evidence, never to reading the evidence already there,
   * and hiding it after a decision would destroy the customer's own record of
   * what the Admin looked at.
   *
   * The transaction exists for the locks the authorizer takes, not for a write:
   * there is none.
   */
  async read(input: {
    readonly token: string;
    readonly attemptId: string;
    readonly now: Date;
  }): Promise<TransferEvidenceListView> {
    return this.transactions.runInTransaction(async () => {
      const authorized = await this.authorizer.authorize({
        token: input.token,
        attemptId: input.attemptId,
        now: input.now,
        requireOpenAttempt: false,
      });

      const associations = await this.evidence.listForAttempt(authorized.attempt.id);
      if (associations.length === 0) {
        // Zero evidence is an ordinary, valid payment case (`APP7-G01` §7.6), so
        // it is an empty list and not a refusal.
        return { evidence: [] };
      }

      // The scoped batch read: an id outside the customer-upload lane is simply
      // absent, and one query answers for all five rather than one per row.
      const assets = await this.assets.findScopedByIds(
        associations.map((row) => row.assetId as AssetId),
        {
          kind: TRANSFER_EVIDENCE_ASSET_KIND,
          classification: TRANSFER_EVIDENCE_CLASSIFICATION,
        },
      );
      const byId = new Map(assets.map((asset) => [asset.id as string, asset]));

      const items: TransferEvidenceItemView[] = [];
      for (const association of associations) {
        const asset = byId.get(association.assetId);
        // An association whose asset the lane scope does not match is dropped
        // rather than reported with a fabricated status. It is unreachable —
        // intake writes both in one flow — and a `!` here would be the one place
        // a malformed pair became a `TypeError` on a customer's payment screen.
        if (asset !== undefined) {
          items.push(toTransferEvidenceItem(association, asset));
        }
      }
      return { evidence: items };
    });
  }
}
