import { type OpenAPIObject } from '@nestjs/swagger';

/**
 * Canonical operation-ID policy (APP0-B01).
 *
 * Operation IDs are a public contract the generated client depends on, so they
 * must be deterministic, unique, and independent of route-registration order.
 * The policy is `<domainKey>_<methodKey>`, derived from the controller class
 * name (minus the `Controller` suffix) and the handler method name — both
 * stable source identifiers, never a hash, timestamp, or environment value.
 */
export const OPERATION_ID_PATTERN = /^[a-z][a-zA-Z0-9]*_[a-zA-Z][a-zA-Z0-9]*$/;

const CONTROLLER_SUFFIX = /Controller$/;

/**
 * Controller classes that serve one published domain between them.
 *
 * The default policy derives the domain key from the class name, which is right
 * until a controller has to be split for a reason that is not a contract
 * change. `APP3-B04A` split the Admin Design Template surface into an authoring
 * controller and a lifecycle controller to bring both under the CLAUDE.md §6
 * file-size limit — and that rename silently reissued eight *accepted*
 * operation ids (`adminDesignTemplate_list` became
 * `adminDesignTemplateAuthoring_list`, and so on), which is a breaking change to
 * every generated client for a refactor that changed no behaviour.
 *
 * So the domain key becomes explicit where it cannot be inferred. This table is
 * deliberately small, exhaustive and reviewable: an entry states "these classes
 * are one domain", which is a contract fact, rather than letting a file-layout
 * decision decide a public identifier. Splitting a controller is now safe; the
 * only way to rename an operation is to say so here.
 */
export const CONTROLLER_DOMAIN_KEYS: Readonly<Record<string, string>> = {
  AdminDesignTemplateAuthoringController: 'adminDesignTemplate',
  AdminDesignTemplateLifecycleController: 'adminDesignTemplate',
  // `APP3-B06C`, extended by `APP3-S06`. The Session asset domain is served by
  // three classes because upload, binary delivery and the JSON status projection
  // are a mutation, a byte stream and a small read — different guards, different
  // response concerns, and one file carrying all three would cross the CLAUDE.md
  // §6 review threshold twice over. They remain one published domain:
  // `publicDesignSessionAsset_create`, `_get` and `_status`. Without these
  // entries the split classes would mint `publicDesignSessionAssetPreview_get`
  // and `publicDesignSessionAssetStatus_status`, letting a file-layout decision
  // name a public identifier.
  PublicDesignSessionAssetController: 'publicDesignSessionAsset',
  PublicDesignSessionAssetPreviewController: 'publicDesignSessionAsset',
  PublicDesignSessionAssetStatusController: 'publicDesignSessionAsset',
  // `APP5-B03`. Submitting a custom request and reading one are the same
  // published domain; they are two classes because the write needs Design and
  // the grant issuer while the read needs the secure-link admission and the
  // catalog subject port, and one module carrying both would boot every
  // dependency for either. Without this entry the read would mint
  // `publicCustomRequestStatus_status`, letting the module split name a public
  // identifier. `PublicCustomRequestAssetController` is deliberately **not**
  // here: the pre-submission attachment lane is its own domain, not a split of
  // this one.
  PublicCustomRequestController: 'publicCustomRequest',
  PublicCustomRequestStatusController: 'publicCustomRequest',
  // `APP5-B05`. Reading the Admin request surface and moderating it are the same
  // published domain; they are two classes because the read model's module
  // deliberately holds no write repository, so a read route cannot reach
  // `transition()`. Without this entry the mutations would mint
  // `adminCustomRequestModeration_appendNote`, letting that module boundary name
  // a public identifier — and `APP5-B04`'s two accepted ids stay untouched
  // either way, because the read class keeps deriving its own.
  AdminCustomRequestController: 'adminCustomRequest',
  AdminCustomRequestModerationController: 'adminCustomRequest',
  // `APP6-B02`. Drafting a quotation and reading its version history are the
  // same published domain; they are two classes because the read module holds
  // no pricing, no policy reader and no transaction manager, so a read route
  // cannot reach `addVersion()`. Without this entry the reads would mint
  // `adminQuotationVersion_versionHistory`, letting that module boundary name a
  // public identifier — and `APP6-B01`'s two accepted ids stay untouched either
  // way, because the drafting class keeps deriving its own.
  // `APP6-B03`. The send joins the same published domain as the drafting and
  // read classes. It is its own class because its module is the only APP6
  // surface holding the order repository, the outbox and the audit repository —
  // a boundary that keeps a read or a draft route from reaching the request
  // transition. Without this entry the send would mint
  // `adminQuotationSend_sendVersion`, letting that boundary name a public
  // identifier; with it, `APP6-B01`'s and `APP6-B02`'s four accepted ids stay
  // untouched.
  AdminQuotationSendController: 'adminQuotation',
  AdminQuotationController: 'adminQuotation',
  AdminQuotationVersionController: 'adminQuotation',
  // `APP6-B05`. Accepting and rejecting a quotation join the same published
  // `publicQuotation` domain as `APP6-B04`'s read. They are a second class
  // because the read module is *defined* by holding no transaction manager and
  // no write repository, and these two writes need both — the same split, and
  // the same reason, as `AdminCustomRequestController` /
  // `AdminCustomRequestModerationController`. Without this entry the decisions
  // would mint `publicQuotationDecision_accept`, letting a module boundary name
  // two public identifiers; with it, `publicQuotation_current` is untouched and
  // the family reads `_current`, `_accept`, `_reject`.
  PublicQuotationDecisionController: 'publicQuotation',
};

/** HTTP method keys a Path Item Object may carry; other keys are not operations. */
const HTTP_METHOD_KEYS: ReadonlySet<string> = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Deterministic operation-ID factory passed to `SwaggerModule.createDocument`.
 * `HealthController#check` becomes `health_check`.
 */
export function createOperationId(controllerKey: string, methodKey: string): string {
  const domain = controllerKey.replace(CONTROLLER_SUFFIX, '');
  if (domain === '' || methodKey === '') {
    throw new Error(
      `Cannot derive an operation id from controller "${controllerKey}" and method "${methodKey}".`,
    );
  }
  const declared = CONTROLLER_DOMAIN_KEYS[controllerKey];
  const domainKey = declared ?? domain.charAt(0).toLowerCase() + domain.slice(1);
  return `${domainKey}_${methodKey}`;
}

/**
 * Fails when any documented operation has a missing, malformed, or duplicated
 * operation ID. The message names the offending operation(s) so the failure is
 * actionable rather than a bare boolean.
 */
export function validateOperationIds(document: OpenAPIObject): void {
  const locationsById = new Map<string, string>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHOD_KEYS.has(method)) {
        continue;
      }
      const location = `${method.toUpperCase()} ${path}`;
      const operationId = (operation as { operationId?: unknown }).operationId;

      if (typeof operationId !== 'string' || operationId === '') {
        throw new Error(`Operation ${location} is missing an operationId.`);
      }
      if (!OPERATION_ID_PATTERN.test(operationId)) {
        throw new Error(
          `Operation ${location} has an invalid operationId "${operationId}"; ` +
            `expected the <domain>_<method> pattern ${OPERATION_ID_PATTERN.source}.`,
        );
      }
      const existing = locationsById.get(operationId);
      if (existing !== undefined) {
        throw new Error(`Duplicate operationId "${operationId}" on ${existing} and ${location}.`);
      }
      locationsById.set(operationId, location);
    }
  }
}
