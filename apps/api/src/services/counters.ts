import type { DbConn } from '@langdaihoc/database';
import { sql } from 'drizzle-orm';

/**
 * Bộ đếm ghi sẵn cho pulse + thống kê doanh thu theo ngày.
 *
 * Vì retention xóa đơn đã đóng sau 7 ngày, mọi con số lịch sử (doanh thu tháng,
 * tổng đơn, rating) phải được cộng dồn ngay lúc phát sinh thay vì quét lại orders.
 * Counter mở (pending/open/complaint) thì tính lại từ đúng các dòng chưa đóng —
 * partial index khiến việc này chỉ chạm vài chục dòng, nên không bị lệch dần.
 */

/** Trạng thái đã đóng — không còn tính vào counter "đang mở". */
export const SETTLED_ORDER_STATUSES = ['completed', 'cancelled', 'rejected', 'needs_support'] as const;

const SETTLED_SQL = sql`('completed', 'cancelled', 'rejected', 'needs_support')`;

/**
 * Tính lại counter của seller từ các đơn/khiếu nại chưa đóng rồi upsert.
 * Gọi sau mọi thay đổi trạng thái đơn hoặc khiếu nại của seller đó.
 */
export async function refreshSellerCounters(conn: DbConn, sellerId: string) {
  await conn.execute(sql`
    with o as (
      select
        count(*) filter (where status = 'pending')::int as pending_count,
        count(*)::int as open_count,
        count(*) filter (where status in ('delivering', 'returning'))::int as delivering_count,
        count(*) filter (where late_delivery_warned_at is not null)::int as late_warning_count,
        max(created_at) as latest_order_at
      from orders
      where seller_id = ${sellerId}
        and status not in ${SETTLED_SQL}
    ), c as (
      select count(*)::int as open_complaint_count
      from complaints
      where seller_id = ${sellerId}
        and status not in ('resolved', 'rejected')
    )
    insert into seller_counters (
      seller_id, pending_count, open_count, delivering_count, late_warning_count,
      open_complaint_count, latest_order_at, latest_change_at, version, updated_at
    )
    select
      ${sellerId}, o.pending_count, o.open_count, o.delivering_count, o.late_warning_count,
      c.open_complaint_count, o.latest_order_at, now(), 1, now()
    from o, c
    on conflict (seller_id) do update set
      pending_count = excluded.pending_count,
      open_count = excluded.open_count,
      delivering_count = excluded.delivering_count,
      late_warning_count = excluded.late_warning_count,
      open_complaint_count = excluded.open_complaint_count,
      latest_order_at = excluded.latest_order_at,
      latest_change_at = now(),
      version = seller_counters.version + 1,
      updated_at = now()
  `);
}

/** Tính lại counter của buyer từ các đơn chưa đóng rồi upsert. */
export async function refreshBuyerCounters(conn: DbConn, userId: string) {
  await conn.execute(sql`
    with o as (
      select
        count(*) filter (where status = 'waiting_price_confirmation')::int as pending_count,
        count(*)::int as open_count,
        max(created_at) as latest_order_at
      from orders
      where buyer_id = ${userId}
        and status not in ${SETTLED_SQL}
    )
    insert into buyer_counters (
      user_id, pending_count, open_count, latest_order_at, latest_change_at, version, updated_at
    )
    select ${userId}, o.pending_count, o.open_count, o.latest_order_at, now(), 1, now()
    from o
    on conflict (user_id) do update set
      pending_count = excluded.pending_count,
      open_count = excluded.open_count,
      latest_order_at = excluded.latest_order_at,
      latest_change_at = now(),
      version = buyer_counters.version + 1,
      updated_at = now()
  `);
}

/** Tiện dụng: cập nhật cả hai phía sau một thay đổi đơn. */
export async function refreshOrderCounters(
  conn: DbConn,
  params: { sellerId?: string | null; buyerId?: string | null },
) {
  if (params.sellerId) await refreshSellerCounters(conn, params.sellerId);
  if (params.buyerId) await refreshBuyerCounters(conn, params.buyerId);
}

/**
 * Cộng dồn một đơn hoàn thành vào thống kê ngày + tổng đời của seller và buyer.
 * Chỉ được gọi đúng một lần cho mỗi đơn (tại bước chuyển sang completed).
 */
export async function recordOrderCompleted(
  conn: DbConn,
  params: { orderId: string; sellerId: string; buyerId: string; total: string | number; completedAt?: Date },
) {
  const amount = String(params.total ?? 0);
  const at = (params.completedAt ?? new Date()).toISOString();

  await conn.execute(sql`
    insert into seller_daily_stats (seller_id, day, completed_orders, revenue, updated_at)
    values (
      ${params.sellerId},
      (${at}::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date,
      1,
      ${amount}::numeric,
      now()
    )
    on conflict (seller_id, day) do update set
      completed_orders = seller_daily_stats.completed_orders + 1,
      revenue = seller_daily_stats.revenue + excluded.revenue,
      updated_at = now()
  `);

  await conn.execute(sql`
    insert into seller_counters (seller_id, lifetime_orders, lifetime_revenue, latest_change_at, version, updated_at)
    values (${params.sellerId}, 1, ${amount}::numeric, now(), 1, now())
    on conflict (seller_id) do update set
      lifetime_orders = seller_counters.lifetime_orders + 1,
      lifetime_revenue = seller_counters.lifetime_revenue + ${amount}::numeric,
      latest_change_at = now(),
      version = seller_counters.version + 1,
      updated_at = now()
  `);

  await conn.execute(sql`
    insert into buyer_counters (user_id, lifetime_completed, latest_change_at, version, updated_at)
    values (${params.buyerId}, 1, now(), 1, now())
    on conflict (user_id) do update set
      lifetime_completed = buyer_counters.lifetime_completed + 1,
      latest_change_at = now(),
      version = buyer_counters.version + 1,
      updated_at = now()
  `);

  await conn.execute(sql`
    update orders set stats_recorded_at = now()
    where id = ${params.orderId} and stats_recorded_at is null
  `);
}

/** Cộng/trừ rating tổng hợp trên sellers khi review được tạo, sửa hoặc xóa. */
export async function bumpSellerRating(
  conn: DbConn,
  sellerId: string,
  deltaSum: number,
  deltaCount: number,
) {
  if (!deltaSum && !deltaCount) return;
  await conn.execute(sql`
    update sellers set
      rating_sum = greatest(0, rating_sum + ${deltaSum}),
      rating_count = greatest(0, rating_count + ${deltaCount}),
      updated_at = now()
    where id = ${sellerId}
  `);
}
