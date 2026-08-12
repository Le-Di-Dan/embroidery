# Xử lý lỗi (Error handling)

> **Nguồn gốc:** <https://dart.dev/language/error-handling> — *Error handling*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Branches (Rẽ nhánh)](https://dart.dev/language/branches) · → [Functions (Hàm)](https://dart.dev/language/functions)

<a id="exceptions"></a>

## Ngoại lệ (Exceptions)

Code Dart của bạn có thể ném (throw) và bắt (catch) ngoại lệ. Ngoại lệ là những lỗi cho
biết có điều gì đó ngoài dự kiến đã xảy ra. Nếu ngoại lệ không được bắt, [isolate][] đã
phát sinh ngoại lệ sẽ bị tạm dừng, và thông thường isolate cùng chương trình của nó sẽ bị
kết thúc.

Khác với Java, mọi ngoại lệ trong Dart đều là **unchecked exception**. Các phương thức
không khai báo chúng có thể ném ra ngoại lệ nào, và bạn cũng không bắt buộc phải bắt bất
kỳ ngoại lệ nào.

Dart cung cấp các kiểu [`Exception`][] và [`Error`][], cùng vô số kiểu con đã được định
nghĩa sẵn. Tất nhiên bạn cũng có thể tự định nghĩa ngoại lệ riêng. Tuy nhiên, chương trình
Dart có thể ném ra **bất kỳ object khác null nào** làm ngoại lệ — không nhất thiết phải là
object `Exception` hay `Error`.

<a id="throw"></a>

### Throw (ném ngoại lệ)

Đây là ví dụ về việc ném ra — hay *phát sinh* — một ngoại lệ:

```dart
throw FormatException('Expected at least 1 section');
```

Bạn cũng có thể ném ra object tùy ý:

```dart
throw 'Out of llamas!';
```

> **Lưu ý**
> Code đạt chất lượng production thường chỉ ném ra những kiểu hiện thực [`Error`][] hoặc
> [`Exception`][].

Vì việc ném ngoại lệ là một biểu thức, bạn có thể ném ngoại lệ trong câu lệnh dạng `=>`,
cũng như ở bất cứ đâu cho phép đặt biểu thức:

```dart
void distanceTo(Point other) => throw UnimplementedError();
```

<a id="catch"></a>

### Catch (bắt ngoại lệ)

Việc bắt — hay chặn lại — một ngoại lệ sẽ ngăn ngoại lệ đó lan truyền tiếp (trừ khi bạn
ném lại nó bằng `rethrow`). Bắt được ngoại lệ cho bạn cơ hội xử lý nó:

```dart
try {
  breedMoreLlamas();
} on OutOfLlamasException {
  buyMoreLlamas();
}
```

Để xử lý đoạn code có thể ném ra nhiều hơn một loại ngoại lệ, bạn có thể khai báo nhiều
mệnh đề `catch`. Mệnh đề `catch` **đầu tiên** khớp với kiểu của object được ném ra sẽ xử
lý ngoại lệ đó. Nếu mệnh đề `catch` không chỉ định kiểu, mệnh đề đó có thể xử lý mọi loại
object được ném ra:

```dart
try {
  breedMoreLlamas();
} on OutOfLlamasException {
  // A specific exception
  buyMoreLlamas();
} on Exception catch (e) {
  // Anything else that is an exception
  print('Unknown exception: $e');
} catch (e) {
  // No specified type, handles all
  print('Something really unknown: $e');
}
```

> *Diễn giải các chú thích:* mệnh đề 1 bắt một ngoại lệ cụ thể; mệnh đề 2 bắt mọi thứ khác
> mà vẫn là `Exception`; mệnh đề 3 không chỉ định kiểu nên xử lý tất cả.

Như đoạn code trên cho thấy, bạn có thể dùng `on`, hoặc `catch`, hoặc cả hai. Dùng `on`
khi bạn cần chỉ định kiểu ngoại lệ. Dùng `catch` khi phần xử lý ngoại lệ của bạn cần tới
chính object ngoại lệ.

Bạn có thể truyền một hoặc hai tham số cho `catch()`. Tham số thứ nhất là ngoại lệ đã được
ném ra, còn tham số thứ hai là stack trace (một object [`StackTrace`][]).

```dart
try {
  // ···
} on Exception catch (e) {
  print('Exception details:\n $e');
} catch (e, s) {
  print('Exception details:\n $e');
  print('Stack trace:\n $s');
}
```

