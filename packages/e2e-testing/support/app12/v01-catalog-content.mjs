/**
 * The representative content the `APP12-V01` audit runs against.
 *
 * ## Why this is a data module and not a lorem generator
 *
 * §13 of the checkpoint is explicit in both directions. The audit must not run
 * against empty or placeholder pages, because a design that looks calm with two
 * short rows is not the design a customer meets. And it must not run against
 * adversarial strings either — a 300-character product name would produce a
 * finding about the fixture, not about the product.
 *
 * So everything here is **plausible production content for this shop**: Vietnamese
 * names of the length a real operator writes, prices in the ranges the seeded
 * SKUs already use, descriptions of two to four sentences, and a spread of
 * categories deep enough that the Discover grid, the category filter and the
 * Admin tables all carry more than one screen of rows.
 *
 * The four categories the `0033` migration provisions (`thu-bong`, `khan`,
 * `quan-ao`, `khac`) are **filled** rather than replaced — they are the real
 * production taxonomy — and two more are added through the dynamic model
 * `APP12-C01` delivered, so the audit sees a taxonomy an operator could have
 * grown rather than the migration's four.
 *
 * Nothing here is secret, and nothing here is a real person, a real address or a
 * real bank detail.
 *
 * Test-only.
 */

/** Categories provisioned by migration `0033`, filled by this fixture. */
export const PROVISIONED_CATEGORY_SLUGS = Object.freeze(['thu-bong', 'khan', 'quan-ao', 'khac']);

/**
 * Categories an operator grew after release, written through the dynamic model.
 *
 * Two, not ten: the point is that the taxonomy is not frozen at four, and a
 * navigation bar with a dozen categories would be a different design question
 * than the one Wave 1 ships.
 */
export const AUTHORED_CATEGORIES = Object.freeze([
  Object.freeze({
    slug: 'phu-kien',
    name: 'Phụ kiện',
    description: 'Túi vải, ví nhỏ và phụ kiện thêu tay dùng hằng ngày.',
    displayOrder: 40,
    isIndexable: true,
  }),
  Object.freeze({
    slug: 'qua-tang',
    name: 'Quà tặng',
    description: 'Bộ quà tặng thêu tay cho dịp sinh nhật, cưới hỏi và lễ Tết.',
    displayOrder: 50,
    isIndexable: true,
  }),
]);

/**
 * The Products the audit browses.
 *
 * `variants` is the customer-visible axis pair; every entry produces exactly one
 * order-eligible SKU per variant, because the multi-SKU ambiguity case is
 * already seeded by `s02-checkout-fixture.mjs` and duplicating it here would add
 * density without adding a question.
 *
 * `stock: 0` on every variant is how an out-of-stock Product is expressed —
 * `APP12-B01` resolves availability from the SKU projection, never from the
 * operator display flag, so this is the honest way to reach that state.
 */
