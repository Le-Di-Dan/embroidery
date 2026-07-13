# FIGMA_ARCHITECTURE.md

Version: 1.0

Status: Approved Architecture

Depends on:

* DESIGN_VISION.md
* DESIGN_SYSTEM_FOUNDATION.md

---

# 1. Purpose

Tài liệu này định nghĩa kiến trúc Figma của toàn bộ hệ thống.

Mục tiêu:

* Chuẩn hóa cách tổ chức file.
* Chuẩn hóa token.
* Chuẩn hóa component.
* Đảm bảo khả năng mở rộng lâu dài.
* Đảm bảo mọi màn hình đều được xây dựng từ một nguồn thiết kế duy nhất.

---

# 2. Design System Structure

Toàn bộ Design System được chia thành 5 tầng.

```text
Foundation
↓
Tokens
↓
Primitives
↓
Components
↓
Patterns
```

---

# 3. File Structure

## DS / Foundations

Chứa:

* Colors
* Typography
* Spacing
* Radius
* Elevation
* Motion

---

## DS / Components

Chứa:

* Base Components
* Composite Components

---

## DS / Patterns

Chứa:

* Gallery Layout
* Collection Layout
* Artwork Layout
* Form Layout

---

## Product Screens

Chứa màn hình thực tế.

Không tạo component mới tại đây.

---

# 4. Variable Architecture

## Philosophy

Tuyệt đối không sử dụng giá trị hardcode trong component.

Mọi component phải sử dụng variable.

---

# 5. Token Layers

## Primitive Tokens

Token gốc.

Ví dụ:

```text
Gray 50
Gray 100
Gray 200

Rose 500
Rose 600
Rose 700
```

---

## Semantic Tokens

Token sử dụng trong UI.

Ví dụ:

```text
Background / Primary

Background / Secondary

Text / Primary

Text / Secondary

Border / Primary

Border / Secondary

Action / Primary

Action / Hover
```

---

Component chỉ được dùng Semantic Token.

Không được dùng Primitive Token trực tiếp.

---

# 6. Color Variable Structure

## Background

```text
Background / Primary
Background / Secondary
Background / Surface
Background / Elevated
```

---

## Text

```text
Text / Primary
Text / Secondary
Text / Tertiary
Text / Inverse
```

---

## Border

```text
Border / Primary
Border / Secondary
Border / Strong
```

---

## Action

```text
Action / Primary
Action / Hover
Action / Active
Action / Disabled
```

---

## Status

```text
Success
Warning
Error
Info
```

---

# 7. Typography Variable Structure

## Display

```text
Display / XL
Display / L
Display / M
```

---

## Heading

```text
Heading / XL
Heading / L
Heading / M
Heading / S
```

---

## Body

```text
Body / L
Body / M
Body / S
```

---

## Caption

```text
Caption
```

---

# 8. Spacing Variables

```text
Space / 4
Space / 8
Space / 12
Space / 16
Space / 24
Space / 32
Space / 48
Space / 64
Space / 96
Space / 128
```

Không được tạo spacing mới ngoài hệ thống.

---

# 9. Radius Variables

```text
Radius / XS
Radius / SM
Radius / MD
Radius / LG
Radius / XL
```

---

# 10. Elevation Variables

```text
Elevation / None
Elevation / Floating
Elevation / Modal
```

---

# 11. Component Taxonomy

## Foundation Components

```text
Button
Input
Textarea
Select
Badge
Chip
Tag
Avatar
```

---

## Gallery Components

```text
ArtworkCard
ArtworkImage
ArtworkMeta
ArtworkTag
CollectionCard
```

---

## Navigation Components

```text
Navbar
NavLink
SearchBar
MobileMenu
```

---

## Layout Components

```text
Container
Section
Grid
MasonryFeed
Sidebar
```

---

## Overlay Components

```text
Modal
Drawer
Tooltip
Toast
```

---

# 12. Component Naming Convention

Format:

```text
Category / Component / Variant / State
```

Ví dụ:

```text
Button / Primary / Default

Button / Primary / Hover

Button / Secondary / Default

ArtworkCard / Default

ArtworkCard / Featured
```

---

# 13. Variant Strategy

Không tạo component mới cho từng trường hợp.

Sử dụng Variant.

Ví dụ:

```text
ArtworkCard

Variants:

Default
Featured
Compact
Minimal
```

---

# 14. Auto Layout Rules

Tất cả component phải sử dụng Auto Layout.

Không sử dụng positioning thủ công nếu có thể tránh được.

---

Padding phải lấy từ spacing token.

---

Gap phải lấy từ spacing token.

---

# 15. Responsive Architecture

## Desktop

1440 Frame

---

## Tablet

1024 Frame

---

## Mobile

390 Frame

---

Mọi component phải được kiểm tra trên cả 3 breakpoint.

---

# 16. Masonry Architecture

## Philosophy

Masonry là thành phần trung tâm của sản phẩm.

---

Không xây dựng Gallery bằng:

```text
Grid cố định
```

---

Phải hỗ trợ:

```text
Variable Height
Variable Aspect Ratio
```

---

Artwork không được crop phá vỡ bố cục.

---

# 17. Artwork Card Architecture

Artwork Card là component quan trọng nhất hệ thống.

---

Structure

```text
ArtworkCard
 ├─ Image
 ├─ Title
 ├─ Category
 └─ Optional Meta
```

---

Image chiếm ưu tiên cao nhất.

---

Metadata luôn tối giản.

---

# 18. Page Pattern Library

## Homepage

Pattern:

```text
Hero
↓
Masonry Feed
↓
Collections
↓
Story
```

---

## Collection

Pattern:

```text
Collection Hero
↓
Masonry Feed
```

---

## Artwork Detail

Pattern:

```text
Artwork Hero
↓
Story
↓
Materials
↓
Related Works
```

---

## Order

Pattern:

```text
Artwork
↓
Requirements
↓
Confirmation
```

---

# 19. Figma Governance Rules

Không tạo màu mới ngoài token.

Không tạo spacing mới ngoài token.

Không tạo typography style mới ngoài token.

Không tạo component duplicate.

Không detach component nếu không có lý do chính đáng.

---

# 20. Definition of Done

Một màn hình chỉ được xem là hoàn thành khi:

* Không chứa màu hardcode.
* Không chứa spacing hardcode.
* Không chứa typography hardcode.
* Chỉ sử dụng component từ Design System.
* Responsive đầy đủ.
* Tuân thủ Design Vision.
* Tuân thủ Design System Foundation.
