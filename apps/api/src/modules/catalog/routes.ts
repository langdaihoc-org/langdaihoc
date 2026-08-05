import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { categories } from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { setPublicCatalogCache } from '../../lib/http-cache.js';
import {
  getFoodCatalog,
  getFoodItemPublic,
  getLaundryCatalog,
  getApprovedSellers,
  getApprovedSellerById,
  getSellerRatingsMap,
  getActiveBanners,
  getSellerReviews,
  getPublishedPosts,
  getPublishedPostById,
} from '../../services/commerce.js';

export const catalogRouter = Router();

/** Một round-trip cho trang chủ — giảm latency cold/cross-region. */
catalogRouter.get(
  '/home',
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const [foodResult, foodSellers, laundry, categoryRows, allBanners] = await Promise.all([
      getFoodCatalog(db, { limit: 8, page: 1 }),
      getApprovedSellers(db, 'food', { limit: 4 }),
      getLaundryCatalog(db, undefined, { limit: 6 }),
      db
        .select()
        .from(categories)
        .where(and(eq(categories.isActive, true), eq(categories.type, 'food'))),
      getActiveBanners(db),
    ]);

    const sellerIds = foodSellers.map((s) => s.id);
    const ratings = await getSellerRatingsMap(db, sellerIds);
    const sellers = foodSellers.map((s) => ({
      ...s,
      rating: ratings.get(s.id) ?? { average: 0, count: 0 },
    }));

    setPublicCatalogCache(res, 60);
    res.json({
      data: {
        food: foodResult.data,
        sellers,
        laundry,
        categories: categoryRows,
        banners: allBanners.filter((b) => !b.isPopup),
        popupBanners: allBanners.filter((b) => b.isPopup),
      },
    });
  }),
);

catalogRouter.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const popup = req.query.popup;
    const popupOnly =
      popup === '1' || popup === 'true' ? true : popup === '0' || popup === 'false' ? false : undefined;
    const data = await getActiveBanners(req.app.locals.db, { popupOnly });
    setPublicCatalogCache(res, 60);
    res.json({ data });
  }),
);

catalogRouter.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 30, 50) : 30;
    const data = await getPublishedPosts(req.app.locals.db, limit);
    setPublicCatalogCache(res, 30);
    res.json({ data });
  }),
);

catalogRouter.get(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const data = await getPublishedPostById(req.app.locals.db, String(req.params.id));
    if (!data) throw new AppError(404, 'Không tìm thấy bài đăng', 'NOT_FOUND');
    setPublicCatalogCache(res, 30);
    res.json({ data });
  }),
);

catalogRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const type = req.query.type as string | undefined;
    const db = req.app.locals.db;
    const conditions = [eq(categories.isActive, true)];
    if (type === 'food' || type === 'laundry') conditions.push(eq(categories.type, type));
    const rows = await db.select().from(categories).where(and(...conditions));
    setPublicCatalogCache(res, 120);
    res.json({ data: rows });
  }),
);

catalogRouter.get(
  '/sellers',
  asyncHandler(async (req, res) => {
    const serviceType = req.query.serviceType as 'food' | 'laundry' | 'ship_proxy' | undefined;
    const sellers = await getApprovedSellers(req.app.locals.db, serviceType);
    const ratings = await getSellerRatingsMap(
      req.app.locals.db,
      sellers.map((s) => s.id),
    );
    const withRating = sellers.map((s) => ({
      ...s,
      rating: ratings.get(s.id) ?? { average: 0, count: 0 },
    }));
    setPublicCatalogCache(res, 60);
    res.json({ data: withRating });
  }),
);

catalogRouter.get(
  '/sellers/:id',
  asyncHandler(async (req, res) => {
    const sellerId = String(req.params.id);
    const seller = await getApprovedSellerById(req.app.locals.db, sellerId);
    if (!seller) throw new AppError(404, 'Không tìm thấy cửa hàng', 'NOT_FOUND');
    const ratings = await getSellerRatingsMap(req.app.locals.db, [seller.id]);
    setPublicCatalogCache(res, 60);
    res.json({
      data: {
        ...seller,
        rating: ratings.get(seller.id) ?? { average: 0, count: 0 },
      },
    });
  }),
);

catalogRouter.get(
  '/food',
  asyncHandler(async (req, res) => {
    const sellerId = req.query.sellerId as string | undefined;
    const category = req.query.category as string | undefined;
    const q = req.query.q as string | undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await getFoodCatalog(req.app.locals.db, {
      sellerId,
      categorySlug: category,
      q,
      page,
      limit,
    });
    // Search/q đổi nhanh — cache ngắn hơn; listing thường thì 60s
    setPublicCatalogCache(res, q ? 15 : 60);
    res.json(result);
  }),
);

catalogRouter.get(
  '/food/:id',
  asyncHandler(async (req, res) => {
    const data = await getFoodItemPublic(req.app.locals.db, String(req.params.id));
    if (!data) throw new AppError(404, 'Không tìm thấy món', 'NOT_FOUND');
    setPublicCatalogCache(res, 30);
    res.json({ data });
  }),
);

catalogRouter.get(
  '/laundry',
  asyncHandler(async (req, res) => {
    const sellerId = req.query.sellerId as string | undefined;
    const data = await getLaundryCatalog(req.app.locals.db, sellerId);
    setPublicCatalogCache(res, 60);
    res.json({ data });
  }),
);

catalogRouter.get(
  '/sellers/:id/reviews',
  asyncHandler(async (req, res) => {
    const data = await getSellerReviews(req.app.locals.db, String(req.params.id));
    setPublicCatalogCache(res, 60);
    res.json({ data });
  }),
);
