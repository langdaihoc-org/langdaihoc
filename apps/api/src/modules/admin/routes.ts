import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, sql, desc, and, or, ilike, ne, inArray } from 'drizzle-orm';
import {
  sellers,
  profiles,
  orders,
  complaints,
  complaintMessages,
  banners,
  posts,
  categories,
  auditLogs,
  carts,
  reviews,
  foodItems,
  siteFeedback,
  sellerCounters,
  buyerCounters,
  sellerDailyStats,
} from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ensureUserRole, ensurePhoneNotUsed, ensureEmailNotUsed } from '../auth/service.js';
import { writeAudit } from '../../lib/audit.js';
import { enrichOrdersList } from '../../services/commerce.js';
import { refreshSellerCounters } from '../../services/counters.js';
import { getBillingPeriodStartedAt, resetBillingPeriod } from '../../lib/billing-period.js';
import { assertUploadedImageUrl, assertUploadedImageUrls, uploadImage, parseImageUpload, safeUploadFileName, imageContentTypeSchema, removeReplacedPublicImages } from '../../lib/storage.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { passwordSchema, normalizePhoneVN } from '@langdaihoc/shared';
import { isSafeLinkUrl } from '@langdaihoc/shared';

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const safeLink = z
  .string()
  .optional()
  .nullable()
  .refine((v) => !v || isSafeLinkUrl(v), 'Link không hợp lệ');

const bannerInputSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  linkUrl: safeLink,
  ctaLabel: z.string().max(80).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isPopup: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

const postAdminSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string().min(1)).max(30).optional().nullable(),
  ctaLabel: z.string().max(80).optional().nullable(),
  linkUrl: safeLink,
  foodItemId: z.string().uuid().optional().nullable(),
  status: z.enum(['published', 'hidden', 'pending', 'rejected']).optional(),
  isPinned: z.boolean().optional(),
  sellerId: z.string().uuid().optional().nullable(),
});

const postCreateAdminSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string().min(1)).max(30).optional().nullable(),
  ctaLabel: z.string().max(80).optional().nullable(),
  linkUrl: safeLink,
  foodItemId: z.string().uuid().optional().nullable(),
  status: z.enum(['published', 'hidden', 'pending', 'rejected']).optional(),
  isPinned: z.boolean().optional(),
  sellerId: z.string().uuid().optional().nullable(),
});

function normalizeAdminPostImages(
  imageUrl?: string | null,
  imageUrls?: string[] | null,
  existing?: { imageUrl: string | null; imageUrls: string[] | null },
) {
  const urls = (imageUrls ?? existing?.imageUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);
  const single = imageUrl !== undefined ? imageUrl : existing?.imageUrl;
  if (single?.trim() && !urls.includes(single.trim())) urls.unshift(single.trim());
  return urls;
}

function auditFromReq(req: Request) {
  return {
    actorId: req.user!.id,
    actorRole: 'admin' as const,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

/** Upload ảnh banner/post — 40 lần/5 phút/IP (prod) */
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});

adminRouter.post(
  '/upload',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        bucket: z.enum(['post-images', 'banner-images']),
        contentType: imageContentTypeSchema,
        dataBase64: z.string().min(1),
        fileName: z.string().optional(),
      })
      .parse(req.body);

    const { buffer, contentType, ext } = parseImageUpload(body.dataBase64, body.contentType);
    const path = `admin/${req.user!.id}/${Date.now()}-${safeUploadFileName(body.fileName, ext)}`;
    const url = await uploadImage(
      req.app.locals.supabaseAdmin,
      body.bucket,
      path,
      buffer,
      contentType,
    );
    res.json({ data: { url } });
  }),
);

