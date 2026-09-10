/**
 * Assets, products and their publication (`APP2`) — the Admin authoring side and
 * the anonymous public reads that serve the Storefront from the same catalog.
 *
 * The Admin intake, draft authoring and publication operations sit beside the
 * public listing and detail resolver on purpose: they are two views of one
 * catalog, and an operator publishing a product needs to see exactly which read
 * a customer will then get.
 *
 * `adminProductArchive` is still deliberately withheld — the block below says
 * why, where it would otherwise sit.
 */

// Admin asset intake operations (APP2-B01). Exposed on the public boundary so
// the Admin Assets capability never deep-imports the generated tree. The
// generated `assetKind`/`classification` enums are re-exported as values so a
// caller supplies the fixed multipart metadata from the contract instead of
// hard-coding a literal.
export { adminAssetUpload, adminAssetDetail, adminAssetList } from './generated/embroidery-api';
export {
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
} from './generated/embroidery-api.schemas';
// The lane selector `APP11-B03A` added to both scoped reads. Exported as a
// **value**, and by `APP11-A02`, because the gallery editor opens two pickers
// against one operation — the prepared `GALLERY` images it may attach, and the
// `CATALOG` sources it may prepare from — and each must name its lane
// explicitly. Omitting the parameter still means `CATALOG`, which is why the
// default is never relied on: a picker that quietly showed production-sensitive
// product media where public gallery media was meant would look, on screen,
// exactly like one that worked.
// The response enums cross beside them, also as values. The upload enums that
// already crossed are single-member by design — intake can only ever mint
// `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` — so they cannot name the
// `GALLERY_MEDIA` / `PUBLIC` lane a read can now return. A consumer deciding
// which lane an asset is in must compare against the vocabulary the *read*
// publishes, not against a hard-coded literal that no gate would catch drifting.
export {
  AdminAssetListScope,
  AdminAssetDetailScope,
  AdminAssetDetailResponseKind,
  AdminAssetDetailResponseClassification,
} from './generated/embroidery-api.schemas';
export type {
  AdminAssetDetailResponse,
  AdminAssetDetailParams,
  AdminAssetListResponse,
  AdminAssetListParams,
  AdminAssetUploadBody,
  AdminAssetUploadReceiptResponse,
} from './generated/embroidery-api.schemas';

// Admin product read + draft-authoring operations (APP2-B02). `adminProductList`
// serves the read-only list (`APP2-A02`); create, detail and update serve the
// product form/detail capability (`APP2-A03`).
//
// Still deliberately withheld: `adminProductArchive`, which has no approved
// surface (`FU-APP2-PRODUCT-ARCHIVE-UI-01`). Archive is not unpublish — it is a
// separate lifecycle transition with its own reason requirement — so keeping it
// off this boundary is what stops a publication screen from reaching it by
// mistake while `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` is still open.
//
// The status and media-role enums are re-exported as values so filter options and
// role rendering are derived from the contract rather than hard-coded.
//
// `AdminProductListCategorySlug` is deliberately **gone** as of `APP12-C01`: the
// category taxonomy is dynamic, so the contract no longer publishes a closed
// category enum for this boundary to carry. `APP12-A01` gives the Admin its
// category options from the runtime category surface instead.
export {
  adminProductList,
  adminProductCreate,
  adminProductDetail,
  adminProductUpdate,
} from './generated/embroidery-api';

