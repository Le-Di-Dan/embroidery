# Vòng lặp (Loops)

> **Nguồn gốc:** <https://dart.dev/language/loops> — *Loops*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Pattern types](https://dart.dev/language/pattern-types) · → [Branches (Rẽ nhánh)](https://dart.dev/language/branches)

Trang này trình bày cách điều khiển luồng thực thi code Dart bằng vòng lặp và các câu lệnh
hỗ trợ:

-   Vòng lặp `for`
-   Vòng lặp `while` và `do while`
-   `break` và `continue`

Bạn cũng có thể điều khiển luồng trong Dart bằng:

- [Rẽ nhánh][Branching], như `if` và `switch`
- [Ngoại lệ][Exceptions], như `try`, `catch` và `throw`

## Vòng lặp `for`

Bạn có thể lặp bằng vòng lặp `for` tiêu chuẩn. Ví dụ:

```dart
var message = StringBuffer('Dart is fun');
for (var i = 0; i < 5; i++) {
  message.write('!');
}
```

Closure nằm bên trong vòng lặp `for` của Dart bắt lấy **giá trị** của biến đếm. Điều này
tránh được một cái bẫy phổ biến trong JavaScript. Ví dụ, hãy xem:

```dart
var callbacks = [];
for (var i = 0; i < 2; i++) {
  callbacks.add(() => print(i));
}

for (final c in callbacks) {
  c();
}
```

Kết quả in ra là `0` rồi `1`, đúng như mong đợi. Ngược lại, ví dụ này sẽ in ra `2` rồi `2`
trong JavaScript.

Đôi khi bạn không cần biết chỉ số của vòng lặp hiện tại khi duyệt qua một kiểu
[`Iterable`][] như `List` hay `Set`. Trong trường hợp đó, hãy dùng vòng lặp `for-in` để
code gọn hơn:

```dart
for (var candidate in candidates) {
  candidate.interview();
}
```

Trong ví dụ trên, `candidate` được định nghĩa bên trong thân vòng lặp và mỗi lượt lại được
gán tham chiếu tới một giá trị trong `candidates`. `candidate` là một [biến][variable] cục
bộ. Việc gán lại `candidate` bên trong thân vòng lặp chỉ thay đổi biến cục bộ của lượt lặp
đó, chứ không làm thay đổi iterable `candidates` gốc.

Để xử lý những giá trị lấy được từ iterable, bạn cũng có thể dùng [pattern][] trong vòng
lặp `for-in`:

```dart
for (final Candidate(:name, :yearsExperience) in candidates) {
  print('$name has $yearsExperience of experience.');
}
```

