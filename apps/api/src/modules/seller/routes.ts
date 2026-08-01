import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import {
  sellers,
  foodItems,
  foodItemOptions,
  foodOptionGroups,
  laundryServices,
  sellerBankAccounts,
  cartItems,
  posts,
  complaints,
  complaintMessages,
  profiles,
} from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assertUploadedImageUrl, assertUploadedImageUrls, uploadImage, parseImageUpload, safeUploadFileName, imageContentTypeSchema } from '../../lib/storage.js';
import { loadFoodItemExtras, mapFoodItemExtras } from '../../services/commerce.js';
import { paramId } from '../../lib/params.js';
import { isSafeLinkUrl } from '@langdaihoc/shared';

export const sellerRouter = Router();

sellerRouter.use(requireAuth, requireRole('seller'));

const optionGroupInput = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  options: z
    .array(z.object({ name: z.string().min(1), priceDelta: z.number().default(0) }))
    .min(1),
});

async function getMySeller(req: Request) {
  const [seller] = await req.app.locals.db
    .select()
    .from(sellers)
    .where(eq(sellers.userId, req.user!.id))
    .limit(1);
  if (!seller) throw new AppError(404, 'Không tìm thấy cửa hàng', 'NOT_FOUND');
  return seller;
}

async function requireApprovedSeller(req: Request, _res: Response, next: NextFunction) {
  const seller = await getMySeller(req);
  if (seller.status !== 'approved') {
    return next(new AppError(403, 'Cửa hàng chưa được duyệt', 'NOT_APPROVED'));
  }
  (req as Request & { seller: typeof seller }).seller = seller;
  next();
}

async function insertOptionGroups(
  db: Request['app']['locals']['db'],
  foodItemId: string,
  groups: z.infer<typeof optionGroupInput>[],
) {
  if (!groups.length) return;

  const insertedGroups = await db
    .insert(foodOptionGroups)
    .values(
      groups.map((g, gi) => ({
        foodItemId,
        name: g.name,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        sortOrder: gi,
      })),
    )
    .returning();

  const optionRows = insertedGroups.flatMap((group: { id: string }, gi: number) =>
    (groups[gi]?.options ?? []).map((opt, oi) => ({
      foodItemId,
      groupId: group.id,
      name: opt.name,
      priceDelta: String(opt.priceDelta),
      sortOrder: oi,
    })),
  );
  if (optionRows.length) {
    await db.insert(foodItemOptions).values(optionRows);
  }
}

async function replaceOptionGroups(
  db: Request['app']['locals']['db'],
  foodItemId: string,
  groups?: z.infer<typeof optionGroupInput>[],
) {
  await db.delete(foodOptionGroups).where(eq(foodOptionGroups.foodItemId, foodItemId));
  if (groups?.length) await insertOptionGroups(db, foodItemId, groups);
}

sellerRouter.get(
  '/shop',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    res.json({ data: seller });
  }),
);

sellerRouter.patch(
  '/shop',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const body = z
      .object({
        shopName: z.string().optional(),
        description: z.string().optional(),
        businessAddress: z.string().optional(),
        avatarUrl: z.string().optional(),
        phone: z.string().trim().min(9).max(20).nullable().optional(),
        openHours: z.string().trim().max(200).nullable().optional(),
        serviceAreas: z.array(z.string().min(1)).optional(),
        avgDeliveryMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
        acceptingOrders: z.boolean().optional(),
        shipProxyFee: z.number().int().positive().max(10_000_000).nullable().optional(),
      })
      .parse(req.body);
    const avatarUrl =
      body.avatarUrl !== undefined ? assertUploadedImageUrl(body.avatarUrl, 'Ảnh cửa hàng') : undefined;
    if (body.shipProxyFee !== undefined && seller.serviceTypes !== 'ship_proxy') {
      throw new AppError(400, 'Chỉ tài khoản nhận ship hộ mới đặt phí nhận hộ', 'INVALID_FIELD');
    }
    const [updated] = await req.app.locals.db
      .update(sellers)
      .set({
        ...(body.shopName !== undefined && { shopName: body.shopName }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.businessAddress !== undefined && { businessAddress: body.businessAddress }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.openHours !== undefined && { openHours: body.openHours }),
        ...(body.serviceAreas !== undefined && { serviceAreas: body.serviceAreas }),
        ...(body.avgDeliveryMinutes !== undefined && {
          avgDeliveryMinutes: body.avgDeliveryMinutes,
        }),
        ...(body.acceptingOrders !== undefined && { acceptingOrders: body.acceptingOrders }),
        ...(body.shipProxyFee !== undefined &&
          body.shipProxyFee != null && { shipProxyFee: String(body.shipProxyFee) }),
        updatedAt: new Date(),
      })
      .where(eq(sellers.id, seller.id))
      .returning();
    res.json({ data: updated });
  }),
);

