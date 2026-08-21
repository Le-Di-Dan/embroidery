/**
 * Publishes the `APP6-G01-C1` agreement content (`APP6-B10`).
 *
 * `APP6-G01-C1` §5.4 shipped the two customer-facing policy texts as **authority
 * only** and routed the reader and the publishing caller here, naming the
 * precedent it wanted followed: the APP4 dataset shipped with `APP4-G01` and its
 * reader and publisher with `APP4-B01-C1`, and `APP6-G01`'s policy dataset with
 * `APP6-B01`. So this is that publisher's agreement sibling — the same
 * admin-bearing bootstrap seam, the same drift-by-comparison idempotency, and
 * the same rule that nothing is published from a runtime string literal.
 *
 * It lives in **Content** rather than beside the two policy publishers because
 * `DB2_BOUNDED_CONTEXT_MAP.md` gives Content the Agreement aggregate, and
 * `PolicyModule` publishes `policy_configurations` and nothing else. The two
 * are different tables, different aggregates and different immutability
 * mechanisms; sharing a module would have been a filing decision, not a design.
 *
 * ### It drafts nothing
 *
 * Every sentence comes from the committed dataset, which was normalized from
 * accepted authority with a per-sentence trace table. This class contains no
 * Vietnamese text, no fee, no refund figure, no warranty, no waiver, no timing
 * promise and no cancellation right — searching this file for one finds nothing,
 * which is the property that makes "B10 publishes and drafts nothing" checkable
 * rather than asserted.
 *
 * ### Idempotency, and why it is a comparison
 *
 * `ensureAgreement` makes the *container* idempotent while `addVersion` always
 * appends, so a bootstrap that ran on every container start would accumulate an
 * identical version per boot. Each type is therefore published only when it has
 * no current version, or when the current version's content hash, language or
 * status differs from the dataset. The hash is the comparand rather than the
 * text: `content_hash` is exactly what `GRD-008` binds an approval to, so
 * "unchanged" here means unchanged *to the thing acceptance is bound by*.
 *
 * Drift is corrected by **appending**: `publishVersion` supersedes the outgoing
 * version and advances `agreements.current_version_id` in one transaction, and
 * the superseded row keeps its content, hash and instants forever. Nothing here
 * updates a published version, and the AGG-21 contract offers no method that
 * would (an S24 trigger is the physical backstop).
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  loadApp6AgreementContentDataset,
  newId,
  type App6AgreementContent,
} from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { sha256Hex } from '../../asset/domain/canonical-json';
import {
  AGREEMENT_REPOSITORY,
  type AgreementRepository,
  type AgreementVersionId,
} from '../domain/repositories/agreement.repository';

/**
 * How `@embroidery/database` is located at runtime.
 *
 * `require.resolve` rather than `import.meta.url`, and injectable as a parameter
 * for the reason `PublishApp6PolicyUseCase` records: the API is CommonJS, and a
 * test points this at a fixture package without touching module resolution.
 */
export type PackageJsonResolver = () => string;

const resolveDatabasePackageJson: PackageJsonResolver = () =>
  require.resolve('@embroidery/database/package.json');

export interface AgreementPublicationResult {
  readonly agreementType: string;
  readonly outcome: 'published' | 'unchanged';
  readonly version: number;
  readonly contentHash: string;
}

@Injectable()
export class PublishApp6AgreementsUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(AGREEMENT_REPOSITORY) private readonly agreements: AgreementRepository,
  ) {}

  /**
   * Publishes every agreement type whose content is missing or has drifted.
   *
   * `adminId` is the Admin the staff bootstrap just created or reused. It is
   * accepted and deliberately **not stored**: TBL-069 carries no
   * `created_by_admin_id`, unlike `policy_configuration_versions`, so inventing
   * a column to record it would be a schema change this checkpoint does not own.
   * Requiring it anyway keeps the two publishers on one seam — publication
   * happens only where a real Admin has been resolved, never from the worker and
   * never from a request — and makes that a fact about the signature rather than
   * about the one call site that exists today.
   */
  async publish(
    adminId: string,
    resolvePackageJson: PackageJsonResolver = resolveDatabasePackageJson,
  ): Promise<AgreementPublicationResult[]> {
    if (adminId.trim() === '') {
      throw new Error('Agreement publication requires a resolved Admin identity.');
    }

    const dataset = loadApp6AgreementContentDataset(resolvePackageJson());
    const results: AgreementPublicationResult[] = [];

    // Sequential rather than concurrent, matching `PublishApp6PolicyUseCase`:
    // each type opens its own transaction, and racing them would interleave two
    // bootstrap writes for no gain on a one-shot CLI. Two types drifting is two
    // independent appends, not one atomic policy swap — a customer mid-approval
    // reads the effective set in one query either way.
    for (const agreement of dataset.agreements) {
      results.push(await this.publishOne(agreement));
    }
    return results;
  }

  private async publishOne(agreement: App6AgreementContent): Promise<AgreementPublicationResult> {
    const contentHash = sha256Hex(agreement.content);

    // The read runs outside the write transaction on purpose: it is a plain
    // lookup, and holding one open across both types would serialize a bootstrap
    // step that has no cross-type invariant.
    const current = await this.agreements.currentVersion(agreement.agreementType);
    if (
      current !== undefined &&
      current.status === 'PUBLISHED' &&
      current.contentHash === contentHash &&
      current.language === agreement.language
    ) {
      return {
        agreementType: agreement.agreementType,
        outcome: 'unchanged',
        version: current.version,
        contentHash,
      };
    }

    return this.transactions.runInTransaction(async () => {
      const container = await this.agreements.ensureAgreement(
        agreement.agreementType,
        agreement.name,
      );
      const draft = await this.agreements.addVersion({
        id: newId() as AgreementVersionId,
        agreementId: container.id,
        content: agreement.content,
        language: agreement.language,
      });
      // `publishVersion` supersedes the outgoing PUBLISHED row and advances
      // `agreements.current_version_id` in this same transaction, so no window
      // exists in which the type has two published versions or none.
      const published = await this.agreements.publishVersion(draft.id, contentHash, new Date());

      return {
        agreementType: agreement.agreementType,
        outcome: 'published' as const,
        version: published.version,
        contentHash,
      };
    });
  }
}
