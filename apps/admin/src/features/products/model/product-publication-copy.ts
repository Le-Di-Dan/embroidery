/**
 * Vietnamese copy catalog for the Admin product publication interaction
 * (`APP2-A04`).
 *
 * Reproduced from the approved Publication nodes
 * `FIG-ADMIN-PUBLICATION-DESKTOP-{READY,BLOCKED,CONFIRM-UNPUBLISH}` (`441:106`,
 * `442:110`, `442:205`) and `FIG-ADMIN-PUBLICATION-MOBILE` (`443:121`), read
 * together with the binding A04 reconciliations.
 *
 * Three rules shape what may appear here.
 *
 * *Nothing claims a public address.* The public Product route is not delivered
 * until `APP2-B04`/`APP2-S02`, so no string here says a page is live, links to
 * `/san-pham/<slug>` or invites the operator to view the storefront. Publishing
 * makes a product *eligible* for public display; that is the strongest true
 * statement this build can make.
 *
 * *Unpublish is never described as archive or delete.* They are different
 * lifecycle transitions with different consequences, and the confirmation says
 * so explicitly rather than leaving the operator to infer it.
 *
 * *No requirement string names a storage internal.* The seven requirement codes
 * are about the product as the operator understands it — name, description,
 * category, price, images — never about assets, derivatives, checksums or
 * buckets, which the operator neither controls nor should see.
 */
import { AdminProductRequirementResponseCode } from '@embroidery/api-client';

/**
 * Operator-facing text for every requirement code in the contract.
 *
 * Keyed by the generated enum, so a code added to the contract fails the build
 * here instead of silently rendering as the unknown fallback. That is the whole
 * point of the exhaustive mapping: a new requirement must be a deliberate copy
 * decision, not a blank row.
 */
export const PRODUCT_REQUIREMENT_LABEL: Readonly<
  Record<
    (typeof AdminProductRequirementResponseCode)[keyof typeof AdminProductRequirementResponseCode],
    string
  >
> = {
  [AdminProductRequirementResponseCode.PRODUCT_NAME_READY]: 'Tên sản phẩm và đường dẫn đã sẵn sàng',
  [AdminProductRequirementResponseCode.PRODUCT_DESCRIPTION_READY]: 'Đã có mô tả sản phẩm',
  [AdminProductRequirementResponseCode.PRODUCT_CATEGORY_READY]: 'Danh mục đang được xuất bản',
  [AdminProductRequirementResponseCode.PRODUCT_PRICE_READY]: 'Đã đặt giá sản phẩm',
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_READY]: 'Thứ tự ảnh sản phẩm hợp lệ',
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_ASSETS_READY]: 'Tất cả ảnh đã được duyệt',
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_DERIVATIVES_READY]:
    'Ảnh hiển thị công khai đã sẵn sàng',
};

