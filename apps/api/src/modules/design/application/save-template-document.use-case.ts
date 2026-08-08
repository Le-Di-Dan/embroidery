/**
 * The one Design Template draft save (`APP3-B03A`).
 *
 * Everything expensive happens **before** the transaction opens: reading the
 * Template, building the media allowlist and validating the document are reads
 * and pure computation, and holding a write transaction across them would widen
 * the conflict window for no benefit. The transaction contains only the writes
 * that must be atomic — the compare-and-set, the version row, the association
 * reconciliation, the normalization events and the audit row.
 *
 * The order inside it is the one `IMP-D046` PO-04 requires and `APP3-G06`
 * recorded the reason for: the association is written **first**, then the event
 * that refers to it. An event appended before the association that defines its
 * work cannot carry its context.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId, isPersistenceError } from '@embroidery/database';
import { OutboxEventStore, TransactionManager } from '@embroidery/persistence';
import {
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';

import { designTemplateDraftError } from '../domain/design-template-draft.errors';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplateId,
  type DesignTemplateRepository,
  type DesignTemplateVersionId,
} from '../domain/repositories/design-template.repository';
import { DesignTemplateAuditRecorder } from './design-template-audit.recorder';
import { TemplateDocumentAuthority } from './template-document.authority';
import { TemplateDocumentMediaAuthority, assetIdsIn } from './template-document-media.authority';
import { toDetailView, type TemplateDetailView } from './design-template-projection';

export interface SaveTemplateDocumentCommand {
  readonly templateId: string;
  readonly expectedCurrentVersion: number;
  readonly document: unknown;
}

/** A document the authorities refused. Carries the reason, not the findings. */
export class TemplateDocumentRejectedError extends Error {
  constructor(readonly rejection: string) {
    super('This design document cannot be saved.');
    this.name = 'TemplateDocumentRejectedError';
  }
}

@Injectable()
export class SaveTemplateDocumentUseCase {
  constructor(
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly documents: TemplateDocumentAuthority,
    private readonly media: TemplateDocumentMediaAuthority,
    private readonly audit: DesignTemplateAuditRecorder,
    private readonly outbox: OutboxEventStore,
    private readonly transactions: TransactionManager,
  ) {}

  async save(command: SaveTemplateDocumentCommand): Promise<TemplateDetailView> {
    const templateId = command.templateId as DesignTemplateId;
    const template = await this.templates.findById(templateId);
    if (template === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
    }

    // Refused here as well as in the compare-and-set. This read is advisory —
    // the status could change before the transaction — so the CAS is what
    // actually enforces it; answering early only avoids validating a document
    // for a Template that plainly cannot take one.
    if (template.status !== 'DRAFT') {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_EDITABLE');
    }

    const context = await this.media.contextFor(command.document);
    const outcome = this.documents.validateForSave(command.document, context);
    if (!outcome.ok) {
      throw new TemplateDocumentRejectedError(outcome.rejection);
    }

    // Read from the **canonical** document, not the request: quantization and
    // canonicalization are what decide the persisted references, and an
    // association derived from the raw body could name an Asset the saved
    // document does not.
    const referencedAssetIds = assetIdsIn(outcome.document);

    const version = await this.transactions.runInTransaction(async () => {
      const saved = await this.templates
        .saveDraftVersion({
          id: newId() as DesignTemplateVersionId,
          designTemplateId: templateId,
          expectedCurrentVersion: command.expectedCurrentVersion,
          designDocument: outcome.document as unknown as Record<string, unknown>,
          documentSchemaVersion: outcome.schemaVersion,
        })
        .catch((error: unknown) => {
          throw translateSaveGuard(error);
        });

      for (const assetId of referencedAssetIds) {
        const association = await this.templates.ensureAssetAssociation(templateId, assetId);
        // Only a new association asks for work. An unchanged one has either been
        // normalized already or has an in-flight request, and re-appending would
        // queue the same job again on every save of an unedited document.
        if (!association.created) continue;

        await this.outbox.append({
          eventType: ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
          aggregateKind: 'ASSET',
          aggregateId: assetId,
          payload: {
            ...buildAssetNormalizationRequestedPayload({
              assetId,
              associationRef: {
                kind: 'DESIGN_TEMPLATE_ASSET',
                designTemplateAssetId: association.designTemplateAssetId,
              },
            }),
          },
          payloadSchemaVersion: ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
        });
      }

      await this.audit.recordDraftVersionSaved({
        templateId,
        version: saved.version,
      });
      return saved;
    });

    // Projected from what was persisted, never echoed from the request: the
    // canonical document differs from the caller's by quantization, and the
    // response must be the durable truth.
    return toDetailView(template, version);
  }
}

/**
 * The repository's compare-and-set failure, as the feature's own refusal.
 *
 * `saveDraftVersion` raises a `PersistenceError`, which is not an
 * `HttpException` — left untranslated it would surface as a 500 against a
 * published 409. `APP3-B06B-C1` found exactly this defect in the Session lane,
 * so it is wired here from the start.
 */
function translateSaveGuard(error: unknown): unknown {
  if (!isPersistenceError(error)) return error;
  if (error.code === 'RECORD_NOT_FOUND') {
    return designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
  }
  return error.code === 'STALE_WRITE'
    ? designTemplateDraftError('DESIGN_TEMPLATE_VERSION_CONFLICT')
    : error;
}
