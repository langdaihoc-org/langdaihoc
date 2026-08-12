-- Cửa sổ giờ giao mong muốn: lưu cả mốc kết thúc (from đã có ở desired_delivery_at).

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "desired_delivery_until" timestamp with time zone;
