# Tài liệu Dart — bản dịch tiếng Việt

Bản dịch tiếng Việt của tài liệu chính thức tại <https://dart.dev>, phục vụ việc tự học
Dart/Flutter.

## Nguyên tắc dịch

- Dịch **sát nghĩa** nhưng theo **ngữ nghĩa kỹ thuật**, không dịch word-by-word.
- Giữ nguyên toàn bộ **code example**, **hình ảnh minh họa** và **link** của bản gốc.
- Link trỏ tới **URL tài liệu chính hãng** (dạng tuyệt đối `https://dart.dev/...`).
- Chú thích bên trong code block **không dịch**; phần cần giải thích được đưa ra khối
  "Diễn giải" ngay bên dưới code block.
- Thuật ngữ tuân theo [GLOSSARY.md](./GLOSSARY.md).

## Cấu trúc thư mục

Tài liệu được gom theo **chủ đề**, mỗi thư mục là một nhóm bài trong tài liệu gốc:

```
dart/
├── README.md            # file này — chỉ mục + tiến độ
├── GLOSSARY.md          # bảng thuật ngữ, quy ước dịch
└── language/            # phần ngôn ngữ Dart
    ├── *.md             #   cơ bản
    ├── types/           #   kiểu dữ liệu
    ├── patterns/        #   pattern (mẫu)
    ├── control_flow/    #   điều khiển luồng
    ├── classes_objects/ #   lớp & đối tượng
    ├── class_modifiers/ #   từ khóa bổ nghĩa cho lớp
    ├── concurrency/     #   xử lý đồng thời & bất đồng bộ
    └── null_safety/     #   null safety
```

## Tiến độ

