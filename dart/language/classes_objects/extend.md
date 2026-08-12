# Kế thừa lớp (Extend a class)

> **Nguồn gốc:** <https://dart.dev/language/extend> — *Extend a class*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Methods (Phương thức)](https://dart.dev/language/methods) · → [Mixins](https://dart.dev/language/mixins)

Dùng `extends` để tạo lớp con, và `super` để tham chiếu tới lớp cha:

```dart
class Television {
  void turnOn() {
    _illuminateDisplay();
    _activateIrSensor();
  }
  // ···
}

class SmartTelevision extends Television {
  void turnOn() {
    super.turnOn();
    _bootNetworkInterface();
    _initializeMemory();
    _upgradeApps();
  }
  // ···
}
```

Về một cách dùng khác của `extends`, xem phần thảo luận về
[kiểu được tham số hóa][parameterized types] trên trang Generics.

<a id="overriding-members"></a>

## Ghi đè thành viên (Overriding members)

Lớp con có thể ghi đè phương thức thể hiện (bao gồm cả [toán tử][operators]), getter và
setter. Bạn có thể dùng annotation `@override` để chỉ ra rằng bạn đang cố ý ghi đè một
thành viên:

```dart
class Television {
  // ···
  set contrast(int value) {
    // ···
  }
}

class SmartTelevision extends Television {
  @override
  set contrast(num value) {
    // ···
  }
  // ···
}
```

Một khai báo phương thức ghi đè phải khớp với phương thức (hoặc các phương thức) mà nó ghi
đè, theo nhiều tiêu chí:

* Kiểu trả về phải cùng kiểu với (hoặc là kiểu con của) kiểu trả về của phương thức bị ghi
  đè.
* Kiểu tham số phải cùng kiểu với (hoặc là **kiểu cha** của) kiểu tham số của phương thức
  bị ghi đè. Trong ví dụ trên, setter `contrast` của `SmartTelevision` đổi kiểu tham số từ
  `int` sang một kiểu cha là `num`.
* Nếu phương thức bị ghi đè nhận _n_ tham số theo vị trí, thì phương thức ghi đè cũng phải
  nhận _n_ tham số theo vị trí.
* [Phương thức generic][generic method] không thể ghi đè một phương thức không generic, và
  ngược lại, phương thức không generic cũng không thể ghi đè một phương thức generic.

Đôi khi bạn muốn thu hẹp kiểu của một tham số phương thức hoặc một biến thể hiện. Việc này
vi phạm các quy tắc thông thường, và nó tương tự một phép ép kiểu xuống ở chỗ có thể gây
lỗi kiểu lúc chạy. Tuy vậy, việc thu hẹp kiểu vẫn khả thi nếu code có thể đảm bảo rằng sẽ
không xảy ra lỗi kiểu. Trong trường hợp đó, bạn có thể dùng
[từ khóa `covariant`](https://dart.dev/language/type-system#covariant-keyword) trong phần
khai báo tham số. Chi tiết xem [đặc tả ngôn ngữ Dart][Dart language specification].

> **Cảnh báo**
> Nếu bạn ghi đè `==`, bạn cũng nên ghi đè getter `hashCode` của `Object`. Xem ví dụ ghi
> đè `==` và `hashCode` tại
> [Implementing map keys](https://dart.dev/libraries/dart-core#implementing-map-keys).

<a id="nosuchmethod"></a>

## `noSuchMethod()`

Để phát hiện hoặc phản ứng mỗi khi code cố dùng một phương thức hay biến thể hiện không
tồn tại, bạn có thể ghi đè `noSuchMethod()`:

```dart
class A {
  // Unless you override noSuchMethod, using a
  // non-existent member results in a NoSuchMethodError.
  @override
  void noSuchMethod(Invocation invocation) {
    print(
      'You tried to use a non-existent member: '
      '${invocation.memberName}',
    );
  }
}
```

> *Diễn giải:* nếu bạn không ghi đè `noSuchMethod`, việc dùng một thành viên không tồn tại
> sẽ gây ra `NoSuchMethodError`.

Bạn **không thể gọi** một phương thức chưa được hiện thực, trừ khi thỏa **một** trong các
điều kiện sau:

* Đối tượng nhận (receiver) có kiểu tĩnh là `dynamic`.

* Đối tượng nhận có kiểu tĩnh định nghĩa phương thức chưa hiện thực đó (là abstract cũng
  được), **và** kiểu động của đối tượng nhận có một phần hiện thực `noSuchMethod()` khác
  với bản trong lớp `Object`.

Chi tiết xem
[đặc tả không chính thức về noSuchMethod forwarding](https://github.com/dart-lang/language/blob/main/archive/feature-specifications/nosuchmethod-forwarding.md).

---

[parameterized types]: https://dart.dev/language/generics#restricting-the-parameterized-type
[operators]: https://dart.dev/language/methods#operators
[generic method]: https://dart.dev/language/generics#using-generic-methods
[Dart language specification]: https://dart.dev/resources/language/spec

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
