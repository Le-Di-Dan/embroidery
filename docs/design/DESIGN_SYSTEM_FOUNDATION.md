# DESIGN_SYSTEM_FOUNDATION.md

Version: 1.0

Status: Approved Foundation

Depends on: DESIGN_VISION.md

---

# 1. Purpose

Tài liệu này định nghĩa các nguyên tắc thiết kế nền tảng cho toàn bộ hệ thống.

Mục tiêu:

* Tạo sự nhất quán giữa tất cả màn hình.
* Đảm bảo mọi quyết định UI đều tuân thủ Design Vision.
* Cho phép mở rộng hệ thống trong nhiều năm mà không đánh mất bản sắc thương hiệu.

Tài liệu này không mô tả wireframe hay màn hình cụ thể.

Tài liệu này mô tả những quy tắc nền tảng tạo nên giao diện.

---

# 2. Design Principles

## Artwork First

Artwork luôn là trung tâm.

UI chỉ là khung trưng bày tác phẩm.

Mọi quyết định thiết kế phải ưu tiên khả năng trình bày tác phẩm hơn khả năng phô diễn UI.

---

## Discovery First

Người dùng đến để tìm cảm hứng.

Thiết kế phải khuyến khích hành vi khám phá.

Không tối ưu theo mô hình thương mại điện tử truyền thống.

---

## Visual Before Text

Hình ảnh có độ ưu tiên cao hơn văn bản.

Người dùng phải thấy artwork trước khi đọc mô tả.

---

## Quiet Interface

Giao diện phải yên tĩnh.

Không cạnh tranh sự chú ý với tác phẩm.

Không sử dụng hiệu ứng gây phân tâm.

---

## Contemporary Luxury

Luxury hiện đại.

Không cổ điển.

Không hào nhoáng.

Không phô trương.

Luxury đến từ:

* khoảng trắng
* chất lượng hình ảnh
* typography
* sự tinh tế

---

# 3. Brand Attributes

Các từ khóa mô tả thương hiệu:

* Contemporary
* Artistic
* Premium
* Personalized
* Minimal
* Young
* Creative

Không sử dụng các đặc tính:

* Traditional Luxury
* Corporate
* Marketplace
* Discount Driven
* Mass Market

---

# 4. Color System

## Philosophy

Artwork là nguồn màu sắc chính.

Hệ thống UI sử dụng bảng màu trung tính.

---

## Background

Background Primary

#FAF8F5

Background Secondary

#F5F3EF

---

## Surface

Surface Primary

#FFFFFF

Surface Secondary

#FCFBF8

---

## Text

Text Primary

#171717

Text Secondary

#6B7280

Text Tertiary

#9CA3AF

---

## Border

Border Primary

#E7E5E4

Border Secondary

#D6D3D1

---

## Accent

Brand Primary

#E8475F

Brand Hover

#D73850

Brand Active

#C92E45

---

## Semantic

Success

#16A34A

Warning

#D97706

Error

#DC2626

Info

#2563EB

---

# 5. Typography System

## Philosophy

Typography hiện đại.

Không sử dụng typography luxury cổ điển.

Không sử dụng serif làm heading mặc định.

---

## Primary Font

General Sans

Fallback

Inter

---

## Secondary Font

Inter

---

## Scale

Display XL

72px

Display L

64px

Display M

56px

Heading XL

48px

Heading L

40px

Heading M

32px

Heading S

24px

Body L

18px

Body M

16px

Body S

14px

Caption

12px

---

## Font Weight

Regular

400

Medium

500

Semibold

600

Bold

700

---

# 6. Spacing System

## Base Unit

4px

---

## Approved Scale

4
8
12
16
24
32
48
64
96
128

---

## Usage

Card Padding

24px

Section Gap

96px

Large Section Gap

128px

Page Padding Desktop

64px

Page Padding Mobile

24px

---

# 7. Radius System

## Philosophy

Mềm mại nhưng không playful.

---

XS

8px

SM

12px

MD

16px

LG

24px

XL

32px

---

Default Card Radius

24px

Default Input Radius

16px

Default Button Radius

16px

---

# 8. Elevation System

## Philosophy

Sử dụng border thay vì shadow.

---

Level 0

No Shadow

Border Only

---

Level 1

Subtle Shadow

Chỉ sử dụng cho:

* Floating Menu
* Dropdown
* Tooltip

---

Level 2

Modal Only

---

Không sử dụng shadow cho:

* Artwork Card
* Collection Card
* Gallery Feed

---

# 9. Motion System

## Philosophy

Motion phải tự nhiên.

Không gây chú ý.

---

Fast

150ms

Normal

200ms

Slow

300ms

---

Easing

ease-out

---

Allowed Motions

Fade

Scale 0.98 → 1

Opacity

Subtle Parallax

---

Rejected Motions

Bounce

Elastic

Shake

Large Zoom

Auto Carousel

---

# 10. Grid System

## Desktop

12 Columns

Container Width

1440px

Content Width

1280px

---

## Tablet

8 Columns

---

## Mobile

4 Columns

---

# 11. Layout System

## Philosophy

Khoảng trắng là thành phần thiết kế.

Không cố gắng lấp đầy màn hình.

---

Maximum Reading Width

720px

---

Maximum Content Width

1280px

---

Artwork Feed

Masonry Layout

---

List View

Secondary Only

---

# 12. Component Hierarchy

## Tier 1 Components

Đây là các component quan trọng nhất.

Artwork Card

Masonry Feed

Artwork Detail

Collection Hero

Gallery Section

---

## Tier 2 Components

Button

Input

Textarea

Dropdown

Modal

Badge

---

## Tier 3 Components

Tooltip

Skeleton

Pagination

Toast

---

# 13. Artwork Card Rules

Artwork Card là component trung tâm của toàn hệ thống.

---

Artwork Card phải ưu tiên:

* hình ảnh lớn
* title ngắn
* metadata tối thiểu

---

Artwork Card không hiển thị:

* SKU
* Product Code
* Flash Sale
* Discount Badge
* Countdown
* Marketplace Signals

---

# 14. CTA Philosophy

CTA phải mang tính hướng dẫn.

Không mang tính ép buộc.

---

Preferred

Khám phá thêm

Đặt thiết kế tương tự

Bắt đầu dự án

Yêu cầu tư vấn

Xem bộ sưu tập

---

Avoid

Mua ngay

Chốt đơn

Deal sốc

Flash Sale

---

# 15. Accessibility

Minimum Contrast

WCAG AA

---

Minimum Click Area

44x44px

---

Keyboard Navigation

Required

---

Visible Focus State

Required

---

# 16. Responsive Philosophy

Mobile First

---

Masonry phải tồn tại trên mọi thiết bị.

---

Desktop

4–6 Columns

Tablet

2–4 Columns

Mobile

2 Columns

---

# 17. Explicitly Rejected Patterns

Không sử dụng:

* Mega Menu
* Auto Carousel
* Flash Sale Banner
* Voucher Popup
* Lucky Wheel
* Notification Spam
* Marketplace Style Card
* Shopee Style Layout
* Lazada Style Layout

---

# 18. Foundation Rule

Nếu một quyết định thiết kế mâu thuẫn với Design Vision hoặc Design System Foundation, quyết định đó phải bị từ chối.

Design Vision luôn có độ ưu tiên cao nhất.