sellerRouter.post(
  '/upload',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const body = z
      .object({
        bucket: z.enum(['food-images', 'laundry-images', 'post-images']),
        contentType: imageContentTypeSchema,
        dataBase64: z.string().min(1),
        fileName: z.string().optional(),
      })
      .parse(req.body);

    const { buffer, contentType, ext } = parseImageUpload(body.dataBase64, body.contentType);
    const path = `${seller.id}/${Date.now()}-${safeUploadFileName(body.fileName, ext)}`;
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

sellerRouter.get(
  '/food-items',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const items = await req.app.locals.db
      .select()
      .from(foodItems)
      .where(eq(foodItems.sellerId, seller.id));
    const itemIds = items.map((i: (typeof items)[number]) => i.id);
    const { groups, options } = await loadFoodItemExtras(req.app.locals.db, itemIds);
    const data = items.map((item: (typeof items)[number]) => {
      const extras = mapFoodItemExtras(item.id, groups, options);
      return { ...item, ...extras };
    });
    res.json({ data });
  }),
);

sellerRouter.post(
  '/food-items',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().nullable().optional(),
        price: z.number().positive(),
        prepTimeMinutes: z.number().int().positive().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        categoryIds: z.array(z.string().uuid()).optional(),
        imageUrl: z.string().nullable().optional(),
        imageUrls: z.array(z.string()).optional(),
        optionGroups: z.array(optionGroupInput).optional(),
      })
      .parse(req.body);
    const categoryIds = body.categoryIds?.length
      ? body.categoryIds
      : body.categoryId
        ? [body.categoryId]
        : [];
    const rawUrls = body.imageUrls?.length
      ? body.imageUrls
      : body.imageUrl
        ? [body.imageUrl]
        : [];
    const imageUrls = assertUploadedImageUrls(rawUrls, 'Ảnh món');
    const imageUrl = imageUrls[0] ?? null;
    const [item] = await req.app.locals.db
      .insert(foodItems)
      .values({
        sellerId: seller.id,
        name: body.name,
        description: body.description ?? null,
        price: String(body.price),
        prepTimeMinutes: body.prepTimeMinutes ?? 20,
        categoryId: categoryIds[0] ?? null,
        categoryIds,
        imageUrl,
        imageUrls,
      })
      .returning();
    if (body.optionGroups?.length) {
      await insertOptionGroups(req.app.locals.db, item.id, body.optionGroups);
    }
    res.status(201).json({ data: item });
  }),
);

sellerRouter.patch(
  '/food-items/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        name: z.string().optional(),
        price: z.number().positive().optional(),
        isAvailable: z.boolean().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        imageUrls: z.array(z.string()).optional(),
        prepTimeMinutes: z.number().int().positive().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        categoryIds: z.array(z.string().uuid()).optional(),
        optionGroups: z.array(optionGroupInput).optional(),
      })
      .parse(req.body);
    const categoryIds =
      body.categoryIds !== undefined
        ? body.categoryIds
        : body.categoryId !== undefined
          ? body.categoryId
            ? [body.categoryId]
            : []
          : undefined;
    const imageUrls =
      body.imageUrls !== undefined
        ? assertUploadedImageUrls(body.imageUrls, 'Ảnh món')
        : body.imageUrl !== undefined
          ? assertUploadedImageUrls(body.imageUrl ? [body.imageUrl] : [], 'Ảnh món')
          : undefined;
    const imageUrl = imageUrls !== undefined ? (imageUrls[0] ?? null) : undefined;
    const db = req.app.locals.db;
    const itemId = paramId(req);
    const [updated] = await db
      .update(foodItems)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.price !== undefined && { price: String(body.price) }),
        ...(body.isAvailable !== undefined && { isAvailable: body.isAvailable }),
        ...(body.description !== undefined && { description: body.description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(imageUrls !== undefined && { imageUrls }),
        ...(body.prepTimeMinutes !== undefined && { prepTimeMinutes: body.prepTimeMinutes }),
        ...(categoryIds !== undefined && {
          categoryIds,
          categoryId: categoryIds[0] ?? null,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(foodItems.id, itemId), eq(foodItems.sellerId, seller.id)))
      .returning();
    if (!updated) throw new AppError(404, 'Không tìm thấy món', 'NOT_FOUND');
    if (body.optionGroups !== undefined) {
      await replaceOptionGroups(db, itemId, body.optionGroups);
    }
    const { groups, options } = await loadFoodItemExtras(db, [itemId]);
    const extras = mapFoodItemExtras(itemId, groups, options);
    res.json({ data: { ...updated, ...extras } });
  }),
);

