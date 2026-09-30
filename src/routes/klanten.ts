import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireKlantAccess, requireRole } from '../auth.js';
import { Bron } from '../domain.js';
import { PRODUCT_NAMEN } from '../seed.js';
import { store } from '../store.js';

const KlantParams = z.object({ klantId: z.string().max(32) });
const secured = { security: [{ bearer: [] }], tags: ['klanten'] };

export const klantRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);
  const read = requireKlantAccess('klant', 'adviseur');

  app.get('/klanten', { preHandler: requireRole('adviseur'), schema: secured }, async (req) => {
    store.log(req.user.sub, 'list_klanten');
    return store.klanten().map((k) => ({ id: k.id, naam: k.naam }));
  });

  app.get('/klanten/:klantId', { preHandler: read, schema: { ...secured, params: KlantParams } }, async (req) => {
    store.log(req.user.sub, 'read_klant', req.params.klantId);
    return store.klant(req.params.klantId);
  });

  app.get('/klanten/:klantId/rekeningen', { preHandler: read, schema: { ...secured, params: KlantParams } }, async (req) => {
    store.log(req.user.sub, 'read_rekeningen', req.params.klantId);
    return store.rekeningen(req.params.klantId);
  });

  app.get(
    '/klanten/:klantId/transacties',
    {
      preHandler: read,
      schema: {
        ...secured,
        params: KlantParams,
        querystring: z.object({ rekeningId: z.string().max(32).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
      },
    },
    async (req) => {
      store.log(req.user.sub, 'read_transacties', req.params.klantId);
      return store.transacties(req.params.klantId, req.query.rekeningId).slice(0, req.query.limit);
    },
  );

  app.get('/klanten/:klantId/producten', { preHandler: read, schema: { ...secured, params: KlantParams } }, async (req) => {
    return store.klant(req.params.klantId)!.producten.map((code) => ({ code, naam: PRODUCT_NAMEN[code] ?? code }));
  });

  app.get('/klanten/:klantId/documenten', { preHandler: read, schema: { ...secured, params: KlantParams } }, async (req) => {
    store.log(req.user.sub, 'read_documenten', req.params.klantId);
    return store.documenten(req.params.klantId);
  });

  // Consent ('Op jouw maat'): only the customer can change it
  app.put(
    '/klanten/:klantId/toestemming',
    {
      preHandler: requireKlantAccess('klant'),
      schema: { ...secured, params: KlantParams, body: z.record(Bron, z.boolean()) },
    },
    async (req) => {
      const klant = store.klant(req.params.klantId)!;
      Object.assign(klant.toestemming, req.body);
      store.log(req.user.sub, 'update_toestemming', klant.id, JSON.stringify(req.body));
      return klant.toestemming;
    },
  );
};
