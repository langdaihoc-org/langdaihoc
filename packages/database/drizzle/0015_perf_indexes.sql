-- Perf indexes round 2: FK gaps, catalog filters, retention purge paths
CREATE INDEX IF NOT EXISTS complaints_order_idx ON complaints (order_id);
CREATE INDEX IF NOT EXISTS cart_items_food_item_idx ON cart_items (food_item_id);
CREATE INDEX IF NOT EXISTS food_items_seller_available_sort_idx
  ON food_items (seller_id, sort_order)
  WHERE is_available = true;
CREATE INDEX IF NOT EXISTS food_items_category_idx ON food_items (category_id);
CREATE INDEX IF NOT EXISTS laundry_services_seller_available_idx
  ON laundry_services (seller_id)
  WHERE is_available = true;
CREATE INDEX IF NOT EXISTS sellers_status_service_idx ON sellers (status, service_types);
CREATE INDEX IF NOT EXISTS carts_seller_idx ON carts (seller_id);
CREATE INDEX IF NOT EXISTS reviews_seller_created_idx ON reviews (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS banners_active_sort_idx
  ON banners (sort_order)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS checkout_idempotency_created_idx ON checkout_idempotency_keys (created_at);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at);
CREATE INDEX IF NOT EXISTS food_item_options_group_idx ON food_item_options (group_id);
CREATE INDEX IF NOT EXISTS posts_food_item_idx ON posts (food_item_id);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts (status, is_pinned DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS complaints_created_idx ON complaints (created_at DESC);