sellerRouter.delete(
  '/food-items/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const itemId = paramId(req);
    const db = req.app.locals.db;
    const [item] = await db
      .select({ id: foodItems.id })
      .from(foodItems)
      .where(and(eq(foodItems.id, itemId), eq(foodItems.sellerId, seller.id)))
      .limit(1);
    if (!item) throw new AppError(404, 'Không tìm thấy món', 'NOT_FOUND');
    await db.transaction(async (tx: typeof db) => {
      await tx.delete(cartItems).where(eq(cartItems.foodItemId, itemId));
      await tx.delete(foodItems).where(eq(foodItems.id, itemId));
    });
    res.json({ data: { id: itemId } });
  }),
);

sellerRouter.get(
  '/laundry-services',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const data = await req.app.locals.db
      .select()
      .from(laundryServices)
      .where(eq(laundryServices.sellerId, seller.id));
    res.json({ data });
  }),
);

sellerRouter.post(
  '/laundry-services',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().nullable().optional(),
        unit: z.enum(['kg', 'item', 'load']),
        basePrice: z.number().positive(),
        estimatedTimeHours: z.number().optional(),
        serviceAreas: z.array(z.string()).optional(),
        imageUrl: z.string().nullable().optional(),
      })
      .parse(req.body);
    const imageUrl = assertUploadedImageUrl(body.imageUrl, 'Ảnh dịch vụ');
    const [svc] = await req.app.locals.db
      .insert(laundryServices)
      .values({
        sellerId: seller.id,
        name: body.name,
        description: body.description ?? null,
        unit: body.unit,
        basePrice: String(body.basePrice),
        estimatedTimeHours: body.estimatedTimeHours ?? 24,
        serviceAreas: body.serviceAreas,
        imageUrl,
      })
      .returning();
    res.status(201).json({ data: svc });
  }),
);

sellerRouter.patch(
  '/laundry-services/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        basePrice: z.number().positive().optional(),
        unit: z.enum(['kg', 'item', 'load']).optional(),
        estimatedTimeHours: z.number().int().positive().optional(),
        isAvailable: z.boolean().optional(),
        serviceAreas: z.array(z.string()).optional(),
        imageUrl: z.string().nullable().optional(),
      })
      .parse(req.body);
    const imageUrl =
      body.imageUrl !== undefined ? assertUploadedImageUrl(body.imageUrl, 'Ảnh dịch vụ') : undefined;
    const svcId = paramId(req);
    const [updated] = await req.app.locals.db
      .update(laundryServices)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.basePrice !== undefined && { basePrice: String(body.basePrice) }),
        ...(body.unit !== undefined && { unit: body.unit }),
        ...(body.estimatedTimeHours !== undefined && { estimatedTimeHours: body.estimatedTimeHours }),
        ...(body.isAvailable !== undefined && { isAvailable: body.isAvailable }),
        ...(body.serviceAreas !== undefined && { serviceAreas: body.serviceAreas }),
        ...(imageUrl !== undefined && { imageUrl }),
      })
      .where(and(eq(laundryServices.id, svcId), eq(laundryServices.sellerId, seller.id)))
      .returning();
    if (!updated) throw new AppError(404, 'Không tìm thấy dịch vụ', 'NOT_FOUND');
    res.json({ data: updated });
  }),
);

sellerRouter.delete(
  '/laundry-services/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const svcId = paramId(req);
    const db = req.app.locals.db;
    const [svc] = await db
      .select({ id: laundryServices.id })
      .from(laundryServices)
      .where(and(eq(laundryServices.id, svcId), eq(laundryServices.sellerId, seller.id)))
      .limit(1);
    if (!svc) throw new AppError(404, 'Không tìm thấy dịch vụ', 'NOT_FOUND');
    await db.delete(laundryServices).where(eq(laundryServices.id, svcId));
    res.json({ data: { id: svcId } });
  }),
);

sellerRouter.get(
  '/bank-accounts',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const data = await req.app.locals.db
      .select()
      .from(sellerBankAccounts)
      .where(eq(sellerBankAccounts.sellerId, seller.id));
    res.json({ data });
  }),
);

