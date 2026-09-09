/**
 * The seven Ready-Made Products of the `APP12-G03` UAT catalog.
 *
 * Split out of `seed-app12-g03-dataset.mjs` by responsibility rather than by
 * line count: a Product carries its own description, price, imagery anchor,
 * variants, SKUs, price overrides and stock, so seven of them are an order of
 * magnitude more text than the four categories beside which they were declared.
 * Read the dataset module's header first — it holds the provenance convention
 * and the coverage table that explains *why* these seven are shaped this way.
 *
 * Data only. No logic, no decision, nothing to execute.
 */

/**
 * Seven Products across all four categories.
 *
 * `hue` anchors the generated imagery so one Product's gallery reads as one
 * Product (see `seed-app12-g03-imagery.mjs`); it is a property of the picture,
 * not of the catalog, and nothing in the application ever sees it.
 *
 * `variants` carry `colorName`/`sizeLabel` exactly as `product_variants` models
 * them, and each owns its SKU. A variant with no SKU is a state `APP12-S01`
 * already covers in a disposable fixture and it has no place in a UAT baseline —
 * every variant here is buyable or deliberately sold out.
 */
export const G03_PRODUCTS = Object.freeze([
  Object.freeze({
    key: 'tui-hoa-cuc',
    slug: 'uat-tui-vai-theu-hoa-cuc',
    creationName: 'UAT Túi vải thêu hoa cúc',
    name: 'Túi vải thêu hoa cúc',
    description:
      'Túi vải canvas dày dặn, thêu tay hoạ tiết hoa cúc ở mặt trước. Quai đeo vai bản rộng, ' +
      'lót trong một ngăn kéo khoá. Phù hợp đi học, đi làm và đi chợ cuối tuần.',
    categoryKey: 'tui-vai',
    basePriceAmount: '320000',
    hue: 28,
    mediaCount: 20,
    variants: Object.freeze([
      Object.freeze({
        key: 'kem',
        colorName: 'Kem',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-TUI-HOACUC-KEM',
          priceOverrideAmount: undefined,
          quantityOnHand: 24,
          lowStockThreshold: 5,
        }),
      }),
      Object.freeze({
        key: 'xanh-reu',
        colorName: 'Xanh rêu',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-TUI-HOACUC-XANH',
          priceOverrideAmount: '385000',
          quantityOnHand: 3,
          lowStockThreshold: 5,
        }),
      }),
      Object.freeze({
        key: 'nau-dat',
        colorName: 'Nâu đất',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-TUI-HOACUC-NAU',
          priceOverrideAmount: undefined,
          quantityOnHand: 0,
          lowStockThreshold: 5,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'tui-tote',
    slug: 'uat-tui-tote-theu-chi-vang',
    creationName: 'UAT Túi tote thêu chỉ vàng',
    name: 'Túi tote thêu chỉ vàng',
    description:
      'Túi tote vải bố mộc, thêu chỉ vàng đồng hoạ tiết bông lúa. Đường thêu nổi, giữ form tốt ' +
      'sau nhiều lần giặt tay.',
    categoryKey: 'tui-vai',
    basePriceAmount: '280000',
    hue: 45,
    mediaCount: 8,
    variants: Object.freeze([
      Object.freeze({
        key: 'moc',
        colorName: 'Mộc',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-TOTE-MOC',
          priceOverrideAmount: undefined,
          quantityOnHand: 40,
          lowStockThreshold: undefined,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'goi-sen',
    slug: 'uat-goi-tua-theu-hoa-sen',
    creationName: 'UAT Gối tựa thêu hoa sen',
    name: 'Gối tựa thêu hoa sen',
    description:
      'Gối tựa lưng bọc vải lanh, thêu tay hoa sen giữa mặt gối. Vỏ gối tháo rời, ruột gối bông ' +
      'gòn ép. Kích thước 45×45 cm.',
    categoryKey: 'goi-tua',
    basePriceAmount: '450000',
    hue: 330,
    mediaCount: 1,
    variants: Object.freeze([
      Object.freeze({
        key: 'be',
        colorName: 'Be',
        sizeLabel: '45×45',
        sku: Object.freeze({
          code: 'UAT-G03-GOI-SEN-45',
          priceOverrideAmount: undefined,
          quantityOnHand: 12,
          lowStockThreshold: undefined,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'goi-hac',
    slug: 'uat-goi-tua-theu-chim-hac',
    creationName: 'UAT Gối tựa thêu chim hạc',
    name: 'Gối tựa thêu chim hạc',
    description:
      'Gối tựa thêu hoạ tiết chim hạc theo lối thêu truyền thống, viền bọc chỉ cùng tông. ' +
      'Có hai cỡ; cỡ lớn thêu dày hơn nên có giá riêng.',
    categoryKey: 'goi-tua',
    basePriceAmount: '520000',
    hue: 200,
    mediaCount: 5,
    variants: Object.freeze([
      Object.freeze({
        key: 'cd-45',
        colorName: 'Xanh cổ vịt',
        sizeLabel: '45×45',
        sku: Object.freeze({
          code: 'UAT-G03-GOI-HAC-45',
          priceOverrideAmount: undefined,
          quantityOnHand: 18,
          lowStockThreshold: undefined,
        }),
      }),
      Object.freeze({
        key: 'cd-50',
        colorName: 'Xanh cổ vịt',
        sizeLabel: '50×50',
        sku: Object.freeze({
          code: 'UAT-G03-GOI-HAC-50',
          priceOverrideAmount: '610000',
          quantityOnHand: 2,
          lowStockThreshold: 5,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'non-luoi-trai',
    slug: 'uat-non-luoi-trai-theu-logo',
    creationName: 'UAT Nón lưỡi trai thêu logo',
    name: 'Nón lưỡi trai thêu logo',
    description:
      'Nón lưỡi trai vải kaki, thêu logo nhỏ phía trước. Khoá sau điều chỉnh được. Hai màu, ' +
      'hai cỡ vòng đầu.',
    categoryKey: 'non-mu',
    basePriceAmount: '210000',
    hue: 150,
    mediaCount: 6,
    variants: Object.freeze([
      Object.freeze({
        key: 'den-s',
        colorName: 'Đen',
        sizeLabel: 'S',
        sku: Object.freeze({
          code: 'UAT-G03-NON-DEN-S',
          priceOverrideAmount: undefined,
          quantityOnHand: 30,
          lowStockThreshold: undefined,
        }),
      }),
      Object.freeze({
        key: 'den-l',
        colorName: 'Đen',
        sizeLabel: 'L',
        sku: Object.freeze({
          code: 'UAT-G03-NON-DEN-L',
          priceOverrideAmount: '245000',
          quantityOnHand: 6,
          lowStockThreshold: undefined,
        }),
      }),
      Object.freeze({
        key: 'be-s',
        colorName: 'Be',
        sizeLabel: 'S',
        sku: Object.freeze({
          code: 'UAT-G03-NON-BE-S',
          priceOverrideAmount: undefined,
          quantityOnHand: 0,
          lowStockThreshold: undefined,
        }),
      }),
      Object.freeze({
        key: 'be-l',
        colorName: 'Be',
        sizeLabel: 'L',
        sku: Object.freeze({
          code: 'UAT-G03-NON-BE-L',
          priceOverrideAmount: undefined,
          quantityOnHand: 1,
          lowStockThreshold: 3,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'mu-noi',
    slug: 'uat-mu-noi-theu-hoa-nhi',
    creationName: 'UAT Mũ nồi thêu hoa nhí',
    name: 'Mũ nồi thêu hoa nhí',
    description:
      'Mũ nồi dạ mềm, thêu chùm hoa nhí lệch một bên. Hàng thủ công số lượng ít; đợt này đã ' +
      'bán hết, dự kiến có lại trong hai tuần.',
    categoryKey: 'non-mu',
    basePriceAmount: '265000',
    hue: 265,
    mediaCount: 3,
    variants: Object.freeze([
      Object.freeze({
        key: 'do-muot',
        colorName: 'Đỏ mượt',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-MU-NOI-DO',
          priceOverrideAmount: undefined,
          quantityOnHand: 0,
          lowStockThreshold: undefined,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'khan-choang',
    slug: 'uat-khan-choang-theu-vien',
    creationName: 'UAT Khăn choàng thêu viền',
    name: 'Khăn choàng thêu viền',
    description:
      'Khăn choàng cotton pha lanh, thêu viền chạy quanh mép khăn. Mềm, rũ, dùng được cả bốn ' +
      'mùa. Màu đỏ đô thêu chỉ kim tuyến nên có giá riêng.',
    categoryKey: 'phu-kien',
    basePriceAmount: '390000',
    hue: 95,
    mediaCount: 4,
    variants: Object.freeze([
      Object.freeze({
        key: 'xam-tro',
        colorName: 'Xám tro',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-KHAN-XAM',
          priceOverrideAmount: undefined,
          quantityOnHand: 15,
          lowStockThreshold: undefined,
        }),
      }),
      Object.freeze({
        key: 'do-do',
        colorName: 'Đỏ đô',
        sizeLabel: undefined,
        sku: Object.freeze({
          code: 'UAT-G03-KHAN-DO',
          priceOverrideAmount: '445000',
          quantityOnHand: 0,
          lowStockThreshold: undefined,
        }),
      }),
    ]),
  }),
]);
