# Phiên bản ngôn ngữ (Language versioning)

> **Nguồn gốc:** <https://dart.dev/language/versioning> — *Language versioning*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12

## Tổng quan

Một Dart SDK duy nhất có thể hỗ trợ đồng thời nhiều phiên bản của ngôn ngữ Dart. Trình biên
dịch xác định code đang nhắm tới phiên bản nào, rồi diễn giải code theo đúng phiên bản đó.

Phiên bản ngôn ngữ trở nên quan trọng trong những dịp hiếm hoi khi Dart giới thiệu một tính
năng không tương thích ngược, chẳng hạn [null safety][]. Khi Dart đưa ra một thay đổi phá vỡ
tương thích, đoạn code vốn biên dịch được có thể không còn biên dịch được nữa. Cơ chế phiên
bản ngôn ngữ cho phép bạn đặt phiên bản ngôn ngữ cho từng thư viện để duy trì tính tương
thích.

Trong trường hợp null safety, các Dart SDK từ 2.12 đến 2.19 cho phép bạn _tự chọn_ cập nhật
code của mình để dùng null safety. Dart dùng cơ chế phiên bản ngôn ngữ để cho phép code chưa
null-safe chạy song song cùng code đã null-safe. Quyết định này giúp cho việc chuyển đổi từ
code chưa null-safe sang code null-safe khả thi. Để xem ví dụ về cách một ứng dụng hay
package chuyển đổi sang phiên bản ngôn ngữ mới có tính năng không tương thích, hãy xem bài
viết [Gradual null safety migration for large Dart projects][].

Mỗi package có một phiên bản ngôn ngữ mặc định bằng với **cận dưới** của
[ràng buộc SDK][SDK constraint] trong file `pubspec.yaml`.

**Ví dụ:** Mục sau trong file `pubspec.yaml` cho biết package này mặc định dùng phiên bản
ngôn ngữ Dart 2.18.

```yaml
environment:
  sdk: '>=2.18.0 <3.0.0'
```

Để tìm hiểu đội ngũ Dart đã phát triển phương pháp đánh phiên bản này như thế nào và vì
sao, xem [đặc tả về language versioning][language versioning specification].

[null safety]: https://dart.dev/null-safety
[Gradual null safety migration for large Dart projects]: https://dart.dev/blog/gradual-null-safety-migration-for-large-dart-projects
[SDK constraint]: https://dart.dev/tools/pub/pubspec#sdk-constraints
[language versioning specification]: https://github.com/dart-lang/language/blob/main/accepted/2.8/language-versioning/feature-specification.md#dart-language-versioning

## Số hiệu phiên bản ngôn ngữ

Dart định dạng phiên bản ngôn ngữ của mình thành hai con số ngăn cách bởi dấu chấm. Chúng
được hiểu là số phiên bản major và số phiên bản minor. Số phiên bản minor **có thể** mang
theo những thay đổi phá vỡ tương thích.

Các bản phát hành Dart có thể thêm một số patch vào sau phiên bản ngôn ngữ. Bản patch không
được thay đổi ngôn ngữ, ngoại trừ việc sửa lỗi. Minh họa: Dart 2.18.3 là bản phát hành mới
nhất của phiên bản ngôn ngữ Dart 2.18 SDK.

Mỗi bản phát hành Dart SDK hỗ trợ phiên bản ngôn ngữ của chính nó và **tất cả** các phiên
bản trước đó trong cùng số phiên bản major. Nghĩa là Dart SDK 2.18.3 hỗ trợ các phiên bản
ngôn ngữ từ 2.0 đến 2.18, nhưng không hỗ trợ Dart 1.x.

Việc suy ra phiên bản ngôn ngữ từ phiên bản SDK kéo theo những điều sau:

* Mỗi khi một phiên bản minor của SDK được phát hành, một phiên bản ngôn ngữ mới xuất hiện.
  Trên thực tế, nhiều phiên bản ngôn ngữ trong số đó hoạt động rất giống các phiên bản
  trước và tương thích hoàn toàn với nhau. Ví dụ: ngôn ngữ Dart 2.9 hoạt động gần như y hệt
  ngôn ngữ Dart 2.8.

* Khi một bản patch của SDK được phát hành, nó **không** thể mang theo tính năng ngôn ngữ
  mới. Ví dụ: bản 2.18.3 _vẫn là_ phiên bản ngôn ngữ 2.18. Nó phải giữ tương thích với
  2.18.2, 2.18.1 và 2.18.0.

<a id="library-override"></a>

## Chọn phiên bản ngôn ngữ riêng cho từng thư viện

Mặc định, mọi file Dart trong một package đều dùng cùng một phiên bản ngôn ngữ. Dart xác
định phiên bản ngôn ngữ mặc định là cận dưới của ràng buộc SDK được khai báo trong file
`pubspec.yaml`. Đôi khi, một file Dart có thể cần dùng phiên bản ngôn ngữ cũ hơn. Ví dụ, có
thể bạn không thể chuyển đổi mọi file trong package sang null safety cùng một lúc.

Dart hỗ trợ việc chọn phiên bản ngôn ngữ riêng cho từng thư viện. Để chọn một phiên bản ngôn
ngữ khác với phần còn lại của package, một [thư viện Dart][Dart library] phải chứa một
comment theo định dạng sau:

```dart
// @dart = <major>.<minor>
```

Ví dụ:

```dart
// Description of what's in this file.
// @dart = 2.17
import 'dart:math';

// ...
```

> *Diễn giải:* dòng đầu là mô tả nội dung file; dòng thứ hai khai báo phiên bản ngôn ngữ.

Chuỗi `@dart` phải nằm trong một comment dạng `//` (không phải `///` hay `/*`), và nó phải
xuất hiện **trước** mọi code Dart trong file. Khoảng trắng (tab và dấu cách) không quan
trọng, ngoại trừ bên trong chuỗi `@dart` và chuỗi phiên bản. Như ví dụ trên cho thấy, các
comment khác vẫn có thể xuất hiện trước comment `@dart`.

[Dart library]: https://dart.dev/tools/pub/create-packages#organizing-a-package

## Những thay đổi gắn với phiên bản ngôn ngữ

Cơ chế phiên bản ngôn ngữ giúp Dart và bộ công cụ của nó phát triển theo thời gian. Ngoài
những thay đổi về cú pháp và ngữ nghĩa có thể phá vỡ tương thích, các tính năng mới và thay
đổi trong công cụ cũng có thể được kiểm soát theo phiên bản ngôn ngữ. Ví dụ, `dart format`
có thể định dạng code Dart khác nhau tùy theo phiên bản ngôn ngữ của thư viện mà nó đang
định dạng.

Để biết mỗi phiên bản ngôn ngữ đã đưa vào những thay đổi gì, bạn có thể tham khảo
[changelog của Dart][Dart changelog] (có thể lọc được). Để tìm hiểu chi tiết cụ thể về từng
phiên bản ngôn ngữ và các tính năng của nó, xem
[tài liệu ngôn ngữ][language documentation] và [đặc tả ngôn ngữ][language specification].

> **Mẹo**
> Để theo dõi những tính năng và thay đổi mới của Dart đang được thảo luận, thiết kế và hiện
> thực, hãy xem dự án [Dart language funnel][] trên GitHub.

---

[Dart changelog]: https://dart.dev/changelog
[language documentation]: https://dart.dev/language
[language specification]: https://dart.dev/resources/language/spec
[Dart language funnel]: https://github.com/orgs/dart-lang/projects/90

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