adminRouter.get(
  '/sellers',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const db = req.app.locals.db;
    const data = await db
      .select({
        seller: sellers,
        email: profiles.email,
        fullName: profiles.fullName,
        phone: profiles.phone,
      })
      .from(sellers)
      .innerJoin(profiles, eq(sellers.userId, profiles.id))
      .orderBy(desc(sellers.createdAt))
      .limit(limit)
      .offset(offset);

    const periodStart = await getBillingPeriodStartedAt(db);
    const periodStartIso = periodStart.toISOString();
    const sellerIds = data.map((r: (typeof data)[number]) => r.seller.id);
    const statsBySeller = new Map<string, { monthlyRevenue: number; monthlyOrderCount: number }>();
    if (sellerIds.length) {
      const rows = await db
        .select({
          sellerId: sellerDailyStats.sellerId,
          monthlyRevenue: sql<number>`coalesce(sum(${sellerDailyStats.revenue}), 0)::float8`,
          monthlyOrderCount: sql<number>`coalesce(sum(${sellerDailyStats.completedOrders}), 0)::int`,
        })
        .from(sellerDailyStats)
        .where(
          and(
            inArray(sellerDailyStats.sellerId, sellerIds),
            sql`${sellerDailyStats.day} >= (${periodStartIso}::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date`,
          ),
        )
        .groupBy(sellerDailyStats.sellerId);
      for (const r of rows) {
        if (!r.sellerId) continue;
        statsBySeller.set(r.sellerId, {
          monthlyRevenue: Number(r.monthlyRevenue ?? 0),
          monthlyOrderCount: Number(r.monthlyOrderCount ?? 0),
        });
      }
    }

    res.json({
      data: data.map((row: (typeof data)[number]) => ({
        ...row,
        monthlyRevenue: statsBySeller.get(row.seller.id)?.monthlyRevenue ?? 0,
        monthlyOrderCount: statsBySeller.get(row.seller.id)?.monthlyOrderCount ?? 0,
      })),
      meta: { billingPeriodStartedAt: periodStartIso },
    });
  }),
);

adminRouter.get(
  '/billing-period',
  asyncHandler(async (req, res) => {
    const startedAt = await getBillingPeriodStartedAt(req.app.locals.db);
    res.json({ data: { startedAt: startedAt.toISOString() } });
  }),
);

adminRouter.post(
  '/billing-period/reset',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const prev = await getBillingPeriodStartedAt(db);
    const startedAt = await resetBillingPeriod(db);
    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'billing_period.reset',
      entityType: 'platform_settings',
      entityId: 'billing_period_started_at',
      oldValue: { startedAt: prev.toISOString() },
      newValue: { startedAt: startedAt.toISOString() },
    });
    res.json({ data: { startedAt: startedAt.toISOString() }, message: 'Đã bắt đầu tháng mới — thống kê reset về 0' });
  }),
);

