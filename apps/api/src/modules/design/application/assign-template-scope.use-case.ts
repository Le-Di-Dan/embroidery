/**
 * The one-time initial scope assignment (`APP3-B03B`).
 *
 * ## What this closes
 *
 * `APP3-A02` creates an unscoped `DRAFT` through the ordinary Admin UI.
 * `APP3-P01` requires a `DesignPlacementSnapshot` in **every** Design Document.
 * So until a Template has a Product Side and an Embroidery Area, `APP3-A03`
 * cannot construct its first document at all — and no accepted operation
 * assigned a scope after creation. That is the end-to-end dead end this use case
 * exists to close, and nothing more.
 *
 * ## What it deliberately is not
 *
 * `B03B_SCOPE_RULING = ONE_TIME_INITIAL_SCOPE_ASSIGNMENT_BEFORE_FIRST_VERSION`.
 * There is no rescope and no clear. The reason is not caution: once a version
 * exists, its document carries an **immutable** placement snapshot naming the
 * Side, the Area, the canvas and `pxPerMm`. Rescoping afterwards would leave
 * every saved version describing a placement the header no longer claims, and
 * `APP3-B04`'s publication guard would compare a document against geometry it
 * was never authored on. Refusing is the only answer that keeps existing
 * versions meaningful.
 *
 * ## Ordering
 *
 * The scope is resolved **before** the transaction opens — it is a read against
 * the Catalog placement port, and holding a write transaction across it would
 * widen the conflict window for no benefit. `APP3-B08` established that order
 * and `APP3-B03`'s create follows it; so does this.
 *
 * The transaction then holds exactly two writes, and they are atomic together:
 * the compare-and-set that binds the scope, and the Audit row that explains it.
 * No version, no document, no Asset association and no Outbox event — this
 * operation produces none of those, and appending one would be an endpoint
 * announcing work nobody does.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { designTemplateDraftError } from '../domain/design-template-draft.errors';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplateId,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import { DesignTemplateAuditRecorder } from './design-template-audit.recorder';
import { DesignTemplateScopeAuthority } from './design-template-scope.authority';
import { toDetailView, type TemplateDetailView } from './design-template-projection';

export interface AssignTemplateScopeCommand {
  readonly templateId: string;
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

@Injectable()
export class AssignTemplateScopeUseCase {
  constructor(
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly scopes: DesignTemplateScopeAuthority,
    private readonly audit: DesignTemplateAuditRecorder,
    private readonly transactions: TransactionManager,
  ) {}

  async assign(command: AssignTemplateScopeCommand): Promise<TemplateDetailView> {
    const templateId = command.templateId as DesignTemplateId;

    // Answered early so an unknown Template is a 404 rather than a conflict.
    // The compare-and-set is what actually enforces assignability — this read is
    // advisory and the state may change before the transaction opens — so the
    // guard below is never relaxed on the strength of it.
    const existing = await this.templates.findById(templateId);
    if (existing === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
    }

    // The exact `APP3-B03` create-scope authority, unchanged: Product exists,
    // Side belongs to it, Area hangs from that Side, neither retired. Nothing
    // here checks whether the Product is published — `IMP-D042` PO-07 makes
    // that `GRD-T01`, which is `APP3-B04`'s, and a draft scoped to an
    // unpublished Product is a perfectly ordinary draft.
    const scope = await this.scopes.resolve({
      productId: command.productId,
      productSideId: command.productSideId,
      embroideryAreaId: command.embroideryAreaId,
    });
    if (scope === undefined) {
      // Unreachable through HTTP — the body requires all three — but a partial
      // triple must fail closed rather than assign nothing and answer success.
      throw designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_INCOMPLETE');
    }

    const template = await this.transactions.runInTransaction(async () => {
      const assigned = await this.templates
        .assignInitialScope({
          id: templateId,
          productId: scope.productId,
          productSideId: scope.productSideId,
          embroideryAreaId: scope.embroideryAreaId,
        })
        .catch((error: unknown) => {
          throw translateAssignGuard(error);
        });

      await this.audit.recordScopeAssigned({
        templateId: assigned.id,
        productId: scope.productId,
        productSideId: scope.productSideId,
        embroideryAreaId: scope.embroideryAreaId,
      });
      return assigned;
    });

    // `undefined` version, always. This operation writes no version row, and the
    // whole point of the source-state guard is that there was none to read.
    return toDetailView(template, undefined);
  }
}

/**
 * The repository's compare-and-set failure, as the feature's own refusal.
 *
 * `assignInitialScope` raises a `PersistenceError`, which is not an
 * `HttpException` — left untranslated it would surface as a 500 against a
 * published 409. `APP3-B06B-C1` found exactly that defect in the Session lane
 * and `APP3-B03A` was wired for it from the start; so is this.
 */
function translateAssignGuard(error: unknown): unknown {
  if (!isPersistenceError(error)) return error;
  if (error.code === 'RECORD_NOT_FOUND') {
    return designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
  }
  return error.code === 'STALE_WRITE'
    ? designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE')
    : error;
}
