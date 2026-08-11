import { eq } from 'drizzle-orm';
import { platformSettings, BILLING_PERIOD_STARTED_AT_KEY, type Database } from '@langdaihoc/database';

/** Mốc bắt đầu kỳ doanh thu tháng (admin bấm “Bắt đầu tháng mới”). */
export async function getBillingPeriodStartedAt(db: Database): Promise<Date> {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, BILLING_PERIOD_STARTED_AT_KEY))
    .limit(1);
  if (row?.value) {
    const d = new Date(row.value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Chưa có setting — mặc định đầu tháng VN (chỉ về 0 khi admin bấm "Bắt đầu tháng mới")
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m] = ymd.split('-');
  const startOfMonth = new Date(`${y}-${m}-01T00:00:00+07:00`);
  await db
    .insert(platformSettings)
    .values({ key: BILLING_PERIOD_STARTED_AT_KEY, value: startOfMonth.toISOString(), updatedAt: now })
    .onConflictDoNothing();
  return startOfMonth;
}

export async function resetBillingPeriod(db: Database): Promise<Date> {
  const now = new Date();
  await db
    .insert(platformSettings)
    .values({ key: BILLING_PERIOD_STARTED_AT_KEY, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: now.toISOString(), updatedAt: now },
    });
  return now;
}
