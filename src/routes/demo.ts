// Demo controls for the pitch ("Speel af", "Volgende", "Reset"). Only mounted when DEMO_MODE=true.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth.js';
import { store } from '../store.js';

export const DEMO_WEKEN = [7, 10, 12, 14, 16, 18, 20];
const schema = { security: [{ bearer: [] }], tags: ['demo'] };

export const demoRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);
  app.addHook('preHandler', requireRole('adviseur'));

  app.get('/demo', { schema }, async () => ({ week: store.week, weken: DEMO_WEKEN }));

  app.post('/demo/volgende', { schema }, async () => {
    const next = DEMO_WEKEN.find((w) => w > store.week) ?? store.week;
    store.setWeek(next);
    return { week: next };
  });

  app.post('/demo/week', { schema: { ...schema, body: z.object({ week: z.number().int().min(0).max(520) }).strict() } }, async (req) => {
    store.setWeek(req.body.week);
    return { week: store.week };
  });

  app.post('/demo/reset', { schema }, async (req) => {
    store.reset();
    store.log(req.user.sub, 'demo_reset');
    return { week: store.week };
  });
};
