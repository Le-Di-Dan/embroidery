import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { DESIGN_TEMPLATE_REPOSITORY } from './domain/repositories/design-template.repository';
import { DrizzleDesignTemplateRepository } from './infrastructure/persistence/drizzle-design-template.repository';
import { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';
import { DesignTemplateDraftService } from './application/design-template-draft.service';
import { DesignTemplateQuery } from './application/design-template.query';
import { DesignTemplateScopeAuthority } from './application/design-template-scope.authority';
import { SaveTemplateDocumentUseCase } from './application/save-template-document.use-case';
import { TemplateDocumentAuthority } from './application/template-document.authority';
import { TemplateDocumentMediaAuthority } from './application/template-document-media.authority';
import { AdminDesignTemplateController } from './presentation/admin-design-template.controller';

/**
 * The Admin Design Template surface (`APP3-B03`).
 *
 * A separate module from `DesignModule` for the reason `CatalogDraftModule` and
 * `CatalogPublicationModule` are separate from `CatalogModule`: this is an
 * authenticated Admin surface and it needs `IdentityModule` and `AuditModule`,
 * while `DesignModule` is the anonymous public Session stack and deliberately
 * holds no staff-auth dependency. Folding these three operations in there would
 * put an Admin guard into the module that serves anonymous customers.
 *
 * `CatalogPlacementReadModule` supplies the placement **port** the scope
 * authority validates a template's `product → side → area` triple against —
 * the same controller-free read boundary `APP3-B07` and `APP3-B08` already use,
 * so Design still holds no Catalog persistence.
 *
 * The repository provider is bound here rather than imported from
 * `DesignModule`: importing that module for one port would pull the whole
 * Session stack, its cookie policy, its rate limiter and its pepper-loading
 * config factory into an Admin surface that needs none of them. Both bindings
 * name the same class behind the same token, so there is one implementation and
 * one contract — only the composition differs.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule, CatalogPlacementReadModule, AssetModule],
  controllers: [AdminDesignTemplateController],
  providers: [
    { provide: DESIGN_TEMPLATE_REPOSITORY, useClass: DrizzleDesignTemplateRepository },
    DesignTemplateScopeAuthority,
    DesignTemplateAuditRecorder,
    DesignTemplateDraftService,
    DesignTemplateQuery,
    // APP3-B03A — the draft save. The media authority reads derivatives through
    // the Asset port AssetModule exports, never its tables or its intake
    // internals; Design owns the association and Asset keeps owning the row.
    TemplateDocumentAuthority,
    TemplateDocumentMediaAuthority,
    SaveTemplateDocumentUseCase,
  ],
})
export class DesignTemplateAdminModule {}
