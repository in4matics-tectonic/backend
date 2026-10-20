// Kansen: an adviser sends one of a customer's possible links (an ecosystem suggestion) to KBC Mobile, where the
// customer sees it as a new opportunity and can answer it. Only a link that is `mogelijk` right now can be sent,
// once; the score and reasons come from the cluster engine, never from the adviser or the app.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireKlantAccess } from '../auth.js';
import { fouten, Kans, KansAdviseur, KansStatus } from '../schemas.js';
import { store, type Kans as KansType } from '../store.js';

const KlantParams = z.object({ klantId: z.string().max(32) });
const tags = { security: [{ bearer: [] }], tags: ['kansen'] };

/** The customer doesn't see the score or who sent it. */
const voorKlant = ({ id, link, waarom, bericht, status, verstuurdOp, bijgewerktOp }: KansType) => ({ id, link, waarom, bericht, status, verstuurdOp, bijgewerktOp });

export const kansRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);

  app.get(
    '/klanten/:klantId/kansen',
    {
      preHandler: requireKlantAccess('klant', 'adviseur'),
      schema: {
        ...tags,
        description: 'Opportunities sent to this customer, newest first. The app shows the ones with status `nieuw`.',
        params: KlantParams,
        response: { 200: z.array(Kans), ...fouten(400, 401, 403, 404) },
      },
    },
    async (req) => {
      store.log(req.user.sub, 'read_kansen', req.params.klantId);
      const kansen = store.kansen(req.params.klantId);
      return req.user.role === 'klant' ? kansen.map(voorKlant) : kansen;
    },
  );

  app.post(
    '/klanten/:klantId/kansen',
    {
      preHandler: requireKlantAccess('adviseur'),
      schema: {
        ...tags,
        description: 'Send a possible link to the customer\'s app. 422 `geen_mogelijke_link` when the link isn\'t `mogelijk` (anymore), `al_verstuurd` when it was sent before.',
        params: KlantParams,
        body: z.object({ link: z.string().max(120), bericht: z.string().trim().min(1).max(280).optional() }).strict(),
        response: { 201: KansAdviseur, ...fouten(400, 401, 403, 404, 422) },
      },
    },
    async (req, reply) => {
      const { klantId } = req.params;
      const { clusters } = store.ecosystemen(klantId);
      const cluster = clusters.find((c) => c.links.some((l) => l.id === req.body.link));
      const link = cluster?.links.find((l) => l.id === req.body.link);
      if (!cluster || !link || link.status !== 'mogelijk') return reply.code(422).send({ error: 'geen_mogelijke_link' });
      if (store.kansen(klantId).some((k) => k.link.id === link.id)) return reply.code(422).send({ error: 'al_verstuurd' });

      const kans = store.addKans({
        klantId,
        link: { id: link.id, soort: link.soort, ref: link.ref, naam: link.naam, ecosysteem: link.ecosysteem, ecosysteemNaam: cluster.naam },
        score: link.score ?? 0,
        waarom: [...new Set((link.waarom ?? []).map((w) => w.reden))],
        bericht: req.body.bericht ?? null,
        verstuurdDoor: req.user.sub,
      });
      store.log(req.user.sub, 'kans_verstuurd', klantId, link.id);
      return reply.code(201).send(kans);
    },
  );

  // The customer answers in the app (or the app marks it shown)
  app.put(
    '/klanten/:klantId/kansen/:kansId',
    {
      preHandler: requireKlantAccess('klant'),
      schema: {
        ...tags,
        params: KlantParams.extend({ kansId: z.string().max(64) }),
        body: z.object({ status: KansStatus.exclude(['nieuw']) }).strict(),
        response: { 200: Kans, ...fouten(400, 401, 403, 404) },
      },
    },
    async (req, reply) => {
      const kans = store.zetKansStatus(req.params.klantId, req.params.kansId, req.body.status);
      if (!kans) return reply.code(404).send({ error: 'not_found' });
      store.log(req.user.sub, `kans_${req.body.status}`, req.params.klantId, kans.link.id);
      return voorKlant(kans);
    },
  );
};
