# Chú thích (Comments)

> **Nguồn gốc:** <https://dart.dev/language/comments> — *Comments*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Operators (Toán tử)](https://dart.dev/language/operators) · → [Built-in types (Kiểu dựng sẵn)](https://dart.dev/language/built-in-types)

Dart hỗ trợ chú thích một dòng, chú thích nhiều dòng, và chú thích tài liệu
(documentation comment).

## Chú thích một dòng (Single-line comments)

Chú thích một dòng bắt đầu bằng `//`. Mọi thứ nằm giữa `//` và cuối dòng đều bị trình biên
dịch Dart bỏ qua.

```dart
void main() {
  // TODO: refactor into an AbstractLlamaGreetingFactory?
  print('Welcome to my Llama farm!');
}
```

> *Diễn giải:* dòng chú thích là một ghi chú TODO — "có nên tái cấu trúc thành một
> `AbstractLlamaGreetingFactory` không?".

## Chú thích nhiều dòng (Multi-line comments)

Chú thích nhiều dòng bắt đầu bằng `/*` và kết thúc bằng `*/`. Mọi thứ nằm giữa `/*` và
`*/` đều bị trình biên dịch Dart bỏ qua (trừ khi đó là chú thích tài liệu; xem mục kế
tiếp). Chú thích nhiều dòng có thể lồng nhau.

```dart
void main() {
  /*
   * This is a lot of work. Consider raising chickens.

  Llama larry = Llama();
  larry.feed();
  larry.exercise();
  larry.clean();
   */
}
```

> *Diễn giải:* nội dung chú thích là "Việc này tốn nhiều công quá. Cân nhắc chuyển sang
> nuôi gà đi." — kèm theo phần code đã bị comment lại.

## Chú thích tài liệu (Documentation comments)

Chú thích tài liệu là chú thích nhiều dòng hoặc một dòng bắt đầu bằng `///` hoặc `/**`.
Dùng `///` trên nhiều dòng liên tiếp cũng cho hiệu quả tương đương một chú thích tài liệu
nhiều dòng.

Bên trong một chú thích tài liệu, bộ phân tích (analyzer) bỏ qua toàn bộ văn bản trừ phần
được đặt trong dấu ngoặc vuông. Bằng dấu ngoặc vuông, bạn có thể tham chiếu tới lớp,
phương thức, trường (field), biến top-level, hàm và tham số. Những tên nằm trong ngoặc
vuông sẽ được phân giải theo phạm vi từ vựng (lexical scope) của phần tử chương trình đang
được viết tài liệu.

Đây là ví dụ về chú thích tài liệu có tham chiếu tới các lớp và đối số khác:

```dart
/// A domesticated South American camelid (Lama glama).
///
/// Andean cultures have used llamas as meat and pack
/// animals since pre-Hispanic times.
///
/// Just like any other animal, llamas need to eat,
/// so don't forget to [feed] them some [Food].
class Llama {
  String? name;

  /// Feeds your llama [food].
  ///
  /// The typical llama eats one bale of hay per week.
  void feed(Food food) {
    // ...
  }

  /// Exercises your llama with an [activity] for
  /// [timeLimit] minutes.
  void exercise(Activity activity, int timeLimit) {
    // ...
  }
}
```

> *Diễn giải nội dung các chú thích tài liệu trong ví dụ trên:*
> - Lớp `Llama`: "Một loài lạc đà Nam Mỹ đã được thuần hóa (Lama glama). Các nền văn hóa
>   vùng Andes đã dùng lạc đà không bướu làm nguồn thịt và vật thồ hàng từ thời tiền
>   Tây Ban Nha. Cũng như mọi loài vật khác, lạc đà cần ăn, nên đừng quên `[feed]` cho
>   chúng chút `[Food]`."
> - `feed()`: "Cho lạc đà của bạn ăn `[food]`. Một con lạc đà thông thường ăn hết một kiện
>   cỏ khô mỗi tuần."
> - `exercise()`: "Cho lạc đà của bạn vận động với hoạt động `[activity]` trong
>   `[timeLimit]` phút."

Trong tài liệu được sinh ra cho lớp này, `[feed]` sẽ trở thành một liên kết tới tài liệu
của phương thức `feed`, còn `[Food]` trở thành liên kết tới tài liệu của lớp `Food`.

Để phân tích code Dart và sinh ra tài liệu HTML, bạn có thể dùng công cụ sinh tài liệu của
Dart: [`dart doc`](https://dart.dev/tools/dart-doc). Để xem ví dụ về tài liệu được sinh
ra, hãy xem [Dart API documentation.](https://api.dart.dev) Về lời khuyên cách cấu trúc
chú thích của bạn, xem
[Effective Dart: Documentation.](https://dart.dev/effective-dart/documentation)

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
