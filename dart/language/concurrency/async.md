# Lập trình bất đồng bộ (Asynchronous programming)

> **Nguồn gốc:** <https://dart.dev/language/async> — *Asynchronous programming*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Concurrency (Xử lý đồng thời)](https://dart.dev/language/concurrency) · → [Isolates](https://dart.dev/language/isolates)

Các thư viện Dart có đầy những hàm trả về object [`Future`][] hoặc [`Stream`][]. Những hàm
này là _bất đồng bộ (asynchronous)_: chúng trả về ngay sau khi thiết lập xong một thao tác
có thể tốn nhiều thời gian (chẳng hạn I/O), mà không chờ thao tác đó hoàn tất.

Hai từ khóa `async` và `await` hỗ trợ lập trình bất đồng bộ, cho phép bạn viết code bất
đồng bộ trông giống như code đồng bộ.

<a id="handling-futures"></a>

## Xử lý Future

Khi bạn cần kết quả của một `Future` đã hoàn tất, bạn có hai lựa chọn:

* Dùng `async` và `await`, như mô tả ở đây và trong
  [hướng dẫn lập trình bất đồng bộ](https://dart.dev/libraries/async/async-await).
* Dùng Future API, như mô tả trong
  [tài liệu `dart:async`](https://dart.dev/libraries/dart-async#future).

Code dùng `async` và `await` là code bất đồng bộ, nhưng trông rất giống code đồng bộ. Ví
dụ, đây là đoạn code dùng `await` để chờ kết quả của một hàm bất đồng bộ:

```dart
await lookUpVersion();
```

Để dùng `await`, code phải nằm trong một hàm `async` — tức hàm được đánh dấu `async`:

```dart
Future<void> checkVersion() async {
  var version = await lookUpVersion();
  // Do something with version
}
```

> **Lưu ý**
> Mặc dù một hàm `async` có thể thực hiện những thao tác tốn thời gian, nó **không** chờ
> những thao tác đó. Thay vào đó, hàm `async` chỉ chạy cho tới khi gặp biểu thức `await`
> đầu tiên. Rồi nó trả về một object `Future`, và chỉ tiếp tục thực thi sau khi biểu thức
> `await` hoàn tất.

Dùng `try`, `catch` và `finally` để xử lý lỗi và dọn dẹp trong code có dùng `await`:

```dart
try {
  version = await lookUpVersion();
} catch (e) {
  // React to inability to look up the version
}
```

> *Diễn giải:* nhánh `catch` phản ứng lại tình huống không tra cứu được phiên bản.

Bạn có thể dùng `await` nhiều lần trong một hàm `async`. Ví dụ, đoạn code sau chờ kết quả
của các hàm ba lần:

```dart
var entrypoint = await findEntryPoint();
var exitCode = await runExecutable(entrypoint, args);
await flushThenExit(exitCode);
```

Trong <code>await <em>expression</em></code>, giá trị của
<code><em>expression</em></code> thường là một `Future`; nếu không phải, nó sẽ tự động được
bọc vào một `Future`. Object `Future` này biểu thị một lời hứa sẽ trả về một object. Giá
trị của <code>await <em>expression</em></code> chính là object được trả về đó. Biểu thức
`await` khiến việc thực thi tạm dừng cho tới khi object ấy sẵn sàng.

**Nếu bạn gặp lỗi lúc biên dịch khi dùng `await`, hãy chắc chắn rằng `await` đang nằm trong
một hàm `async`.** Ví dụ, để dùng `await` trong hàm `main()` của ứng dụng, thân hàm
`main()` phải được đánh dấu `async`:

```dart
void main() async {
  checkVersion();
  print('In main: version is ${await lookUpVersion()}');
}
```

> **Lưu ý**
> Ví dụ trên gọi một hàm `async` (`checkVersion()`) mà không chờ kết quả — một cách làm có
> thể gây vấn đề nếu code lại giả định rằng hàm đó đã chạy xong. Để tránh vấn đề này, hãy
> dùng [luật linter `unawaited_futures`][unawaited_futures linter rule].

Để có phần giới thiệu mang tính tương tác về `Future`, `async` và `await`, xem
[hướng dẫn lập trình bất đồng bộ](https://dart.dev/libraries/async/async-await).

<a id="declaring-async-functions"></a>

## Khai báo hàm `async`

Hàm `async` là hàm có thân được đánh dấu bằng từ khóa bổ nghĩa `async`.

Việc thêm từ khóa `async` vào một hàm khiến nó trả về một `Future`. Ví dụ, hãy xem hàm đồng
bộ sau, trả về một `String`:

```dart
String lookUpVersion() => '1.0.0';
```

Nếu bạn đổi nó thành hàm `async` — chẳng hạn vì một bản hiện thực trong tương lai sẽ tốn
thời gian — thì giá trị trả về sẽ là một `Future`:

```dart
Future<String> lookUpVersion() async => '1.0.0';
```

Lưu ý rằng thân hàm không cần phải dùng tới Future API. Dart sẽ tự tạo object `Future` khi
cần. Nếu hàm của bạn không trả về giá trị hữu ích nào, hãy đặt kiểu trả về là
`Future<void>`.

Để có phần giới thiệu mang tính tương tác về `Future`, `async` và `await`, xem
[hướng dẫn lập trình bất đồng bộ](https://dart.dev/libraries/async/async-await).

<a id="handling-streams"></a>

## Xử lý Stream

Khi bạn cần lấy giá trị từ một `Stream`, bạn có hai lựa chọn:

* Dùng `async` và một _vòng lặp for bất đồng bộ_ (`await for`).
* Dùng Stream API, như mô tả trong
  [tài liệu `dart:async`](https://dart.dev/libraries/dart-async#stream).

> **Lưu ý**
> Trước khi dùng `await for`, hãy chắc rằng nó làm code rõ ràng hơn và bạn thực sự muốn
> chờ **toàn bộ** kết quả của stream. Ví dụ, thông thường bạn **không nên** dùng
> `await for` cho các listener sự kiện UI, vì các framework UI gửi ra những stream sự kiện
> vô tận.

Một vòng lặp for bất đồng bộ có dạng như sau:

```dart
await for (varOrType identifier in expression) {
  // Executes each time the stream emits a value.
}
```

> *Diễn giải:* thân vòng lặp chạy mỗi khi stream phát ra một giá trị.

Giá trị của <code><em>expression</em></code> phải có kiểu `Stream`. Quá trình thực thi diễn
ra như sau:

1. Chờ cho tới khi stream phát ra một giá trị.
2. Chạy thân vòng lặp for, với biến được gán bằng giá trị vừa phát ra đó.
3. Lặp lại bước 1 và 2 cho tới khi stream đóng lại.

Để ngừng lắng nghe stream, bạn có thể dùng câu lệnh `break` hoặc `return` — chúng thoát
khỏi vòng lặp for và hủy đăng ký khỏi stream.

**Nếu bạn gặp lỗi lúc biên dịch khi viết vòng lặp for bất đồng bộ, hãy chắc chắn rằng
`await for` đang nằm trong một hàm `async`.** Ví dụ, để dùng vòng lặp for bất đồng bộ trong
hàm `main()` của ứng dụng, thân hàm `main()` phải được đánh dấu `async`:

```dart
void main() async {
  // ...
  await for (final request in requestServer) {
    handleRequest(request);
  }
  // ...
}
```

Để biết thêm về khả năng hỗ trợ lập trình bất đồng bộ của Dart, xem tài liệu thư viện
[`dart:async`](https://dart.dev/libraries/dart-async).

---

[`Future`]: https://api.dart.dev/dart-async/Future-class.html
[`Stream`]: https://api.dart.dev/dart-async/Stream-class.html
[unawaited_futures linter rule]: https://dart.dev/tools/linter-rules/unawaited_futures

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