// The one bounded write a PUBLISHED product accepts (`APP12-M01.B2`).
//
// It crosses the boundary separately from the four above because it is not one
// of them: `adminProductUpdate` is DRAFT-only and edits any generic field,
// while this replaces the whole ordered image selection of a DRAFT **or** a
// PUBLISHED product and can change nothing else. Keeping the two names apart on
// this boundary is what stops a screen from reaching for the generic patch to
// curate a published gallery — the route `PRODUCT_EDITABLE_STATES` still
// refuses, and would refuse as `PRODUCT_NOT_EDITABLE` rather than as anything
// an operator could act on.
//
// `ReplaceProductMediaBody` travels with it: the body *is* the write model —
// `mediaAssetIds[0]` is the primary, array order is display order, an omitted
// id is removed — so a consumer that could call the operation without being
// able to name its body would have to build one untyped.
export { adminProductMediaReplace } from './generated/embroidery-api';
export type { ReplaceProductMediaBody } from './generated/embroidery-api.schemas';
export {
  AdminProductListStatus,
  AdminProductDetailResponseStatus,
  AdminProductMediaResponseRole,
} from './generated/embroidery-api.schemas';
export type {
  AdminProductListParams,
  AdminProductListResponse,
  AdminProductSummaryResponse,
  AdminProductCategoryResponse,
  AdminProductDetailResponse,
  AdminProductMediaResponse,
  CreateProductBody,
  UpdateProductBody,
} from './generated/embroidery-api.schemas';

// Admin product publication operations (APP2-B03), exposed for the Admin
// publication interaction (`APP2-A04`). All three cross the boundary together:
// the readiness report is only meaningful next to the command it describes, and
// publish and unpublish are the two directions of one transition.
//
// `AdminProductRequirementResponseCode` is re-exported as a value on purpose.
// The screen renders the complete requirement set in the server's order, so the
// codes have to come from the contract — deriving them from a hand-kept list
// would let the two drift, and the drift would show up as a silently missing
// requirement row rather than as a build failure.
export {
  adminProductPublicationReadiness,
  adminProductPublish,
  adminProductUnpublish,
} from './generated/embroidery-api';
export {
  AdminProductRequirementResponseCode,
  AdminProductPublicationReadinessResponseStatus,
  AdminProductPublicationResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  AdminProductPublicationReadinessResponse,
  AdminProductPublicationResponse,
  AdminProductRequirementResponse,
  PublishProductBody,
  UnpublishProductBody,
} from './generated/embroidery-api.schemas';

// Anonymous public catalog reads (APP2-B04): the listing for the Storefront
// Discover feed (`APP2-S01`) and the detail resolver for Product Detail
// (`APP2-S02`).
//
// `publicProductDetail` crossed this boundary in `APP2-S02`, once IMP-D039
// locked `/san-pham/[slug]`. It was withheld until then precisely because a
// route did not exist, and the two facts belong together: an operation on the
// public boundary is an invitation to render a page for it.
//
// `publicProductMediaGet` stays withheld, for a different reason that has not
// changed: it serves image bytes, which the browser fetches by rendering the
// relative `media[].url` the list and detail responses already return —
// application code must never stream those bytes itself.
//
// `PublicProductListCategorySlug` is deliberately **gone** as of `APP12-C01`: the
// taxonomy is dynamic, the filter parameter is now a pattern-validated string,
// and a consumer that needs the current set reads `publicCategoryList` below.
export { publicProductList, publicProductDetail } from './generated/embroidery-api';
export type {
  PublicProductListParams,
  PublicProductListResponse,
  PublicProductSummaryResponse,
  PublicProductDetailResponse,
  PublicProductSeoResponse,
  PublicCategoryResponse,
  PublicMediaReferenceResponse,
  // The public money shape (`APP12-S01`). Released as a **type only**: it is the
  // one wire form every public price already takes — a decimal string plus the
  // currency of the row that supplied it — and the Ready-Made purchase panel
  // renders both a Product's catalog price and a SKU's resolved unit price
  // through it. Naming the shape once is what keeps a screen from re-declaring
  // an amount as a `number`, which is the shortest path from `numeric(14,2)` to
  // an IEEE-754 double.
  PublicPriceResponse,
} from './generated/embroidery-api.schemas';

