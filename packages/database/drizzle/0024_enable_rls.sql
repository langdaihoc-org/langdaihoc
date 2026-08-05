-- Lock PostgREST (anon / authenticated): app data goes through Express + Drizzle only.
-- No policies → default deny for roles subject to RLS.
-- service_role / postgres (API DATABASE_URL) bypass RLS.
-- Browser Realtime on notifications may stop; client already falls back to polling.

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sellers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seller_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_option_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_item_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "laundry_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "laundry_order_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ship_proxy_order_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_proofs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaint_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "banners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_idempotency_keys" ENABLE ROW LEVEL SECURITY;

-- Extra: strip direct table privileges from browser-facing roles
REVOKE ALL ON TABLE
  "profiles",
  "user_roles",
  "sellers",
  "buyer_addresses",
  "audit_logs",
  "categories",
  "seller_bank_accounts",
  "food_items",
  "food_option_groups",
  "food_item_options",
  "laundry_services",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "laundry_order_details",
  "ship_proxy_order_details",
  "order_status_history",
  "payment_proofs",
  "reviews",
  "complaints",
  "complaint_messages",
  "notifications",
  "banners",
  "posts",
  "checkout_idempotency_keys"
FROM anon, authenticated;
