-- Làng ĐH không thu phí ship — bỏ cột thừa
ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_fee";