// The dynamic public category inventory (`APP12-C01`).
//
// This is the operation that replaces the closed four-value category enum the
// two product boundaries above used to carry. The set of categories is operator
// data, so a consumer asks for it at runtime; there is nothing here to
// re-export as a value, because there is no longer a compile-time taxonomy.
//
// Read-only, and read-only permanently: category creation, editing,
// publication and archival are Admin operations, exported separately below
// (`APP12-C02`). No public route mutates a category, and the API graph that
// serves this read wires no write repository at all.
export { publicCategoryList } from './generated/embroidery-api';
export type {
  PublicCategoryListResponse,
  PublicCategoryInventoryItemResponse,
} from './generated/embroidery-api.schemas';

// The Admin category management operations (`APP12-C02`).
//
// The taxonomy became operator-managed data here: create a draft, edit it,
// publish it, archive it — no source edit, no migration, no deployment. The
// four operations cross this boundary together because they are one workflow,
// and `APP12-A01`'s category screen consumes all four.
//
// `adminCategoryList` is the canonical **Admin** category inventory. It is not a
// duplicate of `publicCategoryList`: that one answers "which categories may a
// customer browse" and returns only published rows, while this one carries
// drafts and archived rows, the stable Admin key every mutation is addressed
// by, the concurrency token, and each category's published-product count. The
// Admin Product form and filter still read the public list (`APP12-C01-C1`);
// `APP12-A01` moves them onto this one, which is the point at which a draft or
// an archived category first has anywhere to appear.
//
// Two enums cross as **values**, and both are rules rather than category values
// (`IMP-D062`): the lifecycle vocabulary a screen renders status chips from, and
// the transition vocabulary its publish/archive controls send. There is still no
// compiled taxonomy anywhere on this boundary — which categories exist is
// answered only by a response.
//
// There is deliberately no delete: `ARCHIVED` is the terminal state of the
// APP12 surface, and no operation to remove a category exists to export.
export {
  adminCategoryList,
  adminCategoryCreate,
  adminCategoryUpdate,
  adminCategoryTransition,
} from './generated/embroidery-api';
export {
  AdminCategoryResponseStatus,
  TransitionCategoryBodyAction,
} from './generated/embroidery-api.schemas';
export type {
  AdminCategoryResponse,
  AdminCategoryListResponse,
  AdminCategoryListItemResponse,
  CreateCategoryBody,
  UpdateCategoryBody,
  TransitionCategoryBody,
} from './generated/embroidery-api.schemas';

// The Admin Ready-Made sellability authoring surface: the variant operations
// delivered by `APP12-N02.B01`, and the two SKU definition operations that were
// delivered by `APP7-B01` and have had no Admin caller until now (`APP12-N02.A01`).
//
// The five cross together because they are one capability. A variant with no way
// to define a SKU under it is not authorable, and a SKU operation with no variant
// list to place it in has nowhere to be called from — `APP12-N02.G01` proved that
// exact shape: `adminSku_create` had been on the contract for five phases with
// zero call sites, because the variant it needs did not have a writer.
//
// `adminProductVariantList` is the **authoring** read and the only one usable
// here. `publicProductVariant_list` is not a substitute and is deliberately not
// exported for this purpose: it is keyed by slug, refuses anything but a
// published product, and filters out exactly the inactive variants and SKUs the
// authoring section exists to show as history.
//
// No enum crosses as a value. `AdminVariantSkuResponseCurrencyCode` has one
// member the server owns (VND) and no screen branches on it; importing the
// vocabulary would create a second place for a server-owned fact to drift.
//
// There is no delete on this boundary because the contract publishes none.
// Deactivation is how a variant or a SKU leaves the catalog, which is why both
// update bodies carry `isActive` and neither operation has a destructive twin.
export {
  adminProductVariantList,
  adminProductVariantCreate,
  adminProductVariantUpdate,
  adminSkuCreate,
  adminSkuUpdate,
} from './generated/embroidery-api';
export type {
  AdminProductVariantListResponse,
  AdminProductVariantResponse,
  AdminVariantSkuResponse,
  AdminSkuResponse,
  CreateProductVariantBody,
  UpdateProductVariantBody,
  CreateSkuBody,
  UpdateSkuBody,
} from './generated/embroidery-api.schemas';