Để xử lý một phần ngoại lệ mà vẫn cho phép nó lan truyền tiếp, hãy dùng từ khóa `rethrow`.

```dart
void misbehave() {
  try {
    dynamic foo = true;
    print(foo++); // Runtime error
  } catch (e) {
    print('misbehave() partially handled ${e.runtimeType}.');
    rethrow; // Allow callers to see the exception.
  }
}

void main() {
  try {
    misbehave();
  } catch (e) {
    print('main() finished handling ${e.runtimeType}.');
  }
}
```

> *Diễn giải:* `print(foo++)` gây lỗi lúc chạy; `rethrow` cho phép bên gọi cũng nhìn thấy
> ngoại lệ đó.

<a id="finally"></a>

### Finally

Để đảm bảo một đoạn code luôn được chạy bất kể có ngoại lệ được ném ra hay không, hãy dùng
mệnh đề `finally`. Nếu không mệnh đề `catch` nào khớp với ngoại lệ, ngoại lệ sẽ được lan
truyền tiếp **sau khi** mệnh đề `finally` chạy xong:

```dart
try {
  breedMoreLlamas();
} finally {
  // Always clean up, even if an exception is thrown.
  cleanLlamaStalls();
}
```

> *Diễn giải:* luôn dọn dẹp, kể cả khi có ngoại lệ được ném ra.

Mệnh đề `finally` chạy sau mọi mệnh đề `catch` khớp:

```dart
try {
  breedMoreLlamas();
} catch (e) {
  print('Error: $e'); // Handle the exception first.
} finally {
  cleanLlamaStalls(); // Then clean up.
}
```

> *Diễn giải:* xử lý ngoại lệ trước, rồi mới dọn dẹp.

Tìm hiểu thêm tại
[tài liệu về ngoại lệ của thư viện lõi](https://dart.dev/libraries/dart-core#exceptions).

<a id="assert"></a>

## Assert

Trong quá trình phát triển, hãy dùng câu lệnh assert —
`assert(<condition>, <optionalMessage>);` — để cắt ngang luồng thực thi bình thường khi
một điều kiện boolean là false.

```dart
// Make sure the variable has a non-null value.
assert(text != null);

// Make sure the value is less than 100.
assert(number < 100);

// Make sure this is an https URL.
assert(urlString.startsWith('https'));
```

> *Diễn giải:* lần lượt là — đảm bảo biến có giá trị khác null; đảm bảo giá trị nhỏ hơn
> 100; đảm bảo đây là một URL https.

Để gắn kèm một thông điệp vào assertion, hãy thêm một chuỗi làm đối số thứ hai cho `assert`
(có thể kèm [dấu phẩy cuối][trailing comma]):

```dart
assert(
  urlString.startsWith('https'),
  'URL ($urlString) should start with "https".',
);
```

Đối số thứ nhất của `assert` có thể là bất kỳ biểu thức nào cho ra giá trị boolean. Nếu
giá trị của biểu thức là true, assertion thành công và việc thực thi tiếp tục. Nếu là
false, assertion thất bại và một ngoại lệ ([`AssertionError`][]) được ném ra.

Vậy chính xác thì khi nào assertion hoạt động? Điều đó phụ thuộc vào công cụ và framework
bạn đang dùng:

* Flutter bật assertion trong [chế độ debug][Flutter debug mode].
* Các công cụ chỉ dành cho phát triển như [`webdev serve`][] thường bật assertion theo mặc
  định.
* Một số công cụ, như [`dart run`][] và [`dart compile js`][], hỗ trợ assertion thông qua
  cờ dòng lệnh: `--enable-asserts`.

Trong code production, assertion bị bỏ qua, và các đối số truyền cho `assert` cũng không
được tính toán.

---

[trailing comma]: https://dart.dev/language/collections#trailing-comma
[`AssertionError`]: https://api.dart.dev/dart-core/AssertionError-class.html
[Flutter debug mode]: https://docs.flutter.dev/testing/debugging#debug-mode-assertions
[`webdev serve`]: https://dart.dev/tools/webdev#serve
[`dart run`]: https://dart.dev/tools/dart-run
[`dart compile js`]: https://dart.dev/tools/dart-compile#js
[isolate]: https://dart.dev/language/concurrency#isolates
[`Error`]: https://api.dart.dev/dart-core/Error-class.html
[`Exception`]: https://api.dart.dev/dart-core/Exception-class.html
[`StackTrace`]: https://api.dart.dev/dart-core/StackTrace-class.html

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
