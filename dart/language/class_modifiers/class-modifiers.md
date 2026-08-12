# Class modifier (Từ khóa bổ nghĩa cho lớp)

> **Nguồn gốc:** <https://dart.dev/language/class-modifiers> — *Class modifiers*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Callable objects](https://dart.dev/language/callable-objects) · → [Class modifiers for API maintainers](https://dart.dev/language/class-modifiers-for-apis)

> **Lưu ý về phiên bản**
> Class modifier, ngoại trừ `abstract`, yêu cầu [phiên bản ngôn ngữ][language version] tối
> thiểu là 3.0.

Class modifier kiểm soát cách một class hoặc mixin được phép sử dụng — cả
[từ bên trong chính thư viện của nó](#abstract), lẫn từ bên ngoài thư viện nơi nó được
định nghĩa.

Từ khóa bổ nghĩa đứng trước phần khai báo class hoặc mixin. Ví dụ, viết `abstract class`
là định nghĩa một lớp trừu tượng. Toàn bộ tập từ khóa bổ nghĩa có thể xuất hiện trước một
khai báo class gồm:

- `abstract`
- `base`
- `final`
- `interface`
- `sealed`
- [`mixin`][class, mixin, or mixin class]

Chỉ có từ khóa `base` là được phép đứng trước một khai báo mixin. Các từ khóa bổ nghĩa này
**không** áp dụng cho những khai báo khác như `enum`, `typedef`, `extension` hay
`extension type`.

Khi cân nhắc có nên dùng class modifier hay không, hãy nghĩ tới mục đích sử dụng dự kiến
của lớp và những hành vi mà lớp đó cần đảm bảo.

> **Mẹo**
> Nếu bạn đã quen với class modifier của Dart và chỉ cần một bản tóm tắt hoặc ôn lại hành
> vi của chúng khi kết hợp với nhau, hãy xem [Tham chiếu class modifier][Class modifier reference].
>
> Nếu bạn đang bảo trì một thư viện, hãy đọc trang
> [Class modifier cho người bảo trì API][Class modifiers for API maintainers] để có hướng
> dẫn về cách xử lý những thay đổi này cho thư viện của bạn.

[Class modifier reference]: https://dart.dev/language/modifier-reference
[Class modifiers for API maintainers]: https://dart.dev/language/class-modifiers-for-apis

<a id="no-modifier"></a>

## Không có từ khóa bổ nghĩa

Để cho phép quyền tự do tuyệt đối trong việc tạo thể hiện hoặc tạo kiểu con từ bất kỳ thư
viện nào, hãy dùng khai báo `class` hoặc `mixin` mà không kèm từ khóa bổ nghĩa nào. Mặc
định, bạn có thể:

- [Tạo thể hiện][Construct] mới của một lớp.
- [Kế thừa (extend)][Extend] một lớp để tạo kiểu con mới.
- [Hiện thực (implement)][Implement] interface của một class hoặc mixin.
- [Mix vào][mixin] một mixin hoặc mixin class.

<a id="abstract"></a>

## `abstract`

Để định nghĩa một lớp không đòi hỏi phải hiện thực đầy đủ, cụ thể toàn bộ interface của
nó, hãy dùng từ khóa `abstract`.

Lớp trừu tượng **không thể** được tạo thể hiện từ bất kỳ thư viện nào, dù là thư viện của
chính nó hay thư viện bên ngoài. Lớp trừu tượng thường có
[phương thức trừu tượng][abstract methods].

```dart
// a.dart
abstract class Vehicle {
  void moveForward(int meters);
}
```

```dart
// b.dart
import 'a.dart';

// Error: `Vehicle` can't be instantiated because
// it is marked as `abstract`.
Vehicle myVehicle = Vehicle();

// Can be extended.
class Car extends Vehicle {
  int passengers = 4;

  @override
  void moveForward(int meters) {
    // ...
  }
}

// Can be implemented.
class MockVehicle implements Vehicle {
  @override
  void moveForward(int meters) {
    // ...
  }
}
```

> *Diễn giải:* dòng đầu gây lỗi vì `Vehicle` không thể tạo thể hiện do được đánh dấu
> `abstract`; nhưng nó **kế thừa được** và **hiện thực được**.

Nếu bạn muốn lớp trừu tượng của mình trông như có thể tạo thể hiện, hãy định nghĩa một
[factory constructor][].

<a id="base"></a>

## `base`

Để bắt buộc phần hiện thực của một class hoặc mixin phải được **kế thừa**, hãy dùng từ khóa
`base`. Một lớp `base` không cho phép `implements` từ bên ngoài thư viện của chính nó. Điều
này đảm bảo:

- Constructor của lớp base luôn được gọi mỗi khi một thể hiện của kiểu con của lớp đó được
  tạo ra.
- Mọi thành viên private đã được hiện thực đều tồn tại trong các kiểu con.
- Một thành viên mới được hiện thực trong lớp `base` sẽ không làm hỏng các kiểu con, vì mọi
  kiểu con đều kế thừa thành viên mới đó.
  - Điều này đúng, trừ khi kiểu con đã khai báo sẵn một thành viên trùng tên với chữ ký
    không tương thích.

Bạn **phải** đánh dấu mọi lớp `implements` hoặc `extends` một lớp base bằng `base`, `final`
hoặc `sealed`. Việc này ngăn các thư viện bên ngoài phá vỡ những đảm bảo của lớp base.

```dart
// a.dart
base class Vehicle {
  void moveForward(int meters) {
    // ...
  }
}
```

```dart
// b.dart
import 'a.dart';

// Can be constructed.
Vehicle myVehicle = Vehicle();

// Can be extended.
base class Car extends Vehicle {
  int passengers = 4;
  // ...
}

// ERROR: `Vehicle` can't be implemented in a different library because
// it is marked with `base`.
base class MockVehicle implements Vehicle {
  @override
  void moveForward() {
    // ...
  }
}
```

> *Diễn giải:* tạo thể hiện được, kế thừa được; nhưng **lỗi** — không thể `implements`
> `Vehicle` từ một thư viện khác vì nó được đánh dấu `base`.

<a id="interface"></a>

## `interface`

Để định nghĩa một interface, hãy dùng từ khóa `interface`. Các thư viện bên ngoài thư viện
định nghĩa interface đó có thể `implements` nó, nhưng **không** `extends` được. Điều này
đảm bảo:

- Khi một phương thức thể hiện của lớp gọi một phương thức thể hiện khác trên `this`, nó
  sẽ luôn gọi tới một bản hiện thực đã biết của phương thức đó, nằm trong cùng thư viện.
- Các thư viện khác không thể ghi đè những phương thức mà chính phương thức của lớp
  interface có thể sẽ gọi tới sau này theo cách bất ngờ. Điều này giảm bớt
  [vấn đề lớp cơ sở dễ vỡ (fragile base class problem)][fragile base class problem].

```dart
// a.dart
interface class Vehicle {
  void moveForward(int meters) {
    // ...
  }
}
```

```dart
// b.dart
import 'a.dart';

// Can be constructed.
Vehicle myVehicle = Vehicle();

// ERROR: `Vehicle` can't be extended in a different library because
// it is marked with `interface`.
class Car extends Vehicle {
  int passengers = 4;
  // ...
}

// Can be implemented.
class MockVehicle implements Vehicle {
  @override
  void moveForward(int meters) {
    // ...
  }
}
```

> *Diễn giải:* tạo thể hiện được; **lỗi** — không thể `extends` từ thư viện khác vì nó được
> đánh dấu `interface`; nhưng `implements` thì được.

<a id="abstract-interface"></a>

### `abstract interface`

Cách dùng phổ biến nhất của từ khóa `interface` là để định nghĩa một interface thuần túy.
Hãy [kết hợp](#kết-hợp-các-từ-khóa-bổ-nghĩa) `interface` với [`abstract`](#abstract) để
được `abstract interface class`.

Giống như lớp `interface`, các thư viện khác có thể `implements` nhưng không kế thừa được
một interface thuần túy. Và giống như lớp `abstract`, interface thuần túy có thể có thành
viên trừu tượng.

<a id="final"></a>

## `final`

Để đóng lại cây phân cấp kiểu, hãy dùng từ khóa `final`. Nó ngăn việc tạo kiểu con từ một
lớp nằm ngoài thư viện hiện tại. Việc cấm cả kế thừa lẫn hiện thực sẽ ngăn hoàn toàn khả
năng tạo kiểu con. Điều này đảm bảo:

- Bạn có thể yên tâm bổ sung dần các thay đổi vào API.
- Bạn có thể gọi phương thức thể hiện mà biết chắc chúng chưa bị ghi đè trong một lớp con
  của bên thứ ba.

Lớp `final` vẫn có thể được `extends` hoặc `implements` **trong cùng thư viện**. Từ khóa
`final` bao trùm luôn tác dụng của `base`, và do đó mọi lớp con cũng phải được đánh dấu
`base`, `final` hoặc `sealed`.

```dart
// a.dart
final class Vehicle {
  void moveForward(int meters) {
    // ...
  }
}
```

```dart
// b.dart
import 'a.dart';

// Can be constructed.
Vehicle myVehicle = Vehicle();

// ERROR: `Vehicle` can't be extended in a different library
// because it is marked `final`.
class Car extends Vehicle {
  int passengers = 4;
  // ...
}

// ERROR: `Vehicle` can't be implemented in a different library because
// it is marked `final`.
class MockVehicle implements Vehicle {
  @override
  void moveForward(int meters) {
    // ...
  }
}
```

> *Diễn giải:* tạo thể hiện được; nhưng **cả hai** trường hợp `extends` và `implements` từ
> thư viện khác đều gây lỗi vì lớp được đánh dấu `final`.

<a id="sealed"></a>

## `sealed`

Để tạo ra một tập kiểu con đã biết trước và liệt kê được, hãy dùng từ khóa `sealed`. Điều
này cho phép bạn viết một `switch` trên các kiểu con đó, và được đảm bảo tĩnh là
[_đầy đủ (exhaustive)_][exhaustive].

Từ khóa `sealed` ngăn một lớp bị `extends` hoặc `implements` từ bên ngoài thư viện của
chính nó. Lớp `sealed` ngầm định là [`abstract`](#abstract).

- Bản thân chúng không thể được tạo thể hiện.
- Chúng có thể có [factory constructor](https://dart.dev/language/constructors#factory-constructors).
- Chúng có thể định nghĩa constructor để các lớp con dùng.

Tuy nhiên, lớp con của lớp `sealed` thì **không** ngầm định là trừu tượng.

Trình biên dịch biết được mọi kiểu con trực tiếp khả dĩ, bởi chúng chỉ có thể tồn tại trong
cùng một thư viện. Điều này cho phép trình biên dịch cảnh báo bạn khi một `switch` chưa xử
lý đầy đủ mọi kiểu con khả dĩ trong các nhánh `case` của nó:

```dart
sealed class Vehicle {}

class Car extends Vehicle {}

class Truck implements Vehicle {}

class Bicycle extends Vehicle {}

// ERROR: `Vehicle` can't be instantiated because
// it is marked `sealed` and therefore, implicitly abstract.
Vehicle myVehicle = Vehicle();

// Subclasses of a sealed class can be instantiated unless also restricted.
Vehicle myCar = Car();

extension VehicleSounds on Vehicle {
  String get sound {
    // ERROR: The switch does not exhaustively account for
    // all possible objects of type `Vehicle`.
    // In this example, a `Vehicle` with a run-time type of `Bicycle`
    // would not match any of the cases.
    return switch (this) {
      Car() => 'vroom',
      Truck() => 'VROOOOMM',
    };
  }
}
```

> *Diễn giải:* **lỗi** — không tạo được thể hiện của `Vehicle` vì nó được đánh dấu `sealed`
> nên ngầm định là trừu tượng. Lớp con của lớp sealed thì tạo thể hiện được, trừ khi bản
> thân chúng cũng bị hạn chế. Ở cuối, `switch` gây **lỗi** vì chưa xử lý đầy đủ mọi object
> khả dĩ thuộc kiểu `Vehicle` — trong ví dụ này, một `Vehicle` có kiểu lúc chạy là
> `Bicycle` sẽ không khớp với nhánh `case` nào.

Nếu bạn không muốn [switch đầy đủ][exhaustive], hoặc muốn có thể bổ sung kiểu con về sau mà
không phá vỡ API, hãy dùng từ khóa [`final`](#final). Để so sánh sâu hơn, xem
[`sealed` so với `final`](https://dart.dev/language/class-modifiers-for-apis#sealed-versus-final).

<a id="combining-modifiers"></a>

## Kết hợp các từ khóa bổ nghĩa

Bạn có thể kết hợp một số từ khóa bổ nghĩa để tạo ra các lớp hạn chế chồng lên nhau. Một
khai báo class có thể gồm, theo đúng thứ tự:

1. (Tùy chọn) `abstract` — mô tả việc lớp có được chứa thành viên trừu tượng hay không, và
   ngăn việc tạo thể hiện.
2. (Tùy chọn) Một trong các từ khóa `base`, `interface`, `final` hoặc `sealed` — mô tả các
   hạn chế đối với việc thư viện khác tạo kiểu con từ lớp này.
3. (Tùy chọn) `mixin` — mô tả việc khai báo này có được mix vào hay không.
4. Chính từ khóa `class`.

Bạn **không thể** kết hợp một số từ khóa vì chúng mâu thuẫn, thừa thãi, hoặc loại trừ lẫn
nhau:

* `abstract` với `sealed`. Một lớp [`sealed`](#sealed) đã ngầm định là
  [`abstract`](#abstract).
* `interface`, `final` hoặc `sealed` với `mixin`. Những từ khóa kiểm soát truy cập này ngăn
  việc [mix vào][mixin].

Để có thêm hướng dẫn về cách kết hợp class modifier, xem
[Tham chiếu class modifier][Class modifiers reference].

[Class modifiers reference]: https://dart.dev/language/modifier-reference

---

[language version]: https://dart.dev/language/versioning
[class, mixin, or mixin class]: https://dart.dev/language/mixins#class-mixin-or-mixin-class
[mixin]: https://dart.dev/language/mixins
[fragile base class problem]: https://en.wikipedia.org/wiki/Fragile_base_class
[`noSuchMethod`]: https://dart.dev/language/extend#nosuchmethod
[Construct]: https://dart.dev/language/constructors
[Extend]: https://dart.dev/language/extend
[Implement]: https://dart.dev/language/classes#implicit-interfaces
[factory constructor]: https://dart.dev/language/constructors#factory-constructors
[exhaustive]: https://dart.dev/language/branches#exhaustiveness-checking
[abstract methods]: https://dart.dev/language/methods#abstract-methods
[syntax specification]: https://github.com/dart-lang/language/blob/main/accepted/3.0/class-modifiers/feature-specification.md#syntax

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
