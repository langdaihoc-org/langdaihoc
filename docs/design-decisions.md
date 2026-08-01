# Quyết định thiết kế — Làng Đại Học (local)

> Nguồn: `LangDaiHoc_DacTa_Web.docx` v1.0. Khi mâu thuẫn với prototype `code-completion`, **ưu tiên đặc tả**.

## 1. Design tokens (đã chốt)

| Token | Giá trị | Ghi chú |
|-------|---------|---------|
| Primary Food | `#EB7529` | CTA đồ ăn, badge nổi bật |
| Primary Laundry | `#268259` | Giặt đồ, hoàn tất |
| Background | `#FFF8F0` | Nền buyer app |
| Text | `#212529` | Nội dung chính |
| Muted | `#596069` | Phụ, placeholder |
| Radius | `16–24px` | Card, modal, input |
| Shadow | Mềm, contrast thấp | Card, floating nav |

**Lý do:** Đồng bộ brand sinh viên (cam ấm + xanh lá), dễ phân biệt hai dịch vụ trên cùng một app.

## 2. Layout theo vai trò

| Vai trò | Navigation | Route prefix |
|---------|------------|--------------|
| Guest/Buyer | Header + bottom nav 5 mục | `/`, `/food`, `/laundry`, `/orders`, `/profile` |
| Seller | Sidebar (desktop) / scroll nav (mobile) | `/seller/*` |
| Admin | Sidebar | `/admin/*` |

**Lý do:** Tách layout tuyệt đối — seller/admin không thấy buyer nav; buyer không vào dashboard seller.

## 3. Trang chủ Buyer — hybrid (được chọn)

Đặc tả yêu cầu: hero (logo, slogan, search, banner) + quick actions.

**Cách làm:**
1. **Hero strip** — slogan + ô tìm kiếm full-width (mobile-first).
2. **Banner carousel** — strip ngang từ API admin (`isPopup=false`).
3. **Popup quảng cáo tùy chọn** — banner `isPopup=true`, hiện tối đa 1 lần/ngày (`localStorage`).
4. **Quick actions** — Đồ ăn / Giặt đồ / Ship hộ.
5. **Quick action "Đơn đang xử lý"** — hiện khi buyer đã đăng nhập và có đơn active.
6. **Tab Khám phá (`/explore`)** — feed lướt bài quán; caption dài/ngắn do seller tự viết; CTA **Vào quán** (không chốt đơn trong feed).
7. **Laundry preview** — card có ảnh giống food grid (đặc tả §6.2).

**Feed ≠ nhóm Facebook:** chỉ khám phá → vào quán đặt hàng.

## 4. Component bắt buộc — lộ trình

| Component | Trạng thái | Ghi chú |
|-----------|------------|---------|
| FoodCard | ✅ | `FoodGridCard`, `MenuItemRow` |
| LaundryCard | ✅ (mới) | `LaundryCard` |
| ProductConfiguratorModal | ✅ | `FoodItemSheet` |
| TimePicker | ✅ | `DeliveryTimePicker` (slot 10 phút) |
| OrderTimeline | ✅ | `OrderTimeline` |
| ImageUploader | ⏳ L6 | URL trước, Storage sau |
| EmptyState | ✅ | `EmptyState` |
| Skeleton | ✅ (mới) | Loading theo vùng |
| Toast | ✅ (mới) | Thay `alert()` |
| ConfirmDialog | ⏳ L4 | Cart conflict đang inline |
| PromoPopup | ✅ | Popup banner kiểu Shopee |
| BannerCarousel | ✅ | Auto-slide + dots |
| FeedPostCard / HomeFeed | ✅ | Feed marketplace |

## 5. Kiến trúc frontend

- **Giữ** cấu trúc hiện tại (`pages/`, `components/`, `lib/api.ts`) — đã chạy được.
- **Không** tạo app Next.js thứ hai từ `code-completion`.
- **Dần refactor** sang `features/*` ở phase L3+ nếu file > 300 dòng.

## 6. Phase hiện tại

Đã bổ sung **popup banner + feed posts** (admin/seller CMS, catalog API, home + `/p/:id`).
Tiếp tục polish L1 design system khi cần.
