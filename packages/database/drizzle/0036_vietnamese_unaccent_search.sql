-- Tìm kiếm tiếng Việt không dấu (DB-02).
--
-- Vấn đề: menu có "Cơm gà xối mỡ" và "Cơm chỉ 27K" nhưng khách gõ "com" thì không
-- ra — cũ dùng ILIKE thẳng trên tên có dấu. Sinh viên gõ không dấu là mặc định,
-- nên đây là lỗi chặn khách tìm ra món để đặt.
--
-- Kèm theo: ILIKE '%...%' có ký tự đại diện ở đầu nên Postgres không dùng được
-- index nào, phải quét tuần tự — mà truy vấn này chạy hai lần cho mỗi lượt tìm
-- (một lần đếm tổng, một lần lấy dữ liệu). GIN + pg_trgm giải quyết luôn phần đó.

CREATE SCHEMA IF NOT EXISTS extensions;-->statement-breakpoint

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;-->statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;-->statement-breakpoint

-- `unaccent(text)` một tham số là STABLE chứ không IMMUTABLE (kết quả phụ thuộc
-- search_path để tìm dictionary), nên không dùng trực tiếp trong index được.
-- Dạng hai tham số `unaccent(regdictionary, text)` mới IMMUTABLE — bọc lại và chỉ
-- định dictionary tường minh. Gộp luôn lower() để index và truy vấn dùng chung
-- đúng một biểu thức.
CREATE OR REPLACE FUNCTION public.ldh_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS 'select extensions.unaccent(''extensions.unaccent''::regdictionary, lower($1))';-->statement-breakpoint

CREATE INDEX IF NOT EXISTS food_items_name_unaccent_trgm_idx
  ON food_items USING gin (public.ldh_unaccent(name) extensions.gin_trgm_ops);-->statement-breakpoint

CREATE INDEX IF NOT EXISTS sellers_shop_name_unaccent_trgm_idx
  ON sellers USING gin (public.ldh_unaccent(shop_name) extensions.gin_trgm_ops);