export const PRODUCT_PUBLICATION_COPY = {
  /** The entry point rendered on the A03 detail screen. */
  entry: {
    /** DRAFT: the operator is going somewhere to publish. */
    fromDraft: 'Xuất bản',
    /** PUBLISHED: the product is already public; this manages that. */
    fromPublished: 'Quản lý xuất bản',
  },

  screen: {
    title: 'Xuất bản sản phẩm',
    backToProduct: 'Quay lại sản phẩm',
    backToList: 'Danh sách sản phẩm',
    loading: 'Đang tải trạng thái xuất bản…',
    requirementsHeading: 'Điều kiện xuất bản',
    summaryHeading: 'Thông tin sản phẩm',
    mediaHeading: 'Ảnh sản phẩm',
    /** The read-only slug. Metadata only — never presented as a link. */
    slugLabel: 'Đường dẫn',
    slugNote: 'Đường dẫn do hệ thống quản lý và không thể chỉnh sửa.',
    categoryLabel: 'Danh mục',
    descriptionLabel: 'Mô tả',
    priceLabel: 'Giá',
    statusLabel: 'Trạng thái',
    /** Marks the first ordered image, matching the A03 media identity. */
    primaryMedia: 'Ảnh đại diện',
    noMedia: 'Chưa có ảnh nào được chọn.',
    noDescription: 'Chưa có mô tả.',
    noPrice: 'Chưa đặt giá.',
  },

  requirements: {
    satisfied: 'Đã đủ điều kiện',
    unsatisfied: 'Chưa đủ điều kiện',
    /**
     * A requirement code this build does not recognise. It renders visibly and
     * is treated as unmet — a newer server that adds a requirement must never
     * have it silently counted as satisfied by an older screen.
     */
    unknown: 'Điều kiện chưa được hỗ trợ trong phiên bản này',
  },

  ready: {
    title: 'Sẵn sàng xuất bản',
    body: 'Sản phẩm đã đáp ứng mọi điều kiện và có thể được xuất bản.',
    /**
     * Deliberately does not promise a live URL: `APP2-B04`/`APP2-S02` own the
     * public route, and this build cannot truthfully say a page exists.
     */
    consequence:
      'Sau khi xuất bản, sản phẩm sẽ đủ điều kiện hiển thị công khai và không thể chỉnh sửa cho tới khi được gỡ xuất bản.',
    publish: 'Xuất bản',
    publishing: 'Đang xuất bản…',
    edit: 'Chỉnh sửa',
  },

  blocked: {
    title: 'Còn thiếu điều kiện',
    body: 'Sản phẩm chưa đáp ứng đủ điều kiện xuất bản. Hãy hoàn thiện bản nháp rồi quay lại.',
    edit: 'Hoàn thiện bản nháp',
  },

  published: {
    title: 'Sản phẩm đang được xuất bản',
    body: 'Sản phẩm đủ điều kiện hiển thị công khai.',
    unpublish: 'Gỡ xuất bản',
    unpublishing: 'Đang gỡ xuất bản…',
    /** A published product is not editable in `APP2-A03`; the label says so. */
    view: 'Xem chi tiết',
  },

  archived: {
    title: 'Sản phẩm đã được lưu trữ',
    body: 'Sản phẩm đã lưu trữ không thể xuất bản hoặc gỡ xuất bản tại màn hình này.',
  },

  unpublishDialog: {
    title: 'Gỡ xuất bản sản phẩm?',
    body: 'Sản phẩm sẽ không còn đủ điều kiện hiển thị công khai. Dữ liệu sản phẩm và ảnh đã chọn vẫn được giữ nguyên.',
    /**
     * Present because the two are genuinely different transitions and the
     * operator cannot be expected to know that from the verb alone.
     */
    reassurance: 'Đây không phải thao tác xoá hoặc lưu trữ.',
    confirm: 'Gỡ xuất bản',
    cancel: 'Giữ nguyên',
  },

  success: {
    publishedTitle: 'Sản phẩm đã được xuất bản',
    publishedBody: 'Sản phẩm hiện đủ điều kiện hiển thị công khai.',
    unpublishedTitle: 'Đã gỡ xuất bản sản phẩm',
    unpublishedBody: 'Sản phẩm đã trở lại trạng thái bản nháp và có thể chỉnh sửa.',
  },

  failure: {
    /** Readiness failed but the product loaded; the summary stays visible. */
    readinessTitle: 'Chưa thể kiểm tra điều kiện xuất bản',
    readinessBody: 'Không tải được điều kiện xuất bản. Hãy thử lại.',
    retry: 'Thử lại',
    notFoundTitle: 'Không tìm thấy sản phẩm',
    notFoundBody: 'Sản phẩm này không tồn tại hoặc đã bị xoá khỏi danh sách.',
    unavailableTitle: 'Chưa tải được sản phẩm',
    unavailableBody: 'Không tải được thông tin sản phẩm. Hãy thử lại.',
    /**
     * The two snapshots disagree about status or token. Mutations are disabled
     * until they agree again — acting on a mixed snapshot is how a command gets
     * sent with a token that belongs to a state the operator never saw.
     */
    mismatchTitle: 'Thông tin đang được cập nhật',
    mismatchBody: 'Trạng thái sản phẩm vừa thay đổi. Hãy tải lại để tiếp tục.',
    mismatchRetry: 'Tải lại',
  },

  /**
   * Command outcomes, keyed by the classification in
   * `product-publication-failure`. Every one of these is safe to render: none
   * echoes a server message, a domain code, a request id or a token.
   */
  commandFailure: {
    'not-ready': {
      title: 'Chưa đủ điều kiện xuất bản',
      body: 'Một số điều kiện không còn được đáp ứng. Danh sách bên dưới đã được cập nhật.',
    },
    'publish-not-allowed': {
      title: 'Chưa thể xuất bản',
      body: 'Trạng thái sản phẩm vừa thay đổi nên không thể xuất bản. Hãy kiểm tra lại trạng thái hiện tại.',
    },
    'unpublish-not-allowed': {
      title: 'Chưa thể gỡ xuất bản',
      body: 'Trạng thái sản phẩm vừa thay đổi nên không thể gỡ xuất bản. Hãy kiểm tra lại trạng thái hiện tại.',
    },
    generic: {
      title: 'Thao tác chưa hoàn tất',
      body: 'Chưa thực hiện được thao tác này. Hãy thử lại.',
    },
  },
} as const;
