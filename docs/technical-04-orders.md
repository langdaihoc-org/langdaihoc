# 04 — Nghiệp vụ đơn hàng & thanh toán

> [Mục lục](./technical-overview.md) · Nguồn FSM: `packages/shared/src/utils.ts`

Hai lớp kiểm tra mỗi lần `PATCH /status`:

1. **Cạnh hợp lệ?** `canTransitionFood|Laundry|ShipProxy(from, to)`
2. **Ai được bấm?** `canActorTransition(type, from, to, actor)` — actor = buyer | seller | admin

Admin gần như luôn được phép trên cạnh đã map. Trạng thái kết thúc (`completed`, `cancelled`, `rejected`) không đi tiếp.

---

## 4.1. Food

### Luồng

```text
pending
  ├─→ accepted → preparing → delivering → completed
  ├─→ rejected
  └─→ cancelled
accepted → cancelled (seller/admin)
preparing → cancelled (seller/admin)
```

### Ai bấm

| Cạnh | Actors |
|------|--------|
| pending → accepted / rejected | seller, admin |
| pending → cancelled | buyer, seller, admin |
| accepted → preparing | seller, admin |
| accepted → cancelled | seller, admin (**buyer không**) |
| preparing → delivering / cancelled | seller, admin |
| delivering → completed | buyer, seller, admin |

### Tạo đơn

- Từ giỏ; 1 seller; options snapshot.
- Body: `addressId`, `phone`, `paymentMethod`, `desiredDeliveryAt`, `desiredDeliveryUntil?`, `notes`, idempotency.
- Nếu thiếu `until` → API mặc định +`minDeliveryWindowMinutes`.
- Server từ chối nếu cửa sổ ngắn hơn min → `INVALID_DELIVERY_WINDOW`.
- Server từ chối nếu cửa sổ không nằm trong `operatingWindows` → `OUTSIDE_OPERATING_HOURS`.

### Khác

- `POST .../late-delivery-warning`: food, chưa closed, trong cửa sổ 10 phút trước giờ giao, chỉ 1 lần/đơn.
- `POST .../mark-paid`: seller đánh dấu đã thu tiền (cash) khi đang giao / trả đồ — **bắt buộc trước khi `completed`**.

---

## 4.2. Laundry

### Luồng

```text
pending → accepted → picking_up → picked_up
  → waiting_price_confirmation → washing → returning → completed
                              ↘ cancelled (buyer/admin)
                              ↘ needs_support → washing (admin) | cancelled (buyer/admin)
```

### Ai bấm

| Cạnh | Actors |
|------|--------|
| pending → accepted | seller, admin |
| pending → cancelled | buyer, seller, admin |
| accepted → picking_up / cancelled | seller, admin |
| picking_up → picked_up | seller, admin |
| picked_up → waiting_price_confirmation | seller, admin (thường qua **laundry-quote**) |
| waiting → washing | buyer, seller*, admin (*seller khi autoConfirm) |
| waiting → cancelled | buyer, admin |
| waiting → needs_support | buyer, seller, admin |
| washing → returning | seller, admin |
| returning → completed | buyer, seller, admin |
| needs_support → washing | **admin only** |
| needs_support → cancelled | buyer, admin |

### Tạo đơn

- `serviceId`, `pickupScheduledAt`, `returnScheduledAt?`, địa chỉ lấy/trả, `phone`, `paymentMethod`, `autoConfirmQuote?`, `estimatedQty` (mặc định 1), idempotency.
- Gap trả ≥ `laundryMinReturnGapMinutes` (default 60) → không thì `INVALID_TIME_RANGE`.
- Pickup/return HH:mm (Asia/Ho_Chi_Minh) phải trong `operatingWindows` → không thì `OUTSIDE_OPERATING_HOURS`.

### Báo giá

`POST /api/orders/:id/laundry-quote` (seller):