sellerRouter.post(
  '/bank-accounts',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        bankName: z.string(),
        accountNumber: z.string(),
        accountHolder: z.string(),
        qrImageUrl: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(req.body);
    const qrImageUrl = assertUploadedImageUrl(body.qrImageUrl, 'Ảnh QR ngân hàng');
    if (body.isDefault) {
      await req.app.locals.db
        .update(sellerBankAccounts)
        .set({ isDefault: false })
        .where(eq(sellerBankAccounts.sellerId, seller.id));
    }
    const [acc] = await req.app.locals.db
      .insert(sellerBankAccounts)
      .values({
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        accountHolder: body.accountHolder,
        qrImageUrl,
        isDefault: body.isDefault,
        sellerId: seller.id,
      })
      .returning();
    res.status(201).json({ data: acc });
  }),
);

sellerRouter.patch(
  '/bank-accounts/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const body = z
      .object({
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const accountId = paramId(req);
    const db = req.app.locals.db;

    const [existing] = await db
      .select()
      .from(sellerBankAccounts)
      .where(and(eq(sellerBankAccounts.id, accountId), eq(sellerBankAccounts.sellerId, seller.id)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy tài khoản', 'NOT_FOUND');

    if (body.isDefault === true) {
      await db
        .update(sellerBankAccounts)
        .set({ isDefault: false })
        .where(eq(sellerBankAccounts.sellerId, seller.id));
    }

    const [updated] = await db
      .update(sellerBankAccounts)
      .set({
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      })
      .where(eq(sellerBankAccounts.id, accountId))
      .returning();

    res.json({ data: updated });
  }),
);

sellerRouter.delete(
  '/bank-accounts/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const accountId = paramId(req);
    const db = req.app.locals.db;

    const [existing] = await db
      .select()
      .from(sellerBankAccounts)
      .where(and(eq(sellerBankAccounts.id, accountId), eq(sellerBankAccounts.sellerId, seller.id)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy tài khoản', 'NOT_FOUND');

    await db.delete(sellerBankAccounts).where(eq(sellerBankAccounts.id, accountId));

    // Nếu xóa tài khoản mặc định — chọn tài khoản còn lại làm mặc định
    if (existing.isDefault) {
      const [next] = await db
        .select()
        .from(sellerBankAccounts)
        .where(eq(sellerBankAccounts.sellerId, seller.id))
        .limit(1);
      if (next) {
        await db
          .update(sellerBankAccounts)
          .set({ isDefault: true })
          .where(eq(sellerBankAccounts.id, next.id));
      }
    }

    res.json({ data: { id: accountId } });
  }),
);

const postInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string().min(1)).max(10).optional().nullable(),
  ctaLabel: z.string().max(80).optional().nullable(),
  linkUrl: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || isSafeLinkUrl(v), 'Link không hợp lệ'),
  foodItemId: z.string().uuid().optional().nullable(),
});

sellerRouter.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const seller = await getMySeller(req);
    const data = await req.app.locals.db
      .select()
      .from(posts)
      .where(eq(posts.sellerId, seller.id))
      .orderBy(desc(posts.createdAt));
    res.json({ data });
  }),
);

sellerRouter.post(
  '/posts',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const input = postInputSchema.parse(req.body);
    const urls = assertUploadedImageUrls(
      [
        ...(input.imageUrls ?? []).map((u) => u.trim()).filter(Boolean),
        ...(input.imageUrl?.trim() ? [input.imageUrl.trim()] : []),
      ]
        .filter((u, i, arr) => arr.indexOf(u) === i)
        .slice(0, 10),
      'Ảnh bài đăng',
    );
    let foodItemId: string | null = input.foodItemId ?? null;
    if (foodItemId) {
      const [owned] = await req.app.locals.db
        .select({ id: foodItems.id })
        .from(foodItems)
        .where(and(eq(foodItems.id, foodItemId), eq(foodItems.sellerId, seller.id)))
        .limit(1);
      if (!owned) throw new AppError(400, 'Món gắn bài đăng không thuộc cửa hàng của bạn', 'INVALID_FOOD_ITEM');
    }
    const storeLink =
      seller.serviceTypes === 'ship_proxy'
        ? `/ship/book/${seller.id}`
        : seller.serviceTypes === 'laundry'
          ? '/laundry'
          : `/store/${seller.id}`;
    const [post] = await req.app.locals.db
      .insert(posts)
      .values({
        sellerId: seller.id,
        title: input.title,
        body: input.body ?? null,
        imageUrl: urls[0] ?? null,
        imageUrls: urls,
        ctaLabel: 'Đặt Ngay',
        linkUrl: storeLink,
        foodItemId,
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();
    res.status(201).json({ data: post });
  }),
);

