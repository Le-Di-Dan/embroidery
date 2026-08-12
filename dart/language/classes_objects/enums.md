# Kiểu liệt kê (Enums)

> **Nguồn gốc:** <https://dart.dev/language/enums> — *Enumerated types*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Mixins](https://dart.dev/language/mixins) · → [Dot shorthands](https://dart.dev/language/dot-shorthands)

Kiểu liệt kê — thường được gọi là _enumeration_ hay _enum_ — là một loại lớp đặc biệt dùng
để biểu diễn một số lượng cố định các giá trị hằng.

> **Lưu ý**
> Mọi enum đều tự động kế thừa lớp [`Enum`][]. Chúng cũng là `sealed`, nghĩa là không thể
> tạo lớp con, không thể hiện thực, không thể mix vào, hay tạo thể hiện một cách tường
> minh theo bất kỳ cách nào khác.
>
> Lớp trừu tượng và mixin **có thể** hiện thực hoặc kế thừa `Enum` một cách tường minh,
> nhưng trừ khi sau đó chúng được hiện thực bởi hoặc mix vào một khai báo enum, sẽ không
> object nào thực sự hiện thực được kiểu của lớp hay mixin đó.

## Khai báo enum đơn giản

Để khai báo một kiểu liệt kê đơn giản, hãy dùng từ khóa `enum` và liệt kê các giá trị bạn
muốn:

```dart
enum Color { red, green, blue }
```

> **Mẹo**
> Bạn cũng có thể dùng [dấu phẩy cuối][trailing commas] khi khai báo kiểu liệt kê để phòng
> tránh lỗi copy-paste.

<a id="declaring-enhanced-enums"></a>

## Khai báo enum nâng cao (Enhanced enums)

> **Lưu ý về phiên bản**
> Enum nâng cao yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 2.17.

Dart cũng cho phép khai báo enum thành những lớp có trường, phương thức và constructor
`const`, nhưng bị giới hạn ở một số lượng cố định các thể hiện hằng đã biết trước.

Để khai báo một enum nâng cao, hãy theo cú pháp tương tự [lớp][classes] thông thường, nhưng
có thêm vài yêu cầu:

* Biến thể hiện phải là `final`, kể cả những biến do [mixin][mixins] thêm vào.
* Mọi [generative constructor][generative constructors] đều phải là hằng.
* [Factory constructor][Factory constructors] chỉ được trả về một trong những thể hiện
  enum cố định đã biết.
* Không được kế thừa lớp nào khác, vì [`Enum`] đã được kế thừa tự động.
* Không được ghi đè `index`, `hashCode`, hay toán tử so sánh bằng `==`.
* Không được khai báo thành viên tên là `values` trong enum, vì nó sẽ xung đột với getter
  tĩnh `values` được sinh tự động.
* Mọi thể hiện của enum phải được khai báo ở **đầu** phần khai báo, và phải có ít nhất một
  thể hiện.

Phương thức thể hiện trong enum nâng cao có thể dùng `this` để tham chiếu tới giá trị enum
hiện tại.

Đây là ví dụ khai báo một enum nâng cao với nhiều thể hiện, biến thể hiện, getter, và một
interface được hiện thực:

```dart
enum Vehicle implements Comparable<Vehicle> {
  car(tires: 4, passengers: 5, carbonPerKilometer: 400),
  bus(tires: 6, passengers: 50, carbonPerKilometer: 800),
  bicycle(tires: 2, passengers: 1, carbonPerKilometer: 0);

  const Vehicle({
    required this.tires,
    required this.passengers,
    required this.carbonPerKilometer,
  });

  final int tires;
  final int passengers;
  final int carbonPerKilometer;

  int get carbonFootprint => (carbonPerKilometer / passengers).round();

  bool get isTwoWheeled => this == Vehicle.bicycle;

  @override
  int compareTo(Vehicle other) => carbonFootprint - other.carbonFootprint;
}
```

> **Mẹo**
> Từ Dart 3.13 trở đi, bạn có thể khai báo enum nâng cao gọn hơn nữa bằng
> [primary constructor][primary constructors]:
>
> ```dart
> enum Vehicle(
>   final int tires,
>   final int passengers,
>   final int carbonPerKilometer,
> ) implements Comparable<Vehicle> {
>   car(4, 5, 400),
>   bus(6, 50, 800),
>   bicycle(2, 1, 0);
>
>   int get carbonFootprint => (carbonPerKilometer / passengers).round();
>
>   bool get isTwoWheeled => this == Vehicle.bicycle;
>
>   @override
>   int compareTo(Vehicle other) => carbonFootprint - other.carbonFootprint;
> }
> ```

[language version]: https://dart.dev/language/versioning
[primary constructors]: https://dart.dev/language/primary-constructors

## Sử dụng enum

Truy cập các giá trị liệt kê giống như bất kỳ [biến tĩnh][static variable] nào khác:

```dart
final favoriteColor = Color.blue;
if (favoriteColor == Color.blue) {
  print('Your favorite color is blue!');
}
```

Mỗi giá trị trong enum có một getter `index`, trả về vị trí (đánh số từ 0) của giá trị đó
trong phần khai báo enum. Ví dụ, giá trị đầu tiên có index 0, giá trị thứ hai có index 1.

```dart
assert(Color.red.index == 0);
assert(Color.green.index == 1);
assert(Color.blue.index == 2);
```

Để lấy danh sách toàn bộ giá trị liệt kê, hãy dùng hằng `values` của enum.

```dart
List<Color> colors = Color.values;
assert(colors[2] == Color.blue);
```

Bạn có thể dùng enum trong [câu lệnh `switch`][switch statements], và bạn sẽ nhận cảnh báo
nếu không xử lý hết mọi giá trị của enum:

```dart
var aColor = Color.blue;

switch (aColor) {
  case Color.red:
    print('Red as roses!');
  case Color.green:
    print('Green as grass!');
  default: // Without this, you see a WARNING.
    print(aColor); // 'Color.blue'
}
```

> *Diễn giải:* nếu không có nhánh `default` này, bạn sẽ thấy một CẢNH BÁO.

Nếu bạn cần lấy tên của một giá trị liệt kê — chẳng hạn lấy `'blue'` từ `Color.blue` — hãy
dùng thuộc tính `.name`:

```dart
print(Color.blue.name); // 'blue'
```

Bạn có thể truy cập thành viên của một giá trị enum y như trên một object thông thường:

```dart
print(Vehicle.car.carbonFootprint);
```

---

[`Enum`]: https://api.dart.dev/dart-core/Enum-class.html
[trailing commas]: https://dart.dev/language/collections#lists
[classes]: https://dart.dev/language/classes
[mixins]: https://dart.dev/language/mixins
[generative constructors]: https://dart.dev/language/constructors#constant-constructors
[Factory constructors]: https://dart.dev/language/constructors#factory-constructors
[static variable]: https://dart.dev/language/classes#class-variables-and-methods
[switch statements]: https://dart.dev/language/branches#switch

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