- `finalPrice` **hoặc** `actualQty` + `unitPrice` (+ `surcharge`).
- Cập nhật `laundry_order_details` + `orders.subtotal/total`.
- Trong 1 transaction: chuyển → `waiting_price_confirmation`; nếu `autoConfirmQuote` → tiếp `washing` + ghi `buyerPriceConfirmedAt`.

Buyer:

- `confirm-price` → washing  
- `reject-price` → cancelled  

---

## 4.3. Ship proxy

### Luồng

```text
pending → accepted → preparing → picked_up → delivering → completed
       ↘ rejected | cancelled
```

### Ai bấm

Giống food ở đoạn đầu; thêm:

| Cạnh | Actors |
|------|--------|
| preparing → picked_up / cancelled | seller, admin |
| picked_up → delivering | seller, admin |
| delivering → completed | buyer, seller, admin |

### Tạo đơn

- `sellerId`, `trackingCode`, `pickupLocation`, `pickupAt`, `receivePhone`, `returnAt`, `returnAddressText`, `contactPhone`, `packageValue`, `notes?`, idempotency.
- **Payment method luôn bank_transfer** (API/UI).
- `total = packageValue + fee` (`sellers.shipProxyFeeVnd` hoặc constant shared fallback).
- Return ≥ pickup + gap ship (code: 30 phút trong commerce).

### Thanh toán bắt buộc trước preparing

1. Seller **accepted**.
2. Buyer `payment-proof` (URL private đã upload) — không gửi khi còn `pending` (`WAIT_SELLER_ACCEPT`).
3. Seller `verify-payment` `{ approved: true|false }`.
4. Không có proof → verify lỗi `NO_PAYMENT_PROOF`.
5. Chưa verified → `preparing` → `PAYMENT_REQUIRED`.

---

## 4.4. Thanh toán (chung)

### Method

| Value | Dùng |
|-------|------|
| `cash` | Food/laundry — trả khi nhận |
| `bank_transfer` | CK + biên lai; ship bắt buộc |

### Payment status

`unpaid` → `pending` → `proof_uploaded` → `verified` | `rejected` | `paid`

### Proof

- Upload: buyer `POST /api/buyer/upload` (bucket private payment-proofs).
- Gắn đơn: `POST /api/orders/:id/payment-proof` `{ imageUrl }` — assert URL thuộc user/order + object tồn tại.
- Seller verify cập nhật `orders.paymentStatus` + hàng `payment_proofs` (optimistic `version`).

---

## 4.5. Review & khiếu nại

- Review: chỉ đơn `completed`; 1 review/đơn; chỉnh qua PATCH.
- Complaint: unique theo `orderId`; buyer mở + message; escalate → admin; seller resolve nếu chưa escalate admin; thread messages.

---

## 4.6. Mã lỗi thường gặp (đơn)

| Code | Ý |
|------|---|
| `IDEMPOTENCY_KEY_REQUIRED` | Thiếu key |
| `EMPTY_CART` / `ITEM_UNAVAILABLE` / `OPTIONS_STALE` | Giỏ |
| `OPTIONS_REQUIRED` / `OPTIONS_MIN` / `OPTIONS_MAX` | Option món |
| `INVALID_DELIVERY_WINDOW` | Khung giao food quá ngắn |
| `OUTSIDE_OPERATING_HOURS` | Ngoài giờ quán |
| `INVALID_TIME_RANGE` | Gap laundry/ship |
| `INVALID_TRANSITION` / `FORBIDDEN_TRANSITION` | Sai bước / sai người |
| `PAYMENT_REQUIRED` | Ship chưa verify CK; hoặc hoàn thành khi chưa `paid`/`verified` (cash lẫn CK) |
| `NO_PAYMENT_PROOF` | Chưa có biên lai |
| `WAIT_SELLER_ACCEPT` | Gửi proof quá sớm |
| `SELLER_UNAVAILABLE` | Shop chưa approve / đóng nhận đơn |

Tiếp: [05 — Database](./technical-05-database.md)