sellerRouter.patch(
  '/posts/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const postId = paramId(req);
    const input = postInputSchema.partial().extend({
      status: z.enum(['published', 'hidden']).optional(),
    }).parse(req.body);

    const [existing] = await req.app.locals.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.sellerId, seller.id)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy bài đăng', 'NOT_FOUND');

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.ctaLabel !== undefined) patch.ctaLabel = input.ctaLabel;
    if (input.linkUrl !== undefined) patch.linkUrl = input.linkUrl;
    if (input.foodItemId !== undefined) {
      if (input.foodItemId) {
        const [owned] = await req.app.locals.db
          .select({ id: foodItems.id })
          .from(foodItems)
          .where(and(eq(foodItems.id, input.foodItemId), eq(foodItems.sellerId, seller.id)))
          .limit(1);
        if (!owned) throw new AppError(400, 'Món gắn bài đăng không thuộc cửa hàng của bạn', 'INVALID_FOOD_ITEM');
        patch.foodItemId = input.foodItemId;
      } else {
        patch.foodItemId = null;
      }
    }
    if (input.status !== undefined) patch.status = input.status;
    if (input.imageUrls !== undefined || input.imageUrl !== undefined) {
      const merged = (input.imageUrls ?? existing.imageUrls ?? [])
        .map((u: string) => u.trim())
        .filter(Boolean)
        .slice(0, 10);
      const single = input.imageUrl !== undefined ? input.imageUrl : null;
      if (single?.trim() && !merged.includes(single.trim())) merged.unshift(single.trim());
      const urls = assertUploadedImageUrls(merged, 'Ảnh bài đăng');
      patch.imageUrls = urls;
      patch.imageUrl = urls[0] ?? null;
    }
    if (input.status === 'published' && existing.status !== 'published') {
      patch.publishedAt = new Date();
    }

    const [updated] = await req.app.locals.db
      .update(posts)
      .set(patch)
      .where(eq(posts.id, postId))
      .returning();
    res.json({ data: updated });
  }),
);

sellerRouter.delete(
  '/posts/:id',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const postId = paramId(req);
    const [existing] = await req.app.locals.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.sellerId, seller.id)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Không tìm thấy bài đăng', 'NOT_FOUND');
    await req.app.locals.db.delete(posts).where(eq(posts.id, postId));
    res.json({ data: { id: postId } });
  }),
);

sellerRouter.get(
  '/complaints',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const rows = await req.app.locals.db
      .select({
        complaint: complaints,
        buyerName: profiles.fullName,
        buyerEmail: profiles.email,
        buyerPhone: profiles.phone,
      })
      .from(complaints)
      .innerJoin(profiles, eq(complaints.buyerId, profiles.id))
      .where(eq(complaints.sellerId, seller.id))
      .orderBy(desc(complaints.createdAt));
    res.json({
      data: rows.map((row: (typeof rows)[number]) => ({
        ...row.complaint,
        buyer: {
          id: row.complaint.buyerId,
          fullName: row.buyerName,
          email: row.buyerEmail,
          phone: row.buyerPhone,
        },
      })),
    });
  }),
);

sellerRouter.get(
  '/complaints/:id/messages',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const complaintId = paramId(req);
    const [complaint] = await req.app.locals.db
      .select()
      .from(complaints)
      .where(and(eq(complaints.id, complaintId), eq(complaints.sellerId, seller.id)))
      .limit(1);
    if (!complaint) throw new AppError(404, 'Không tìm thấy khiếu nại', 'NOT_FOUND');
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

sellerRouter.post(
  '/complaints/:id/messages',
  requireApprovedSeller,
  asyncHandler(async (req, res) => {
    const seller = (req as Request & { seller: Awaited<ReturnType<typeof getMySeller>> }).seller;
    const complaintId = paramId(req);
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const db = req.app.locals.db;
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(and(eq(complaints.id, complaintId), eq(complaints.sellerId, seller.id)))
      .limit(1);
    if (!complaint) throw new AppError(404, 'Không tìm thấy khiếu nại', 'NOT_FOUND');
    if (complaint.status === 'resolved' || complaint.status === 'rejected') {
      throw new AppError(400, 'Khiếu nại đã đóng, không thể nhắn thêm', 'COMPLAINT_CLOSED');
    }
    const [message] = await db
      .insert(complaintMessages)
      .values({
        complaintId: complaint.id,
        authorId: req.user!.id,
        authorRole: 'seller',
        body,
      })
      .returning();
    if (complaint.status === 'waiting_seller' || complaint.status === 'new') {
      await db
        .update(complaints)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(complaints.id, complaint.id));
    } else {
      await db
        .update(complaints)
        .set({ updatedAt: new Date() })
        .where(eq(complaints.id, complaint.id));
    }
    res.status(201).json({ data: message });
  }),
);