export const PRODUCTS = Object.freeze([
  {
    slug: 'gau-bong-theu-ten-be',
    category: 'thu-bong',
    name: 'Gấu bông thêu tên bé',
    description:
      'Gấu bông cotton mềm, thêu tên bé bằng chỉ DMC theo yêu cầu. Đường thêu chắc, giặt máy được ở chế độ nhẹ. Cao 32cm, phù hợp làm quà đầy tháng và sinh nhật.',
    basePrice: '385000',
    variants: [
      { color: 'Kem', size: 'Nhỏ', stock: 24 },
      { color: 'Kem', size: 'Lớn', stock: 11, priceOverride: '465000' },
      { color: 'Nâu sữa', size: 'Nhỏ', stock: 6 },
    ],
  },
  {
    slug: 'tho-bong-om-ngu-theu-hoa',
    category: 'thu-bong',
    name: 'Thỏ bông ôm ngủ thêu hoa nhí',
    description:
      'Thỏ bông dáng dài ôm ngủ, thêu hoa nhí ở tai và chân. Vải nhung tăm không xù, bông gòn loại một.',
    basePrice: '429000',
    variants: [
      { color: 'Hồng phấn', size: 'M', stock: 9 },
      { color: 'Xám tro', size: 'M', stock: 0 },
    ],
  },
  {
    slug: 'khan-tam-cotton-theu-vien',
    category: 'khan',
    name: 'Khăn tắm cotton thêu viền',
    description:
      'Khăn tắm cotton 100% dệt dày 480gsm, thêu viền chỉ tương phản. Thấm nhanh, không phai màu sau nhiều lần giặt.',
    basePrice: '245000',
    variants: [
      { color: 'Trắng ngà', size: '70x140', stock: 32 },
      { color: 'Xanh biển', size: '70x140', stock: 18 },
      { color: 'Xanh biển', size: '50x100', stock: 27, priceOverride: '175000' },
    ],
  },
  {
    slug: 'khan-mat-theu-chu-cai',
    category: 'khan',
    name: 'Khăn mặt thêu chữ cái',
    description: 'Khăn mặt cotton mềm, thêu một chữ cái ở góc. Bán theo bộ hai chiếc.',
    basePrice: '129000',
    variants: [
      { color: 'Trắng', size: 'Bộ 2', stock: 44 },
      { color: 'Be', size: 'Bộ 2', stock: 21 },
    ],
  },
  {
    slug: 'khan-quang-co-linen-theu-la',
    category: 'khan',
    name: 'Khăn quàng cổ linen thêu lá',
    description: 'Khăn quàng linen mỏng, thêu hoạ tiết lá ở hai đầu khăn. Dùng được cả bốn mùa.',
    basePrice: '319000',
    variants: [{ color: 'Xám khói', size: 'Free', stock: 0 }],
  },
  {
    slug: 'ao-so-mi-linen-theu-co',
    category: 'quan-ao',
    name: 'Áo sơ mi linen thêu cổ',
    description:
      'Áo sơ mi linen pha cotton, thêu hoạ tiết nhỏ ở cổ áo. Dáng suông, ít nhăn, lên form đẹp cả khi sơ vin.',
    basePrice: '649000',
    variants: [
      { color: 'Trắng', size: 'M', stock: 14 },
      { color: 'Trắng', size: 'L', stock: 8 },
      { color: 'Xanh nhạt', size: 'M', stock: 5, priceOverride: '699000' },
      { color: 'Xanh nhạt', size: 'L', stock: 0 },
    ],
  },
  {
    slug: 'vay-lien-theu-hoa-cuc',
    category: 'quan-ao',
    name: 'Váy liền thêu hoa cúc',
    description: 'Váy liền dáng chữ A, thêu hoa cúc ở thân trước. Vải tuyết mưa mát, có lớp lót.',
    basePrice: '789000',
    variants: [
      { color: 'Vàng bơ', size: 'S', stock: 4 },
      { color: 'Vàng bơ', size: 'M', stock: 12 },
    ],
  },
  {
    slug: 'ao-khoac-tre-em-theu-thu',
    category: 'quan-ao',
    name: 'Áo khoác trẻ em thêu hình thú',
    description: 'Áo khoác nỉ cho bé 2–6 tuổi, thêu hình thú ở lưng áo.',
    basePrice: '459000',
    variants: [
      { color: 'Xanh rêu', size: '3T', stock: 17 },
      { color: 'Đỏ đô', size: '3T', stock: 9 },
    ],
  },
  {
    slug: 'tui-tote-canvas-theu-pho-co',
    category: 'phu-kien',
    name: 'Túi tote canvas thêu phố cổ',
    description:
      'Túi tote canvas dày, thêu tay hoạ tiết phố cổ Hà Nội. Quai đôi chắc chắn, đáy gấp mở rộng, đựng vừa laptop 14 inch.',
    basePrice: '295000',
    variants: [
      { color: 'Mộc', size: 'Free', stock: 38 },
      { color: 'Đen', size: 'Free', stock: 22 },
    ],
  },
  {
    slug: 'vi-nho-theu-hoa-sen',
    category: 'phu-kien',
    name: 'Ví nhỏ thêu hoa sen',
    description: 'Ví đựng thẻ và tiền lẻ, thêu hoa sen mặt trước, khoá kéo êm.',
    basePrice: '169000',
    variants: [
      { color: 'Hồng đất', size: 'Free', stock: 41 },
      { color: 'Xanh cổ vịt', size: 'Free', stock: 13 },
    ],
  },
  {
    slug: 'bang-do-toc-theu-hoa-nhi',
    category: 'phu-kien',
    name: 'Băng đô tóc thêu hoa nhí',
    description: 'Băng đô vải cotton bản to, thêu hoa nhí, có gọng mềm giữ dáng.',
    basePrice: '95000',
    variants: [{ color: 'Trắng kem', size: 'Free', stock: 56 }],
  },
  {
    slug: 'bo-qua-tang-theu-ten-cap-doi',
    category: 'qua-tang',
    name: 'Bộ quà tặng thêu tên cặp đôi',
    description:
      'Bộ gồm hai khăn mặt và một túi vải, thêu tên theo yêu cầu. Đóng hộp giấy tái chế kèm thiệp viết tay, giao trong 5–7 ngày làm việc.',
    basePrice: '520000',
    variants: [
      { color: 'Kem', size: 'Bộ', stock: 15 },
      { color: 'Xanh navy', size: 'Bộ', stock: 7, priceOverride: '560000' },
    ],
  },
  {
    slug: 'hop-qua-tet-theu-chu-phuc',
    category: 'qua-tang',
    name: 'Hộp quà Tết thêu chữ Phúc',
    description: 'Hộp quà Tết gồm khăn và túi thơm, thêu chữ Phúc chỉ vàng.',
    basePrice: '640000',
    variants: [{ color: 'Đỏ', size: 'Bộ', stock: 0 }],
  },
  {
    slug: 'tranh-theu-khung-go-nho',
    category: 'khac',
    name: 'Tranh thêu khung gỗ nhỏ',
    description:
      'Tranh thêu tay khung gỗ tròn 20cm, treo tường hoặc để bàn. Mỗi bức là một bản duy nhất.',
    basePrice: '349000',
    variants: [
      { color: 'Hoa cỏ', size: '20cm', stock: 6 },
      { color: 'Biển', size: '20cm', stock: 3 },
    ],
  },
  {
    slug: 'mieng-lot-ly-theu-tay',
    category: 'khac',
    name: 'Miếng lót ly thêu tay',
    description: 'Bộ bốn miếng lót ly vải bố, thêu hoạ tiết khác nhau.',
    basePrice: '149000',
    variants: [{ color: 'Mộc', size: 'Bộ 4', stock: 29 }],
  },
]);

