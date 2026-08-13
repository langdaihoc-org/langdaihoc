-- Khung giờ hoạt động (JSON: [{ "from": "09:00", "to": "12:00" }, ...])
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "operating_windows" jsonb;
-- Giặt: giao lại sau giờ lấy tối thiểu (phút)
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "laundry_min_return_gap_minutes" integer DEFAULT 60 NOT NULL;
-- Ăn uống: khoảng Từ→Đến tối thiểu khi chọn giờ giao (phút)
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "min_delivery_window_minutes" integer DEFAULT 30 NOT NULL;
