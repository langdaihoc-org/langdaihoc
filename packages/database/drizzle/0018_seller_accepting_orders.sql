-- Tạm đóng quán (không nhận đơn mới), đơn đang chạy vẫn xử lý được
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "accepting_orders" boolean DEFAULT true NOT NULL;
