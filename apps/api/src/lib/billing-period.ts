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
  // Chưa có setting — seed ngay để kỳ hiện tại bắt đầu từ lúc này
  const now = new Date();
  await db
    .insert(platformSettings)
    .values({ key: BILLING_PERIOD_STARTED_AT_KEY, value: now.toISOString(), updatedAt: now })
    .onConflictDoNothing();
  return now;
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
