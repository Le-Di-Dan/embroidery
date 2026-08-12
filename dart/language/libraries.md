# Thư viện & import (Libraries & imports)

> **Nguồn gốc:** <https://dart.dev/language/libraries> — *Libraries & imports*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Metadata](https://dart.dev/language/metadata) · → [Classes (Lớp)](https://dart.dev/language/classes)

Các chỉ thị (directive) `import` và `library` giúp bạn xây dựng một codebase có tính module
và dễ chia sẻ. Thư viện không chỉ cung cấp API, mà còn là **đơn vị của tính riêng tư
(privacy)**: những định danh bắt đầu bằng dấu gạch dưới (`_`) chỉ nhìn thấy được bên trong
thư viện đó. *Mỗi file Dart (cùng với các part của nó) đều là một [thư viện][library]*, kể
cả khi nó không dùng chỉ thị [`library`](#library-directive).

Thư viện có thể được phân phối thông qua [package](https://dart.dev/tools/pub/packages).

Dart dùng dấu gạch dưới thay cho các từ khóa điều chỉnh quyền truy cập như `public`,
`protected` hay `private`. Dù các từ khóa quyền truy cập ở những ngôn ngữ khác cho khả năng
kiểm soát chi tiết hơn, cách dùng dấu gạch dưới và cơ chế riêng tư theo thư viện của Dart
lại cho một cơ chế cấu hình đơn giản, giúp hiện thực hiệu quả cơ chế
[truy cập động][dynamic access], và cải thiện tree shaking (loại bỏ code chết).

[library]: https://dart.dev/resources/glossary#library
[dynamic access]: https://dart.dev/effective-dart/design#avoid-using-dynamic-unless-you-want-to-disable-static-checking

## Sử dụng thư viện

Dùng `import` để chỉ định cách một namespace từ thư viện này được sử dụng trong phạm vi
của một thư viện khác.

Ví dụ, ứng dụng web viết bằng Dart thường dùng thư viện [`dart:js_interop`][], và có thể
import nó như sau:

```dart
import 'dart:js_interop';
```

Đối số bắt buộc duy nhất của `import` là một URI chỉ định thư viện. Với thư viện dựng sẵn,
URI dùng scheme đặc biệt `dart:`. Với các thư viện khác, bạn có thể dùng đường dẫn trên hệ
thống file hoặc scheme `package:`. Scheme `package:` chỉ định những thư viện được cung cấp
bởi một trình quản lý package như công cụ pub. Ví dụ:

```dart
import 'package:test/test.dart';
```

> **Lưu ý**
> *URI* là viết tắt của uniform resource identifier (định danh tài nguyên thống nhất).
> *URL* (uniform resource locator) là một dạng URI phổ biến.

<a id="specifying-a-library-prefix"></a>

### Chỉ định tiền tố thư viện

Nếu bạn import hai thư viện có định danh trùng nhau, bạn có thể chỉ định một tiền tố
(prefix) cho một hoặc cả hai thư viện. Ví dụ, nếu cả `library1` và `library2` đều có lớp
`Element`, bạn có thể viết code như thế này:

```dart
import 'package:lib1/lib1.dart';
import 'package:lib2/lib2.dart' as lib2;

// Uses Element from lib1.
Element element1 = Element();

// Uses Element from lib2.
lib2.Element element2 = lib2.Element();
```

> *Diễn giải:* dòng đầu dùng `Element` từ `lib1`; dòng sau dùng `Element` từ `lib2`.

Tiền tố import mang tên [wildcard][] `_` là loại không ràng buộc (non-binding), nhưng vẫn
cho phép truy cập các extension không private trong thư viện đó.

[wildcard]: https://dart.dev/language/variables#wildcard-variables

### Chỉ import một phần của thư viện

Nếu bạn chỉ muốn dùng một phần của thư viện, bạn có thể import có chọn lọc. Ví dụ:

```dart
// Import only foo.
import 'package:lib1/lib1.dart' show foo;

// Import all names EXCEPT foo.
import 'package:lib2/lib2.dart' hide foo;
```

> *Diễn giải:* dòng đầu chỉ import `foo`; dòng sau import mọi tên **NGOẠI TRỪ** `foo`.

<a id="lazily-loading-a-library"></a>

#### Nạp thư viện theo kiểu trễ (lazy)

*Deferred loading* (còn gọi là *lazy loading* — nạp trễ) cho phép một ứng dụng web nạp một
thư viện theo nhu cầu, chỉ khi nào thư viện đó thực sự cần đến. Hãy dùng deferred loading
khi bạn muốn đáp ứng một hoặc nhiều nhu cầu sau:

* Giảm thời gian khởi động ban đầu của ứng dụng web.
* Thực hiện A/B testing — chẳng hạn thử nghiệm các phương án cài đặt khác nhau của một
  thuật toán.
* Nạp những chức năng hiếm dùng, ví dụ các màn hình và hộp thoại tùy chọn.

Điều đó không có nghĩa là Dart nạp tất cả các thành phần deferred ngay lúc khởi động. Ứng
dụng web có thể tải các thành phần deferred qua mạng khi cần.

Công cụ `dart` **không** hỗ trợ deferred loading cho các nền tảng đích khác ngoài web. Nếu
bạn đang xây dựng ứng dụng Flutter, hãy tham khảo cách Flutter hiện thực deferred loading
trong hướng dẫn về [deferred components][flutter-deferred].

[flutter-deferred]: https://docs.flutter.dev/perf/deferred-components

Để nạp trễ một thư viện, trước hết hãy import nó bằng `deferred as`.

```dart
import 'package:greetings/hello.dart' deferred as hello;
```

Khi bạn cần tới thư viện đó, hãy gọi `loadLibrary()` thông qua định danh của thư viện.

```dart
Future<void> greet() async {
  await hello.loadLibrary();
  hello.printGreeting();
}
```

Trong đoạn code trên, từ khóa `await` tạm dừng việc thực thi cho tới khi thư viện được nạp
xong. Để biết thêm về `async` và `await`, xem
[lập trình bất đồng bộ](https://dart.dev/language/async).

Bạn có thể gọi `loadLibrary()` nhiều lần trên cùng một thư viện mà không gặp vấn đề gì.
Thư viện chỉ được nạp đúng một lần.

Hãy lưu ý những điểm sau khi dùng deferred loading:

* Các hằng của một thư viện deferred **không** phải là hằng trong file đang import nó. Nhớ
  rằng những hằng này chưa tồn tại cho tới khi thư viện deferred được nạp xong.
* Bạn không thể dùng các kiểu từ một thư viện deferred trong file đang import nó. Thay vào
  đó, hãy cân nhắc chuyển các kiểu interface sang một thư viện được import bởi cả thư viện
  deferred lẫn file đang import.
* Dart ngầm chèn `loadLibrary()` vào namespace mà bạn định nghĩa bằng
  <code>deferred as <em>namespace</em></code>. Hàm `loadLibrary()` trả về một
  [`Future`](https://dart.dev/libraries/dart-async#future).

<a id="library-directive"></a>

### Chỉ thị `library`

Để khai báo [doc comment][doc comments] hoặc
[annotation metadata][metadata annotations] ở cấp thư viện, hãy gắn chúng vào một khai báo
`library` ở đầu file.

```dart
/// A really great test library.
@TestOn('browser')
library;
```

> *Diễn giải:* doc comment ghi "Một thư viện test thực sự tuyệt vời."

## Hiện thực thư viện

Xem [Create Packages](https://dart.dev/tools/pub/create-packages) để có lời khuyên về cách
hiện thực một package, bao gồm:

* Cách tổ chức mã nguồn thư viện.
* Cách dùng chỉ thị `export`.
* Khi nào nên dùng chỉ thị `part`.
* Cách dùng import và export có điều kiện (conditional import/export) để hiện thực một thư
  viện hỗ trợ nhiều nền tảng.

---

[`dart:js_interop`]: https://api.dart.dev/dart-js_interop/dart-js_interop-library.html
[doc comments]: https://dart.dev/effective-dart/documentation#consider-writing-a-library-level-doc-comment
[metadata annotations]: https://dart.dev/language/metadata

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