> **Mẹo**
> Để luyện tập dùng `for-in`, hãy theo dõi
> [hướng dẫn về Iterable collections](https://dart.dev/libraries/collections/iterables).

Các lớp iterable cũng có phương thức [forEach()][] như một lựa chọn khác:

```dart
var collection = [1, 2, 3];
collection.forEach(print); // 1 2 3
```

[variable]: https://dart.dev/language/variables

## `while` và `do-while`

Vòng lặp `while` tính điều kiện **trước** mỗi lượt lặp:

```dart
while (!isDone()) {
  doSomething();
}
```

Vòng lặp `do`-`while` tính điều kiện *sau* mỗi lượt lặp:

```dart
do {
  printLine();
} while (!atEndOfPage());
```

## `break` và `continue`

Dùng `break` để dừng vòng lặp:

```dart
while (true) {
  if (shutDownRequested()) break;
  processIncomingRequests();
}
```

Dùng `continue` để nhảy sang lượt lặp kế tiếp:

```dart
for (int i = 0; i < candidates.length; i++) {
  var candidate = candidates[i];
  if (candidate.yearsExperience < 5) {
    continue;
  }
  candidate.interview();
}
```

Nếu bạn đang làm việc với một [`Iterable`][] như list hay set, cách viết ví dụ trên có thể
khác đi:

```dart
candidates
    .where((c) => c.yearsExperience >= 5)
    .forEach((c) => c.interview());
```

## Nhãn (Labels)

Nhãn (label) là một định danh theo sau bởi dấu hai chấm (`labelName:`) mà bạn có thể đặt
trước một câu lệnh để tạo ra một _câu lệnh có nhãn (labeled statement)_. Vòng lặp và
`switch case` thường được dùng làm câu lệnh có nhãn. Một câu lệnh có nhãn có thể được tham
chiếu về sau trong câu lệnh `break` hoặc `continue` như sau:

* `break labelName;`
  Kết thúc việc thực thi câu lệnh có nhãn đó. Điều này hữu ích khi bạn muốn thoát khỏi một
  vòng lặp ngoài cụ thể trong lúc đang ở bên trong vòng lặp lồng nhau.

* `continue labelName;`
  Bỏ qua phần còn lại của lượt lặp hiện tại của vòng lặp có nhãn đó và tiếp tục với lượt
  lặp kế tiếp.

Nhãn được dùng để quản lý luồng điều khiển. Chúng thường đi cùng vòng lặp và `switch case`,
cho phép bạn chỉ rõ mình muốn `break` hay `continue` ở câu lệnh nào, thay vì mặc định chỉ
tác động lên vòng lặp trong cùng.

### Nhãn trong vòng lặp `for` với `break`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `for` cùng câu lệnh
`break`:

```dart
outerLoop:
for (var i = 1; i <= 3; i++) {
  for (var j = 1; j <= 3; j++) {
    print('i = $i, j = $j');
    if (i == 2 && j == 2) {
      break outerLoop;
    }
  }
}
print('outerLoop exited');
```

Trong ví dụ trên, khi `i == 2` và `j == 2`, câu lệnh `break outerLoop;` dừng cả vòng lặp
trong lẫn vòng lặp ngoài. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 2, j = 2
outerLoop exited
```

### Nhãn trong vòng lặp `for` với `continue`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `for` cùng câu lệnh
`continue`:

```dart
outerLoop:
for (var i = 1; i <= 3; i++) {
  for (var j = 1; j <= 3; j++) {
    if (i == 2 && j == 2) {
      continue outerLoop;
    }
    print('i = $i, j = $j');
  }
}
```

Trong ví dụ trên, khi `i == 2` và `j == 2`, `continue outerLoop;` bỏ qua phần còn lại của
các lượt lặp với `i = 2` và chuyển sang `i = 3`. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 3, j = 1
i = 3, j = 2
i = 3, j = 3
```

### Nhãn trong vòng lặp `while` với `break`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `while` cùng câu lệnh
`break`:

```dart
var i = 1;

outerLoop:
while (i <= 3) {
  var j = 1;
  while (j <= 3) {
    print('i = $i, j = $j');
    if (i == 2 && j == 2) {
      break outerLoop;
    }
    j++;
  }
  i++;
}
print('outerLoop exited');
```

Trong ví dụ trên, chương trình thoát khỏi cả vòng lặp `while` trong lẫn ngoài khi `i == 2`
và `j == 2`. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 2, j = 2
outerLoop exited
```

### Nhãn trong vòng lặp `while` với `continue`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `while` cùng câu lệnh
`continue`:

```dart
var i = 1;

outerLoop:
while (i <= 3) {
  var j = 1;
  while (j <= 3) {
    if (i == 2 && j == 2) {
      i++;
      continue outerLoop;
    }
    print('i = $i, j = $j');
    j++;
  }
  i++;
}
```

Trong ví dụ trên, lượt lặp với `i = 2` và `j = 2` bị bỏ qua và vòng lặp chuyển thẳng sang
`i = 3`. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 3, j = 1
i = 3, j = 2
i = 3, j = 3
```

### Nhãn trong vòng lặp `do-while` với `break`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `do while` cùng câu
lệnh `break`:

```dart
var i = 1;

outerLoop:
do {
  var j = 1;
  do {
    print('i = $i, j = $j');
    if (i == 2 && j == 2) {
      break outerLoop;
    }
    j++;
  } while (j <= 3);
  i++;
} while (i <= 3);

print('outerLoop exited');
```

Trong ví dụ trên, chương trình thoát khỏi cả vòng lặp trong lẫn ngoài khi `i == 2` và
`j == 2`. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 2, j = 2
outerLoop exited
```

### Nhãn trong vòng lặp `do-while` với `continue`

Đoạn code sau minh họa cách dùng nhãn tên `outerLoop` trong vòng lặp `do while` cùng câu
lệnh `continue`:

```dart
var i = 1;

outerLoop:
do {
  var j = 1;
  do {
    if (i == 2 && j == 2) {
      i++;
      continue outerLoop;
    }
    print('i = $i, j = $j');
    j++;
  } while (j <= 3);
  i++;
} while (i <= 3);
```

Trong ví dụ trên, vòng lặp bỏ qua trường hợp `i = 2` và `j = 2` rồi chuyển thẳng sang
`i = 3`. Kết quả in ra là:

```plaintext
i = 1, j = 1
i = 1, j = 2
i = 1, j = 3
i = 2, j = 1
i = 3, j = 1
i = 3, j = 2
i = 3, j = 3
```

---

[Exceptions]: https://dart.dev/language/error-handling
[Branching]: https://dart.dev/language/branches
[iteration]: https://dart.dev/libraries/dart-core#iteration
[forEach()]: https://api.dart.dev/dart-core/Iterable/forEach.html
[`Iterable`]: https://api.dart.dev/dart-core/Iterable-class.html
[pattern]: https://dart.dev/language/patterns

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
