import { Router } from 'express';
import { profiles } from '@langdaihoc/database';
import { asyncHandler } from '../../middleware/error-handler.js';

export const healthRouter = Router();

/** Liveness — process còn sống. */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'langdaihoc-api', timestamp: new Date().toISOString() });
});

/** Readiness — DB reachable. */
healthRouter.get(
  '/ready',
  asyncHandler(async (req, res) => {
    await req.app.locals.db.select({ id: profiles.id }).from(profiles).limit(1);
    res.json({ status: 'ready', service: 'langdaihoc-api', timestamp: new Date().toISOString() });
  }),
);
