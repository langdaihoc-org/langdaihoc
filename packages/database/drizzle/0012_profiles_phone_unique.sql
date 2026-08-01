-- Phone login: unique when set (normalized 0xxxxxxxxx)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON profiles (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