### `language/` — Cơ bản

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 1 | [/language](https://dart.dev/language) — *Introduction to Dart* | [language/index.md](./language/index.md) | ✅ 2026-08-12 |
| 2 | [/language/variables](https://dart.dev/language/variables) — *Variables* | [language/variables.md](./language/variables.md) | ✅ 2026-08-12 |
| 3 | [/language/operators](https://dart.dev/language/operators) — *Operators* | [language/operators.md](./language/operators.md) | ✅ 2026-08-12 |
| 4 | [/language/comments](https://dart.dev/language/comments) — *Comments* | [language/comments.md](./language/comments.md) | ✅ 2026-08-12 |
| 16 | [/language/functions](https://dart.dev/language/functions) — *Functions* | [language/functions.md](./language/functions.md) | ✅ 2026-08-12 |
| 17 | [/language/metadata](https://dart.dev/language/metadata) — *Metadata* | [language/metadata.md](./language/metadata.md) | ✅ 2026-08-12 |
| 18 | [/language/libraries](https://dart.dev/language/libraries) — *Libraries & imports* | [language/libraries.md](./language/libraries.md) | ✅ 2026-08-12 |
| 38 | [/language/keywords](https://dart.dev/language/keywords) — *Keywords* | [language/keywords.md](./language/keywords.md) | ✅ 2026-08-12 |
| 39 | [/language/versioning](https://dart.dev/language/versioning) — *Language versioning* | [language/versioning.md](./language/versioning.md) | ✅ 2026-08-12 |

### `language/types/` — Kiểu dữ liệu

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 5 | [/language/built-in-types](https://dart.dev/language/built-in-types) — *Built-in types* | [language/types/built-in-types.md](./language/types/built-in-types.md) | ✅ 2026-08-12 |
| 6 | [/language/records](https://dart.dev/language/records) — *Records* | [language/types/records.md](./language/types/records.md) | ✅ 2026-08-12 |
| 7 | [/language/collections](https://dart.dev/language/collections) — *Collections* | [language/types/collections.md](./language/types/collections.md) | ✅ 2026-08-12 |
| 8 | [/language/generics](https://dart.dev/language/generics) — *Generics* | [language/types/generics.md](./language/types/generics.md) | ✅ 2026-08-12 |
| 9 | [/language/typedefs](https://dart.dev/language/typedefs) — *Typedefs* | [language/types/typedefs.md](./language/types/typedefs.md) | ✅ 2026-08-12 |
| 10 | [/language/type-system](https://dart.dev/language/type-system) — *Type system* | [language/types/type-system.md](./language/types/type-system.md) | ✅ 2026-08-12 |

### `language/patterns/` — Pattern

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 11 | [/language/patterns](https://dart.dev/language/patterns) — *Patterns* | [language/patterns/patterns.md](./language/patterns/patterns.md) | ✅ 2026-08-12 |
| 12 | [/language/pattern-types](https://dart.dev/language/pattern-types) — *Pattern types* | [language/patterns/pattern-types.md](./language/patterns/pattern-types.md) | ✅ 2026-08-12 |

### `language/control_flow/` — Điều khiển luồng

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 13 | [/language/loops](https://dart.dev/language/loops) — *Loops* | [language/control_flow/loops.md](./language/control_flow/loops.md) | ✅ 2026-08-12 |
| 14 | [/language/branches](https://dart.dev/language/branches) — *Branches* | [language/control_flow/branches.md](./language/control_flow/branches.md) | ✅ 2026-08-12 |
| 15 | [/language/error-handling](https://dart.dev/language/error-handling) — *Error handling* | [language/control_flow/error-handling.md](./language/control_flow/error-handling.md) | ✅ 2026-08-12 |

### `language/classes_objects/` — Lớp & đối tượng

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 19 | [/language/classes](https://dart.dev/language/classes) — *Classes* | [classes.md](./language/classes_objects/classes.md) | ✅ 2026-08-12 |
| 20 | [/language/constructors](https://dart.dev/language/constructors) — *Constructors* | [constructors.md](./language/classes_objects/constructors.md) | ✅ 2026-08-12 |
| 21 | [/language/primary-constructors](https://dart.dev/language/primary-constructors) — *Primary constructors* | [primary-constructors.md](./language/classes_objects/primary-constructors.md) | ✅ 2026-08-12 |
| 22 | [/language/methods](https://dart.dev/language/methods) — *Methods* | [methods.md](./language/classes_objects/methods.md) | ✅ 2026-08-12 |
| 23 | [/language/extend](https://dart.dev/language/extend) — *Extend a class* | [extend.md](./language/classes_objects/extend.md) | ✅ 2026-08-12 |
| 24 | [/language/mixins](https://dart.dev/language/mixins) — *Mixins* | [mixins.md](./language/classes_objects/mixins.md) | ✅ 2026-08-12 |
| 25 | [/language/enums](https://dart.dev/language/enums) — *Enumerated types* | [enums.md](./language/classes_objects/enums.md) | ✅ 2026-08-12 |
| 26 | [/language/extension-methods](https://dart.dev/language/extension-methods) — *Extension methods* | [extension-methods.md](./language/classes_objects/extension-methods.md) | ✅ 2026-08-12 |
| 27 | [/language/dot-shorthands](https://dart.dev/language/dot-shorthands) — *Dot shorthands* | [dot-shorthands.md](./language/classes_objects/dot-shorthands.md) | ✅ 2026-08-12 |
| 28 | [/language/extension-types](https://dart.dev/language/extension-types) — *Extension types* | [extension-types.md](./language/classes_objects/extension-types.md) | ✅ 2026-08-12 |
| 29 | [/language/callable-objects](https://dart.dev/language/callable-objects) — *Callable objects* | [callable-objects.md](./language/classes_objects/callable-objects.md) | ✅ 2026-08-12 |

### `language/class_modifiers/` — Từ khóa bổ nghĩa cho lớp

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 30 | [/language/class-modifiers](https://dart.dev/language/class-modifiers) — *Class modifiers* | [class-modifiers.md](./language/class_modifiers/class-modifiers.md) | ✅ 2026-08-12 |
| 31 | [/language/class-modifiers-for-apis](https://dart.dev/language/class-modifiers-for-apis) — *Class modifiers for API maintainers* | [class-modifiers-for-apis.md](./language/class_modifiers/class-modifiers-for-apis.md) | ✅ 2026-08-12 |
| 32 | [/language/modifier-reference](https://dart.dev/language/modifier-reference) — *Class modifiers reference* | [modifier-reference.md](./language/class_modifiers/modifier-reference.md) | ✅ 2026-08-12 |

### `language/concurrency/` — Xử lý đồng thời

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 33 | [/language/concurrency](https://dart.dev/language/concurrency) — *Concurrency in Dart* | [concurrency.md](./language/concurrency/concurrency.md) | ✅ 2026-08-12 |
| 34 | [/language/async](https://dart.dev/language/async) — *Asynchronous programming* | [async.md](./language/concurrency/async.md) | ✅ 2026-08-12 |
| 35 | [/language/isolates](https://dart.dev/language/isolates) — *Isolates* | [isolates.md](./language/concurrency/isolates.md) | ✅ 2026-08-12 |

### `language/null_safety/` — Null safety

| # | Trang gốc | Bản dịch | Trạng thái |
| --- | --- | --- | --- |
| 36 | [/null-safety](https://dart.dev/null-safety) — *Sound null safety* | [null-safety.md](./language/null_safety/null-safety.md) | ✅ 2026-08-12 |
| 37 | [/null-safety/understanding-null-safety](https://dart.dev/null-safety/understanding-null-safety) — *Understanding null safety* | [understanding-null-safety.md](./language/null_safety/understanding-null-safety.md) | ✅ 2026-08-12 |

> Các trang tiếp theo sẽ được bổ sung khi có target URL mới.