/** The gallery feed the Discover and Collections surfaces render. */
export const GALLERY_ENTRIES = Object.freeze([
  {
    slug: 'ao-dai-cuoi-theu-tay-2025',
    title: 'Áo dài cưới thêu tay 2025',
    description:
      'Bộ áo dài cưới thêu tay trong 6 tuần, hoạ tiết sen và chim hạc chỉ tơ tằm. Khách hàng chọn phối màu ngà và vàng đồng.',
  },
  {
    slug: 'bo-khan-cuoi-theu-ten',
    title: 'Bộ khăn cưới thêu tên',
    description: 'Bộ khăn tặng khách mời, thêu tên cô dâu chú rể và ngày cưới.',
  },
  {
    slug: 'tui-tote-theu-pho-co-ha-noi',
    title: 'Túi tote thêu phố cổ Hà Nội',
    description: 'Loạt túi tote thêu tay theo đơn đặt của một quán cà phê phố cổ.',
  },
  {
    slug: 'goi-tua-theu-hoa-van-tho-cam',
    title: 'Gối tựa thêu hoa văn thổ cẩm',
    description: 'Gối tựa thêu lại hoa văn thổ cẩm Tây Bắc trên nền vải lanh mộc.',
  },
  {
    slug: 'dong-phuc-quan-ca-phe',
    title: 'Đồng phục quán cà phê',
    description: 'Tạp dề và áo đồng phục thêu logo cho một chuỗi quán ba cửa hàng.',
  },
  {
    slug: 'tranh-theu-chan-dung-gia-dinh',
    title: 'Tranh thêu chân dung gia đình',
    description: 'Tranh thêu chân dung bốn người, khung gỗ 40cm, hoàn thiện trong 5 tuần.',
  },
  {
    slug: 'khan-tang-khach-hang-cuoi-nam',
    title: 'Khăn tặng khách hàng cuối năm',
    description: 'Đơn hàng 200 khăn thêu logo, giao trước Tết Nguyên đán.',
  },
  {
    slug: 'bo-thu-bong-theu-ten-be',
    title: 'Bộ thú bông thêu tên bé',
    description: 'Bộ ba thú bông thêu tên, quà đầy tháng cho ba bé sinh ba.',
  },
]);
