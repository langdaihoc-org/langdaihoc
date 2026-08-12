import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const cols = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_name in ('buyer_counters', 'seller_counters')
      and column_name in ('unread_count', 'latest_notification_at')
    order by 1, 2
  `;
  const unread = await sql`
    select
      (select coalesce(sum(unread_count),0)::int from buyer_counters) as buyer_unread,
      (select coalesce(sum(unread_count),0)::int from seller_counters) as seller_unread
  `;
  console.log({ columns: cols, unread: unread[0] });
} finally {
  await sql.end();
}
