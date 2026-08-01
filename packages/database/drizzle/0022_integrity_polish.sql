-- Integrity polish: cancelled_by FK, review rating check, proof index
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_cancelled_by_profiles_fk;
ALTER TABLE orders
  ADD CONSTRAINT orders_cancelled_by_profiles_fk
  FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_rating_range;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_range CHECK (rating >= 1 AND rating <= 5);

CREATE INDEX IF NOT EXISTS payment_proofs_order_uploaded_idx
  ON payment_proofs (order_id, uploaded_at DESC);
