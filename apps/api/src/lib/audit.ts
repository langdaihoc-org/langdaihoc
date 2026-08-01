import { auditLogs } from '@langdaihoc/database';

type Db = {
  insert: (table: typeof auditLogs) => {
    values: (row: Record<string, unknown>) => Promise<unknown>;
  };
};

export async function writeAudit(
  db: Db,
  params: {
    actorId: string;
    actorRole: 'buyer' | 'seller' | 'admin';
    action: string;
    entityType: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ip?: string;
    userAgent?: string;
  },
) {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
}
