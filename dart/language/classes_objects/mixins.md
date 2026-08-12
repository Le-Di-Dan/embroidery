# Mixins

> **Nguồn gốc:** <https://dart.dev/language/mixins> — *Mixins*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Extend a class (Kế thừa lớp)](https://dart.dev/language/extend) · → [Enums](https://dart.dev/language/enums)

Mixin là cách định nghĩa code có thể tái sử dụng trong nhiều cây phân cấp lớp khác nhau.
Chúng sinh ra để cung cấp phần hiện thực của các thành viên theo lô (en masse).

Để dùng mixin, hãy dùng từ khóa `with` theo sau là một hoặc nhiều tên mixin. Ví dụ sau cho
thấy hai lớp có dùng (hay nói cách khác, là lớp con của) mixin:

```dart
class Musician extends Performer with Musical {
  // ···
}

class Maestro extends Person with Musical, Aggressive, Demented {
  Maestro(String maestroName) {
    name = maestroName;
    canConduct = true;
  }
}
```

Để định nghĩa một mixin, hãy dùng khai báo `mixin`. Trong trường hợp hiếm gặp khi bạn cần
định nghĩa **cả** mixin _lẫn_ class, bạn có thể dùng
[khai báo `mixin class`](#class-mixin-hay-mixin-class).

Mixin và mixin class **không** được có mệnh đề `extends`, và **không** được khai báo bất kỳ
generative constructor nào.

Ví dụ:

```dart
mixin Musical {
  bool canPlayPiano = false;
  bool canCompose = false;
  bool canConduct = false;

  void entertainMe() {
    if (canPlayPiano) {
      print('Playing piano');
    } else if (canConduct) {
      print('Waving hands');
    } else {
      print('Humming to self');
    }
  }
}
```

## Chỉ định những thành viên mà mixin có thể gọi trên chính nó

Đôi khi mixin phụ thuộc vào khả năng gọi một phương thức hoặc truy cập một trường, nhưng
bản thân nó lại không định nghĩa được những thành viên đó (vì mixin không thể dùng tham số
constructor để khởi tạo trường của chính mình).

Các mục sau trình bày những chiến lược khác nhau để đảm bảo mọi lớp con của một mixin đều
định nghĩa những thành viên mà hành vi của mixin phụ thuộc vào.

### Định nghĩa thành viên trừu tượng trong mixin

Việc khai báo một phương thức trừu tượng trong mixin buộc mọi kiểu dùng mixin đó phải định
nghĩa phương thức trừu tượng mà hành vi của nó phụ thuộc vào.

```dart
mixin Musician {
  void playInstrument(String instrumentName); // Abstract method.

  void playPiano() {
    playInstrument('Piano');
  }
  void playFlute() {
    playInstrument('Flute');
  }
}

class Virtuoso with Musician {

  @override
  void playInstrument(String instrumentName) { // Subclass must define.
    print('Plays the $instrumentName beautifully');
  }
}
```

> *Diễn giải:* `playInstrument` là phương thức trừu tượng; lớp con **bắt buộc** phải định
> nghĩa nó.

#### Truy cập trạng thái trong lớp con của mixin

Việc khai báo thành viên trừu tượng cũng cho phép bạn truy cập trạng thái nằm trên lớp con
của mixin, bằng cách gọi những getter được khai báo là trừu tượng trên mixin:

```dart
/// Can be applied to any type with a [name] property and provides an
/// implementation of [hashCode] and operator `==` in terms of it.
mixin NameIdentity {
  String get name;

  @override
  int get hashCode => name.hashCode;

  @override
  bool operator ==(other) => other is NameIdentity && name == other.name;
}

class Person with NameIdentity {
  final String name;

  Person(this.name);
}
```

> *Diễn giải doc comment:* mixin này áp dụng được cho mọi kiểu có thuộc tính `[name]`, và
> cung cấp phần hiện thực của `[hashCode]` cùng toán tử `==` dựa trên thuộc tính đó.

### Hiện thực một interface

Tương tự cách khai báo thành viên trừu tượng, việc đặt mệnh đề `implements` lên mixin mà
thực tế không hiện thực interface đó cũng đảm bảo mọi thành viên mà mixin phụ thuộc đều
được định nghĩa.

```dart
abstract interface class Tuner {
  void tuneInstrument();
}

mixin Guitarist implements Tuner {
  void playSong() {
    tuneInstrument();

    print('Strums guitar majestically.');
  }
}

class PunkRocker with Guitarist {

  @override
  void tuneInstrument() {
    print("Don't bother, being out of tune is punk rock.");
  }
}
```

### Dùng mệnh đề `on` để khai báo lớp cha

Mệnh đề `on` tồn tại để xác định kiểu mà các lời gọi `super` sẽ được phân giải dựa vào đó.
Vì vậy, bạn chỉ nên dùng nó khi bạn cần có một lời gọi `super` bên trong mixin.

Mệnh đề `on` buộc mọi lớp dùng mixin cũng phải là lớp con của kiểu nêu trong mệnh đề `on`.
Nếu mixin phụ thuộc vào các thành viên nằm ở lớp cha, điều này đảm bảo những thành viên đó
luôn có sẵn ở nơi mixin được dùng:

```dart
class Musician {
  musicianMethod() {
    print('Playing music!');
  }
}

mixin MusicalPerformer on Musician {
  performerMethod() {
    print('Performing music!');
    super.musicianMethod();
  }
}

class SingerDancer extends Musician with MusicalPerformer { }

main() {
  SingerDancer().performerMethod();
}
```

Trong ví dụ này, chỉ những lớp kế thừa hoặc hiện thực lớp `Musician` mới dùng được mixin
`MusicalPerformer`. Vì `SingerDancer` kế thừa `Musician`, nên `SingerDancer` mix được
`MusicalPerformer` vào.

<a id="class-mixin-or-mixin-class"></a>

## `class`, `mixin`, hay `mixin class`?

> **Lưu ý về phiên bản**
> Khai báo `mixin class` yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.0.

Khai báo `mixin` định nghĩa một mixin. Khai báo `class` định nghĩa một [lớp][class]. Khai
báo `mixin class` định nghĩa một lớp dùng được vừa như lớp thông thường, vừa như mixin —
với cùng tên và cùng kiểu.

```dart
mixin class Musician {
  // ...
}

class Novice with Musician { // Use Musician as a mixin
  // ...
}

class Novice extends Musician { // Use Musician as a class
  // ...
}
```

> *Diễn giải:* dòng đầu dùng `Musician` như một mixin; dòng sau dùng `Musician` như một
> lớp.

Mọi hạn chế áp dụng cho class hoặc mixin thì cũng áp dụng cho mixin class:

- Mixin không được có mệnh đề `extends` hay `with`, nên `mixin class` cũng vậy.
- Class không được có mệnh đề `on`, nên `mixin class` cũng vậy.

---

[language version]: https://dart.dev/language/versioning
[class]: https://dart.dev/language/classes
[class modifiers]: https://dart.dev/language/class-modifiers

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