adminRouter.patch(
  '/sellers/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['approved', 'rejected', 'suspended']).optional(),
        rejectionReason: z.string().optional(),
        serviceTypes: z.enum(['food', 'laundry', 'ship_proxy']).optional(),
        shopName: z.string().trim().min(2).max(120).optional(),
        businessAddress: z.string().trim().min(3).max(300).optional(),
      })
      .refine(
        (v) => v.status || v.shopName || v.businessAddress || v.serviceTypes,
        { message: 'Cần ít nhất một trường để cập nhật' },
      )
      .parse(req.body);
    const db = req.app.locals.db;
    const sellerId = String(req.params.id);

    const [existing] = await db.select().from(sellers).where(eq(sellers.id, sellerId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy đối tác', 'NOT_FOUND');

    // Public register is food/laundry only — don't convert pending applicants to ship_proxy here
    if (
      body.serviceTypes === 'ship_proxy' &&
      existing.serviceTypes !== 'ship_proxy' &&
      existing.status === 'pending'
    ) {
      throw new AppError(400, 'Người nhận đồ ship hộ chỉ được tạo nội bộ bởi admin', 'INVALID_SERVICE');
    }

    if (body.status === 'approved' && existing.status !== 'approved') {
      // Duyệt lần đầu — approvedAt set bên dưới; quán tự cập nhật tên/địa chỉ sau.
    }

    const nextStatus = body.status ?? existing.status;
    const serviceTypes =
      body.serviceTypes ?? (body.status === 'approved' ? existing.serviceTypes : undefined);

    const [updated] = await db
      .update(sellers)
      .set({
        status: nextStatus,
        rejectionReason: body.rejectionReason ?? existing.rejectionReason,
        ...(serviceTypes ? { serviceTypes } : {}),
        ...(body.shopName ? { shopName: body.shopName } : {}),
        ...(body.businessAddress ? { businessAddress: body.businessAddress } : {}),
        approvedAt:
          nextStatus === 'approved'
            ? (existing.approvedAt ?? new Date())
            : nextStatus === 'suspended' || nextStatus === 'rejected'
              ? null
              : existing.approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(sellers.id, sellerId))
      .returning();

    if (updated && nextStatus === 'approved') {
      await ensureUserRole(db, updated.userId, 'seller');
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: body.status ? `seller.${body.status}` : 'seller.update',
      entityType: 'seller',
      entityId: sellerId,
      oldValue: {
        status: existing.status,
        serviceTypes: existing.serviceTypes,
        shopName: existing.shopName,
        businessAddress: existing.businessAddress,
      },
      newValue: {
        status: updated?.status,
        serviceTypes: updated?.serviceTypes,
        shopName: updated?.shopName,
        businessAddress: updated?.businessAddress,
      },
    });

    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/sellers/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const sellerId = String(req.params.id);

    const [existing] = await db.select().from(sellers).where(eq(sellers.id, sellerId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy đối tác', 'NOT_FOUND');

    if (existing.userId === req.user!.id) {
      throw new AppError(400, 'Không thể tự xóa tài khoản của chính mình', 'CANNOT_SELF_MODIFY');
    }

    // Đơn cũ đã bị retention xóa nên phải hỏi counter lịch sử, không chỉ bảng orders.
    const [[orderRow], [counterRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.sellerId, sellerId)),
      db
        .select({ lifetimeOrders: sellerCounters.lifetimeOrders, openCount: sellerCounters.openCount })
        .from(sellerCounters)
        .where(eq(sellerCounters.sellerId, sellerId))
        .limit(1),
    ]);
    if ((orderRow?.count ?? 0) > 0 || (counterRow?.lifetimeOrders ?? 0) > 0 || (counterRow?.openCount ?? 0) > 0) {
      throw new AppError(
        409,
        'Đối tác còn lịch sử đơn hàng — không thể xóa vĩnh viễn. Hãy tạm dừng thay vì xóa.',
        'SELLER_HAS_ORDERS',
      );
    }

    const [reviewRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.sellerId, sellerId));
    if ((reviewRow?.count ?? 0) > 0) {
      throw new AppError(
        409,
        'Đối tác còn đánh giá — không thể xóa vĩnh viễn. Hãy tạm dừng thay vì xóa.',
        'SELLER_HAS_REVIEWS',
      );
    }

    const [complaintRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(complaints)
      .where(eq(complaints.sellerId, sellerId));
    if ((complaintRow?.count ?? 0) > 0) {
      throw new AppError(
        409,
        'Đối tác còn khiếu nại — không thể xóa vĩnh viễn. Hãy tạm dừng thay vì xóa.',
        'SELLER_HAS_COMPLAINTS',
      );
    }

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, existing.userId)).limit(1);

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'seller.delete',
      entityType: 'seller',
      entityId: sellerId,
      oldValue: {
        shopName: existing.shopName,
        status: existing.status,
        serviceTypes: existing.serviceTypes,
        userId: existing.userId,
        email: profile?.email,
      },
      newValue: null,
    });

    // Auth trước — nếu fail thì profile/shop còn nguyên; tránh orphan Auth.
    const supabase = createSupabaseAdmin();
    const { error: authErr } = await supabase.auth.admin.deleteUser(existing.userId);
    if (authErr) {
      throw new AppError(
        502,
        `Không xóa được tài khoản đăng nhập: ${authErr.message}`,
        'AUTH_DELETE_FAILED',
      );
    }

    // Gỡ tham chiếu giỏ hàng (FK không cascade) trước khi xóa seller.
    await db.update(carts).set({ sellerId: null }).where(eq(carts.sellerId, sellerId));

    // Xóa profile → cascade sellers (+ món, dịch vụ giặt, STK, posts…).
    await db.delete(profiles).where(eq(profiles.id, existing.userId));

    res.json({ data: { id: sellerId, deleted: true } });
  }),
);

