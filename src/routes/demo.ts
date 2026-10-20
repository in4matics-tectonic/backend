// Demo controls for the pitch ("Speel af", "Volgende", "Reset"). Only mounted when DEMO_MODE=true.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth.js';
import { DemoStatus, fouten, Week } from '../schemas.js';
import { store } from '../store.js';

export const DEMO_WEKEN = [7, 10, 12, 14, 16, 18, 20];
const secured = { security: [{ bearer: [] }], tags: ['demo'] };
const schema = { ...secured, response: { 200: Week, ...fouten(401, 403) } };

export const demoRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);
  app.addHook('preHandler', requireRole('adviseur'));

  app.get('/demo', { schema: { ...secured, response: { 200: DemoStatus, ...fouten(401, 403) } } }, async () => ({ week: store.week, weken: DEMO_WEKEN }));

  app.post('/demo/volgende', { schema }, async () => {
    const next = DEMO_WEKEN.find((w) => w > store.week) ?? store.week;
    store.setWeek(next);
    return { week: next };
  });

  app.post('/demo/week', { schema: { ...secured, body: z.object({ week: z.number().int().min(0).max(520) }).strict(), response: { 200: Week, ...fouten(400, 401, 403) } } }, async (req) => {
    store.setWeek(req.body.week);
    return { week: store.week };
  });

  app.post('/demo/reset', { schema }, async (req) => {
    store.reset();
    store.log(req.user.sub, 'demo_reset');
    return { week: store.week };
  });
};
