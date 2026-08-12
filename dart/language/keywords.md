# Từ khóa (Keywords)

> **Nguồn gốc:** <https://dart.dev/language/keywords> — *Keywords*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12

Bảng dưới đây liệt kê những từ mà ngôn ngữ Dart dành riêng cho mục đích của nó. Những từ
này **không** được dùng làm định danh, trừ khi có ghi chú khác. Ngay cả khi được phép, việc
dùng từ khóa làm định danh vẫn có thể gây bối rối cho lập trình viên khác khi đọc code của
bạn, nên hãy tránh. Để tìm hiểu thêm về cách dùng từng từ, hãy bấm vào từ đó.

| | | | |
|---|---|---|---|
| [abstract](https://dart.dev/language/class-modifiers#abstract)² | [as](https://dart.dev/language/operators#type-test-operators)² | [assert](https://dart.dev/language/error-handling#assert) | [async](https://dart.dev/language/async)³ |
| [await](https://dart.dev/language/async)¹ | [base](https://dart.dev/language/class-modifiers#base)³ | [break](https://dart.dev/language/loops#break-and-continue) | [case](https://dart.dev/language/branches#switch) |
| [catch](https://dart.dev/language/error-handling#catch) | [class](https://dart.dev/language/classes#instance-variables) | [const](https://dart.dev/language/variables#final-and-const) | [continue](https://dart.dev/language/loops#break-and-continue) |
| [covariant](https://dart.dev/language/type-system#covariant-keyword)² | [default](https://dart.dev/language/branches#switch) | [deferred](https://dart.dev/language/libraries#lazily-loading-a-library)² | [do](https://dart.dev/language/loops#while-and-do-while) |
| [dynamic](https://dart.dev/language#important-concepts)² | [else](https://dart.dev/language/branches#if) | [enum](https://dart.dev/language/enums) | [export](https://dart.dev/tools/pub/create-packages)² |
| [extends](https://dart.dev/language/extend) | [extension](https://dart.dev/language/extension-methods)² | [external](https://dart.dev/language/functions#external)² | [factory](https://dart.dev/language/constructors#factory-constructors)² |
| [false](https://dart.dev/language/built-in-types#booleans) | [final (var)](https://dart.dev/language/variables#final-and-const) | [final (class)](https://dart.dev/language/class-modifiers#final) | [finally](https://dart.dev/language/error-handling#finally) |
| [for](https://dart.dev/language/loops#for-loops) | [Function](https://dart.dev/language/functions)² | [get](https://dart.dev/language/methods#getters-and-setters)² | [hide](https://dart.dev/language/libraries#importing-only-part-of-a-library)³ |
| [if](https://dart.dev/language/branches#if) | [implements](https://dart.dev/language/classes#implicit-interfaces)² | [import](https://dart.dev/language/libraries#using-libraries)² | [in](https://dart.dev/language/loops#for-loops) |
| [interface](https://dart.dev/language/class-modifiers#interface)² | [is](https://dart.dev/language/operators#type-test-operators) | [late](https://dart.dev/language/variables#late-variables)² | [library](https://dart.dev/language/libraries)² |
| [mixin](https://dart.dev/language/mixins)² | [new](https://dart.dev/language/classes#using-constructors) | [null](https://dart.dev/language/variables#default-value) | [of](https://dart.dev/tools/pub/create-packages#organizing-a-package)³ |
| [on](https://dart.dev/language/error-handling#catch)³ | [operator](https://dart.dev/language/methods#operators)² | [part](https://dart.dev/tools/pub/create-packages#organizing-a-package)² | [required](https://dart.dev/language/functions#named-parameters)² |
| [rethrow](https://dart.dev/language/error-handling#catch) | [return](https://dart.dev/language/functions#return-values) | [sealed](https://dart.dev/language/class-modifiers#sealed)³ | [set](https://dart.dev/language/methods#getters-and-setters)² |
| [show](https://dart.dev/language/libraries#importing-only-part-of-a-library)³ | [static](https://dart.dev/language/classes#class-variables-and-methods)² | [super](https://dart.dev/language/extend) | [switch](https://dart.dev/language/branches#switch) |
| [sync](https://dart.dev/language/functions#generators)³ | [this](https://dart.dev/language/constructors) | [throw](https://dart.dev/language/error-handling#throw) | [true](https://dart.dev/language/built-in-types#booleans) |
| [try](https://dart.dev/language/error-handling#catch) | [type](https://dart.dev/language/extension-types)² | [typedef](https://dart.dev/language/typedefs)² | [var](https://dart.dev/language/variables) |
| [void](https://dart.dev/language/built-in-types) | [when](https://dart.dev/language/branches#when)³ | [with](https://dart.dev/language/mixins) | [while](https://dart.dev/language/loops#while-and-do-while) |
| [yield](https://dart.dev/language/functions#generators)¹ | | | |

**¹** Từ khóa này có thể dùng làm định danh tùy theo **ngữ cảnh**.

**²** Từ khóa này **không** được dùng làm tên của một kiểu (một class, một mixin, một enum,
một extension type, hay một type alias), tên của một extension, hoặc làm tiền tố import. Nó
có thể dùng làm định danh trong mọi trường hợp khác.

**³** Từ khóa này có thể dùng làm định danh mà không bị hạn chế gì.

> *Ghi chú của người dịch:* những từ khóa **không có** ký hiệu nào là **từ khóa dành riêng
> hoàn toàn (reserved)** — chúng tuyệt đối không được dùng làm định danh.

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