/** Tạo tài khoản nhận đồ ship hộ nội bộ — không mở đăng ký công khai */
adminRouter.post(
  '/ship-sellers',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(100),
        email: z.string().email().toLowerCase(),
        phone: z
          .string()
          .trim()
          .min(9)
          .max(15)
          .transform((v) => normalizePhoneVN(v) || v),
        password: passwordSchema,
        shopName: z.string().trim().min(2).max(120),
        businessAddress: z.string().trim().min(3).max(300).optional(),
        description: z.string().trim().max(1000).optional(),
        serviceAreas: z.array(z.string().min(1)).optional(),
        avgDeliveryMinutes: z.number().int().positive().max(24 * 60).optional(),
      })
      .parse(req.body);

    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;

    const [emailTaken] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, body.email)).limit(1);
    if (emailTaken) throw new AppError(409, 'Email đã được sử dụng', 'EMAIL_TAKEN');
    await ensurePhoneNotUsed(db, body.phone);

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName, role: 'seller' },
    });
    if (error || !data.user) {
      throw new AppError(400, 'Không thể tạo tài khoản', 'SIGNUP_FAILED');
    }

    try {
      await db.insert(profiles).values({
        id: data.user.id,
        email: body.email,
        role: 'seller',
        status: 'active',
        fullName: body.fullName,
        phone: body.phone,
      });

      const [seller] = await db
        .insert(sellers)
        .values({
          userId: data.user.id,
          shopName: body.shopName,
          serviceTypes: 'ship_proxy',
          businessAddress: body.businessAddress?.trim() || 'KTX ĐHQG',
          description: body.description ?? 'Nhận đồ ship hộ trong khu KTX',
          serviceAreas: body.serviceAreas?.length ? body.serviceAreas : ['KTX'],
          avgDeliveryMinutes: body.avgDeliveryMinutes ?? null,
          status: 'approved',
          approvedAt: new Date(),
        })
        .returning();

      await ensureUserRole(db, data.user.id, 'seller');

      await writeAudit(db, {
        ...auditFromReq(req),
        action: 'seller.ship_proxy_created',
        entityType: 'seller',
        entityId: seller!.id,
        newValue: { email: body.email, shopName: body.shopName },
      });

      res.status(201).json({ data: seller });
    } catch (e) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw e;
    }
  }),
);

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const conditions = [];
    if (role && ['buyer', 'seller', 'admin'].includes(role)) {
      conditions.push(eq(profiles.role, role as 'buyer' | 'seller' | 'admin'));
    }
    if (
      status &&
      ['pending_email_verification', 'active', 'suspended', 'deleted'].includes(status)
    ) {
      conditions.push(
        eq(
          profiles.status,
          status as 'pending_email_verification' | 'active' | 'suspended' | 'deleted',
        ),
      );
    }
    if (q) {
      conditions.push(or(ilike(profiles.email, `%${q}%`), ilike(profiles.fullName, `%${q}%`)));
    }

    const users: {
      id: string;
      email: string;
      fullName: string;
      role: 'buyer' | 'seller' | 'admin';
      status: string;
      phone: string | null;
      createdAt: Date;
    }[] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        role: profiles.role,
        status: profiles.status,
        phone: profiles.phone,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(profiles.createdAt))
      .limit(limit);

    res.json({ data: users });
  }),
);

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['active', 'suspended']),
      })
      .parse(req.body);
    const db = req.app.locals.db;
    const userId = String(req.params.id);

    if (userId === req.user!.id) {
      throw new AppError(400, 'Không thể tự khóa tài khoản của chính mình', 'CANNOT_SELF_MODIFY');
    }

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy người dùng', 'NOT_FOUND');

    const [updated] = await db
      .update(profiles)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();

    if (existing.role === 'seller' && body.status === 'suspended') {
      await db
        .update(sellers)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(and(eq(sellers.userId, userId), eq(sellers.status, 'approved')));
    }
    if (existing.role === 'seller' && body.status === 'active' && existing.status !== 'active') {
      await db
        .update(sellers)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(sellers.userId, userId), eq(sellers.status, 'suspended')));
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: `user.${body.status}`,
      entityType: 'user',
      entityId: userId,
      oldValue: { status: existing.status, email: existing.email },
      newValue: { status: body.status },
    });

    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const userId = String(req.params.id);

    if (userId === req.user!.id) {
      throw new AppError(400, 'Không thể tự xóa tài khoản của chính mình', 'CANNOT_SELF_MODIFY');
    }

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy người dùng', 'NOT_FOUND');

    const [[{ count: liveBuyerOrders }], [buyerCounterRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.buyerId, userId)),
      db
        .select({ lifetimeCompleted: buyerCounters.lifetimeCompleted, openCount: buyerCounters.openCount })
        .from(buyerCounters)
        .where(eq(buyerCounters.userId, userId))
        .limit(1),
    ]);
    const buyerOrderCount =
      (liveBuyerOrders ?? 0) + (buyerCounterRow?.lifetimeCompleted ?? 0) + (buyerCounterRow?.openCount ?? 0);

    const [sellerRow] = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, userId)).limit(1);
    let sellerOrderCount = 0;
    if (sellerRow) {
      const [[row], [counter]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.sellerId, sellerRow.id)),
        db
          .select({ lifetimeOrders: sellerCounters.lifetimeOrders, openCount: sellerCounters.openCount })
          .from(sellerCounters)
          .where(eq(sellerCounters.sellerId, sellerRow.id))
          .limit(1),
      ]);
      sellerOrderCount = (row?.count ?? 0) + (counter?.lifetimeOrders ?? 0) + (counter?.openCount ?? 0);
    }

    if ((buyerOrderCount ?? 0) > 0 || sellerOrderCount > 0) {
      throw new AppError(
        409,
        'Tài khoản còn lịch sử đơn hàng — không thể xóa vĩnh viễn. Hãy khóa tài khoản thay vì xóa.',
        'USER_HAS_ORDERS',
      );
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'user.delete',
      entityType: 'user',
      entityId: userId,
      oldValue: {
        email: existing.email,
        fullName: existing.fullName,
        role: existing.role,
        status: existing.status,
      },
      newValue: null,
    });

    // Auth trước — nếu fail thì profile còn nguyên; tránh orphan Auth.
    const supabase = createSupabaseAdmin();
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) {
      throw new AppError(
        502,
        `Không xóa được tài khoản đăng nhập: ${authErr.message}`,
        'AUTH_DELETE_FAILED',
      );
    }

    await db.delete(profiles).where(eq(profiles.id, userId));

    res.json({ data: { id: userId, deleted: true } });
  }),
);

const categoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  type: z.enum(['food', 'laundry']),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const db = req.app.locals.db;
    const data =
      type && ['food', 'laundry'].includes(type)
        ? await db.select().from(categories).where(eq(categories.type, type as 'food' | 'laundry')).orderBy(categories.sortOrder)
        : await db.select().from(categories).orderBy(categories.sortOrder);
    res.json({ data });
  }),
);

adminRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const input = categoryInputSchema.parse(req.body);
    const db = req.app.locals.db;
    const slug = input.slug ?? slugify(input.name);

    const [existing] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (existing) throw new AppError(409, 'Slug danh mục đã tồn tại', 'SLUG_EXISTS');

    const [created] = await db
      .insert(categories)
      .values({
        name: input.name,
        slug,
        type: input.type,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      })
      .returning();

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'category.create',
      entityType: 'category',
      entityId: created!.id,
      newValue: created,
    });

    res.status(201).json({ data: created });
  }),
);

adminRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const input = categoryInputSchema.partial().parse(req.body);
    const db = req.app.locals.db;
    const categoryId = String(req.params.id);

    const [existing] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy danh mục', 'NOT_FOUND');

    if (input.slug && input.slug !== existing.slug) {
      const [dup] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.slug, input.slug), ne(categories.id, categoryId)))
        .limit(1);
      if (dup) throw new AppError(409, 'Slug danh mục đã tồn tại', 'SLUG_EXISTS');
    }

    const [updated] = await db
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      .where(eq(categories.id, categoryId))
      .returning();

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'category.update',
      entityType: 'category',
      entityId: categoryId,
      oldValue: existing,
      newValue: updated,
    });

    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const categoryId = String(req.params.id);

    const [existing] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy danh mục', 'NOT_FOUND');

    // Gỡ liên kết món ăn trước (FK không cascade)
    await db.update(foodItems).set({ categoryId: null }).where(eq(foodItems.categoryId, categoryId));

    await db.delete(categories).where(eq(categories.id, categoryId));

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'category.delete',
      entityType: 'category',
      entityId: categoryId,
      oldValue: existing,
      newValue: null,
    });

    res.json({ data: { id: categoryId, deleted: true } });
  }),
);

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const data = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorRole: auditLogs.actorRole,
        createdAt: auditLogs.createdAt,
        actorName: profiles.fullName,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    res.json({ data });
  }),
);

adminRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(50);
    const data = await enrichOrdersList(db, rows, { includeDetails: true });
    res.json({ data });
  }),
);

adminRouter.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const data = await req.app.locals.db
      .select({
        complaint: complaints,
        buyerName: profiles.fullName,
        buyerEmail: profiles.email,
        buyerPhone: profiles.phone,
        shopName: sellers.shopName,
      })
      .from(complaints)
      .innerJoin(profiles, eq(complaints.buyerId, profiles.id))
      .innerJoin(sellers, eq(complaints.sellerId, sellers.id))
      .orderBy(desc(complaints.createdAt))
      .limit(limit)
      .offset(offset);
    res.json({
      data: data.map((row: (typeof data)[number]) => ({
        ...row.complaint,
        buyer: {
          id: row.complaint.buyerId,
          fullName: row.buyerName,
          email: row.buyerEmail,
          phone: row.buyerPhone,
        },
        shopName: row.shopName,
      })),
    });
  }),
);

adminRouter.get(
  '/complaints/:id/messages',
  asyncHandler(async (req, res) => {
    const complaintId = String(req.params.id);
    const messages = await req.app.locals.db
      .select({
        id: complaintMessages.id,
        body: complaintMessages.body,
        authorRole: complaintMessages.authorRole,
        createdAt: complaintMessages.createdAt,
        authorName: profiles.fullName,
      })
      .from(complaintMessages)
      .innerJoin(profiles, eq(complaintMessages.authorId, profiles.id))
      .where(eq(complaintMessages.complaintId, complaintId))
      .orderBy(complaintMessages.createdAt);
    res.json({ data: messages });
  }),
);

adminRouter.post(
  '/complaints/:id/messages',
  asyncHandler(async (req, res) => {
    const complaintId = String(req.params.id);
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const db = req.app.locals.db;
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1);
    if (!complaint) throw new AppError(404, 'Không tìm thấy khiếu nại', 'NOT_FOUND');
    const [message] = await db
      .insert(complaintMessages)
      .values({
        complaintId: complaint.id,
        authorId: req.user!.id,
        authorRole: 'admin',
        body,
      })
      .returning();
    await db
      .update(complaints)
      .set({ updatedAt: new Date(), status: 'processing' })
      .where(eq(complaints.id, complaint.id));
    await refreshSellerCounters(db, complaint.sellerId);
    res.status(201).json({ data: message });
  }),
);

adminRouter.patch(
  '/complaints/:id',
  asyncHandler(async (req, res) => {
    const complaintId = String(req.params.id);
    const { status, adminResolution } = z
      .object({
        status: z.enum(['new', 'processing', 'waiting_seller', 'resolved', 'rejected']),
        adminResolution: z.string().optional(),
      })
      .parse(req.body);
    const db = req.app.locals.db;

    const [existing] = await db.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy khiếu nại', 'NOT_FOUND');

    const closing = status === 'resolved' || status === 'rejected';
    const [updated] = await db
      .update(complaints)
      .set({
        status,
        adminResolution,
        closedAt: closing ? (existing.closedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, complaintId))
      .returning();
    if (updated && adminResolution?.trim()) {
      await db.insert(complaintMessages).values({
        complaintId: updated.id,
        authorId: req.user!.id,
        authorRole: 'admin',
        body: adminResolution.trim(),
      });
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: `complaint.${status}`,
      entityType: 'complaint',
      entityId: complaintId,
      oldValue: { status: existing.status },
      newValue: { status: updated?.status, adminResolution: updated?.adminResolution },
    });

    await refreshSellerCounters(db, existing.sellerId);

    res.json({ data: updated });
  }),
);

adminRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    // Tổng đơn / đơn đang chạy / khiếu nại mở lấy từ counter — orders chỉ còn 7 ngày gần nhất.
    const [[buyers], [sellerCount], [pendingSellers], [aggregate], [today]] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(profiles).where(eq(profiles.role, 'buyer')),
      db.select({ c: sql<number>`count(*)::int` }).from(sellers),
      db.select({ c: sql<number>`count(*)::int` }).from(sellers).where(eq(sellers.status, 'pending')),
      db
        .select({
          lifetimeOrders: sql<number>`coalesce(sum(${sellerCounters.lifetimeOrders}), 0)::int`,
          openOrders: sql<number>`coalesce(sum(${sellerCounters.openCount}), 0)::int`,
          openComplaints: sql<number>`coalesce(sum(${sellerCounters.openComplaintCount}), 0)::int`,
        })
        .from(sellerCounters),
      db
        .select({ c: sql<number>`coalesce(sum(${sellerDailyStats.completedOrders}), 0)::int` })
        .from(sellerDailyStats)
        .where(sql`${sellerDailyStats.day} = (now() at time zone 'Asia/Ho_Chi_Minh')::date`),
    ]);
    res.json({
      data: {
        buyers: buyers?.c ?? 0,
        sellers: sellerCount?.c ?? 0,
        orders: Number(aggregate?.lifetimeOrders ?? 0) + Number(aggregate?.openOrders ?? 0),
        ordersToday: Number(today?.c ?? 0),
        pendingSellers: pendingSellers?.c ?? 0,
        openComplaints: Number(aggregate?.openComplaints ?? 0),
        processingOrders: Number(aggregate?.openOrders ?? 0),
      },
    });
  }),
);

adminRouter.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const data = await req.app.locals.db.select().from(banners).limit(limit);
    res.json({ data });
  }),
);

adminRouter.post(
  '/banners',
  asyncHandler(async (req, res) => {
    const input = bannerInputSchema.parse(req.body);
    const imageUrl = assertUploadedImageUrl(input.imageUrl, 'Ảnh banner');
    const db = req.app.locals.db;
    const [banner] = await db
      .insert(banners)
      .values({
        title: input.title,
        subtitle: input.subtitle ?? null,
        imageUrl,
        linkUrl: input.linkUrl ?? null,
        ctaLabel: input.ctaLabel ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        isPopup: input.isPopup ?? false,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      })
      .returning();

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'banner.create',
      entityType: 'banner',
      entityId: banner!.id,
      newValue: banner,
    });

    res.status(201).json({ data: banner });
  }),
);

adminRouter.patch(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const body = bannerInputSchema.partial().parse(req.body);
    const db = req.app.locals.db;
    const bannerId = String(req.params.id);

    const [existing] = await db.select().from(banners).where(eq(banners.id, bannerId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy banner', 'NOT_FOUND');

    const { imageUrl: rawImage, ...rest } = body;
    const patch: Record<string, unknown> = { ...rest };
    if (rawImage !== undefined) {
      patch.imageUrl = assertUploadedImageUrl(rawImage, 'Ảnh banner');
    }
    if ('startsAt' in body) patch.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if ('endsAt' in body) patch.endsAt = body.endsAt ? new Date(body.endsAt) : null;

    const [updated] = await db
      .update(banners)
      .set(patch)
      .where(eq(banners.id, bannerId))
      .returning();

    if (rawImage !== undefined) {
      void removeReplacedPublicImages(
        req.app.locals.supabaseAdmin,
        [existing.imageUrl],
        [updated?.imageUrl],
      );
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'banner.update',
      entityType: 'banner',
      entityId: bannerId,
      oldValue: existing,
      newValue: updated,
    });

    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const bannerId = String(req.params.id);
    const [existing] = await db.select().from(banners).where(eq(banners.id, bannerId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy banner', 'NOT_FOUND');
    await db.delete(banners).where(eq(banners.id, bannerId));
    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'banner.delete',
      entityType: 'banner',
      entityId: bannerId,
      oldValue: existing,
    });
    res.json({ data: { id: bannerId } });
  }),
);

adminRouter.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const status = req.query.status as 'published' | 'hidden' | 'pending' | 'rejected' | undefined;
    const base = db
      .select({
        id: posts.id,
        title: posts.title,
        body: posts.body,
        imageUrl: posts.imageUrl,
        imageUrls: posts.imageUrls,
        ctaLabel: posts.ctaLabel,
        linkUrl: posts.linkUrl,
        foodItemId: posts.foodItemId,
        status: posts.status,
        isPinned: posts.isPinned,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        sellerId: posts.sellerId,
        shopName: sellers.shopName,
      })
      .from(posts)
      .leftJoin(sellers, eq(posts.sellerId, sellers.id));

    const rows = status
      ? await base.where(eq(posts.status, status)).orderBy(desc(posts.createdAt)).limit(100)
      : await base.orderBy(desc(posts.createdAt)).limit(100);
    res.json({ data: rows });
  }),
);

