# Metadata

> **Nguồn gốc:** <https://dart.dev/language/metadata> — *Metadata*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Functions (Hàm)](https://dart.dev/language/functions) · → [Libraries & imports (Thư viện & import)](https://dart.dev/language/libraries)

Dùng metadata để cung cấp thêm thông tin tĩnh về code của bạn. Một **annotation** metadata
bắt đầu bằng ký tự `@`, theo sau là một tham chiếu tới hằng lúc biên dịch (chẳng hạn
`deprecated`) hoặc một lời gọi tới constructor hằng.

Metadata có thể được gắn vào hầu hết các cấu trúc trong chương trình Dart, bằng cách thêm
annotation trước phần khai báo hoặc chỉ thị (directive) của cấu trúc đó.

<a id="built-in-annotations"></a>

## Annotation dựng sẵn

Những annotation sau có sẵn cho mọi code Dart:

[`@Deprecated`][]
: Đánh dấu một khai báo là **không còn khuyến khích dùng (deprecated)**, cho biết nên
  chuyển sang thứ khác, kèm một thông điệp giải thích phương án thay thế và thời điểm có
  thể bị gỡ bỏ.

  Ngoài annotation `@Deprecated` chung, bạn còn có thể dùng những annotation chuyên biệt
  để deprecate một số **cách sử dụng** nhất định của một khai báo:

  * [`@Deprecated.extend()`][]: Việc kế thừa (extend) lớp này là deprecated.
  * [`@Deprecated.implement()`][]: Việc hiện thực (implement) lớp hoặc mixin này là
    deprecated.
  * [`@Deprecated.subclass()`][]: Việc tạo lớp con (extend hoặc implement) của lớp hoặc
    mixin này là deprecated.
  * [`@Deprecated.mixin()`][]: Việc mix lớp này vào là deprecated.
  * [`@Deprecated.instantiate()`][]: Việc tạo thể hiện của lớp này là deprecated.
  * [`@Deprecated.optional()`][]: Việc bỏ qua đối số cho tham số này là deprecated.

  Đây là ví dụ dùng annotation `@Deprecated`:

  ```dart
  class Television {
    /// Use [turnOn] to turn the power on instead.
    @Deprecated('Use turnOn instead')
    void activate() {
      turnOn();
    }

    /// Turns the TV's power on.
    void turnOn() {
      // ···
    }
    // ···
  }
  ```

  > *Diễn giải:* doc comment nói "hãy dùng `[turnOn]` để bật nguồn thay cho phương thức
  > này"; `turnOn()` là phương thức bật nguồn TV.

[`@deprecated`][]
: Đánh dấu một khai báo là deprecated cho tới một bản phát hành tương lai chưa xác định.
  Nên ưu tiên dùng `@Deprecated` và [cung cấp một thông điệp deprecation][providing a deprecation message].

[`@override`][]
: Đánh dấu một thành viên thể hiện là bản ghi đè hoặc bản hiện thực của một thành viên
  cùng tên từ lớp cha hoặc interface. Xem ví dụ dùng `@override` tại
  [Extend a class][].

[`@pragma`][]
: Cung cấp chỉ dẫn hoặc gợi ý cụ thể về một khai báo cho các công cụ của Dart, chẳng hạn
  trình biên dịch hay analyzer.

[Dart analyzer][] sẽ đưa ra phản hồi dưới dạng chẩn đoán (diagnostic) khi cần annotation
`@override`, và khi bạn dùng những thành viên đã được chú thích `@deprecated` hoặc
`@Deprecated`.

[`@Deprecated`]: https://api.dart.dev/dart-core/Deprecated-class.html
[`@deprecated`]: https://api.dart.dev/dart-core/deprecated-constant.html
[`@override`]: https://api.dart.dev/dart-core/override-constant.html
[`@pragma`]: https://api.dart.dev/dart-core/pragma-class.html
[providing a deprecation message]: https://dart.dev/tools/linter-rules/provide_deprecation_message
[Extend a class]: https://dart.dev/language/extend
[Dart analyzer]: https://dart.dev/tools/analysis
[`@Deprecated.extend()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.extend.html
[`@Deprecated.implement()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.implement.html
[`@Deprecated.subclass()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.subclass.html
[`@Deprecated.mixin()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.mixin.html
[`@Deprecated.instantiate()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.instantiate.html
[`@Deprecated.optional()`]: https://api.dart.dev/beta/latest/dart-core/Deprecated/Deprecated.optional.html

## Annotation được analyzer hỗ trợ

Ngoài việc hỗ trợ và phân tích cho các [annotation dựng sẵn](#built-in-annotations),
[Dart analyzer][] còn cung cấp thêm hỗ trợ và chẩn đoán cho nhiều annotation từ
[`package:meta`][]. Một số annotation thường dùng mà package này cung cấp gồm:

[`@visibleForTesting`][]
: Đánh dấu một thành viên của package là chỉ công khai để nó có thể được truy cập từ các
  test của chính package đó. Analyzer sẽ ẩn thành viên này khỏi gợi ý autocomplete và cảnh
  báo nếu nó được dùng từ package khác.

[`@awaitNotRequired`][]
: Đánh dấu những biến có kiểu `Future` hoặc những hàm trả về `Future` là **không** yêu cầu
  bên gọi phải `await` cái `Future` đó. Việc này ngăn analyzer cảnh báo những bên gọi không
  `await` do các lint [`discarded_futures`][] hoặc [`unawaited_futures`][].

Để tìm hiểu thêm về những annotation này cùng các annotation khác của package — chúng biểu
thị điều gì, mở ra chức năng gì, và dùng ra sao — hãy xem
[tài liệu API của `package:meta/meta.dart`][meta-api].

[`@visibleForTesting`]: https://pub.dev/documentation/meta/latest/meta/visibleForTesting-constant.html
[`@awaitNotRequired`]: https://pub.dev/documentation/meta/latest/meta/awaitNotRequired-constant.html
[`discarded_futures`]: https://dart.dev/tools/linter-rules/discarded_futures
[`unawaited_futures`]: https://dart.dev/tools/linter-rules/unawaited_futures
[meta-api]: https://pub.dev/documentation/meta/latest/meta/meta-library.html

## Annotation tự định nghĩa

Bạn có thể tự định nghĩa annotation metadata riêng. Đây là ví dụ định nghĩa một annotation
`@Todo` nhận hai đối số:

```dart
class Todo {
  final String who;
  final String what;

  const Todo(this.who, this.what);
}
```

Và đây là ví dụ dùng annotation `@Todo` đó:

```dart
@Todo('Dash', 'Implement this function')
void doSomething() {
  print('Do something');
}
```

### Chỉ định các mục tiêu được hỗ trợ

Để cho biết annotation của bạn nên được gắn lên loại cấu trúc ngôn ngữ nào, hãy dùng
annotation [`@Target`][] từ [`package:meta`][].

Ví dụ, nếu bạn muốn annotation `@Todo` ở trên chỉ được phép dùng trên hàm và phương thức,
bạn sẽ thêm annotation sau:

```dart
import 'package:meta/meta_meta.dart';

@Target({TargetKind.function, TargetKind.method})
class Todo {
  // ···
}
```

Với cấu hình này, analyzer sẽ cảnh báo nếu `Todo` được dùng làm annotation trên bất kỳ
khai báo nào khác ngoài hàm top-level hoặc phương thức.

---

[`@Target`]: https://pub.dev/documentation/meta/latest/meta_meta/Target-class.html
[`package:meta`]: https://pub.dev/packages/meta

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
