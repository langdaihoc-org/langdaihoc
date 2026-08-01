-- Hot-path indexes: seller orders, notifications inbox, FK child tables
CREATE INDEX IF NOT EXISTS orders_seller_created_idx ON orders (seller_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS laundry_services_seller_idx ON laundry_services (seller_id);
CREATE INDEX IF NOT EXISTS cart_items_cart_idx ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history (order_id);
CREATE INDEX IF NOT EXISTS payment_proofs_order_idx ON payment_proofs (order_id);
CREATE INDEX IF NOT EXISTS complaint_messages_complaint_idx ON complaint_messages (complaint_id);
CREATE INDEX IF NOT EXISTS seller_bank_accounts_seller_idx ON seller_bank_accounts (seller_id);
CREATE INDEX IF NOT EXISTS food_option_groups_item_idx ON food_option_groups (food_item_id);
CREATE INDEX IF NOT EXISTS food_item_options_item_idx ON food_item_options (food_item_id);
CREATE INDEX IF NOT EXISTS complaints_seller_idx ON complaints (seller_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status);
