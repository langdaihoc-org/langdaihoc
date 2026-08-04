-- One complaint per order + buyer lookup index
CREATE UNIQUE INDEX IF NOT EXISTS "complaints_order_unique" ON "complaints" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "complaints_buyer_idx" ON "complaints" USING btree ("buyer_id");
CREATE INDEX IF NOT EXISTS "reviews_buyer_idx" ON "reviews" USING btree ("buyer_id");