adminRouter.post(
  '/posts',
  asyncHandler(async (req, res) => {
    const input = postCreateAdminSchema.parse(req.body);
    const db = req.app.locals.db;
    const status = input.status ?? 'published';
    const urls = assertUploadedImageUrls(
      normalizeAdminPostImages(input.imageUrl, input.imageUrls),
      'Ảnh bài đăng',
    );
    const [post] = await db
      .insert(posts)
      .values({
        sellerId: input.sellerId ?? null,
        title: input.title,
        body: input.body ?? null,
        imageUrl: urls[0] ?? null,
        imageUrls: urls,
        ctaLabel: input.ctaLabel ?? 'Đặt Ngay',
        linkUrl: input.linkUrl ?? '/food',
        foodItemId: input.foodItemId ?? null,
        status,
        isPinned: input.isPinned ?? false,
        publishedAt: status === 'published' ? new Date() : null,
      })
      .returning();

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'post.create',
      entityType: 'post',
      entityId: post!.id,
      newValue: post,
    });

    res.status(201).json({ data: post });
  }),
);

adminRouter.patch(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const body = postAdminSchema.parse(req.body);
    const db = req.app.locals.db;
    const postId = String(req.params.id);
    const [existing] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy bài đăng', 'NOT_FOUND');

    const { imageUrl, imageUrls, ...rest } = body;
    const patch: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date(),
    };
    if (imageUrls !== undefined || imageUrl !== undefined) {
      const urls = assertUploadedImageUrls(
        normalizeAdminPostImages(imageUrl, imageUrls, existing),
        'Ảnh bài đăng',
      );
      patch.imageUrls = urls;
      patch.imageUrl = urls[0] ?? null;
    }
    if (body.status === 'published' && existing.status !== 'published') {
      patch.publishedAt = new Date();
    }

    const [updated] = await db.update(posts).set(patch).where(eq(posts.id, postId)).returning();

    if (imageUrls !== undefined || imageUrl !== undefined) {
      void removeReplacedPublicImages(
        req.app.locals.supabaseAdmin,
        [existing.imageUrl, ...(existing.imageUrls ?? [])],
        [updated?.imageUrl, ...((updated?.imageUrls as string[] | null) ?? [])],
      );
    }

    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'post.update',
      entityType: 'post',
      entityId: postId,
      oldValue: existing,
      newValue: updated,
    });

    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const postId = String(req.params.id);
    const [existing] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy bài đăng', 'NOT_FOUND');
    await db.delete(posts).where(eq(posts.id, postId));
    await writeAudit(db, {
      ...auditFromReq(req),
      action: 'post.delete',
      entityType: 'post',
      entityId: postId,
      oldValue: existing,
    });
    res.json({ data: { id: postId } });
  }),
);

adminRouter.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const rows = await db
      .select({
        feedback: siteFeedback,
        userName: profiles.fullName,
        userEmail: profiles.email,
      })
      .from(siteFeedback)
      .leftJoin(profiles, eq(siteFeedback.userId, profiles.id))
      .orderBy(desc(siteFeedback.createdAt))
      .limit(100);
    res.json({
      data: rows.map((r: (typeof rows)[number]) => ({
        ...r.feedback,
        userName: r.userName,
        userEmail: r.userEmail,
      })),
    });
  }),
);

adminRouter.patch(
  '/feedback/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { status } = z.object({ status: z.enum(['new', 'read', 'done']) }).parse(req.body);
    const db = req.app.locals.db;
    const [existing] = await db.select().from(siteFeedback).where(eq(siteFeedback.id, id)).limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy góp ý', 'NOT_FOUND');
    const [updated] = await db
      .update(siteFeedback)
      .set({ status, updatedAt: new Date() })
      .where(eq(siteFeedback.id, id))
      .returning();
    res.json({ data: updated });
  }),
);
