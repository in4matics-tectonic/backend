import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireKlantAccess } from '../auth.js';
import { Bron, MCP_FASE_GEWICHT, MomentId } from '../domain.js';
import { store } from '../store.js';

const KlantParams = z.object({ klantId: z.string().max(32) });
const MomentParams = KlantParams.extend({ moment: MomentId });
const tags = (t: string) => ({ security: [{ bearer: [] }], tags: [t] });

const NUTTIGE_INFO: Partial<Record<MomentId, string[]>> = {
  GEZINSUITBREIDING: [
    'Groeipakket aanvragen kan vanaf 6 maanden zwangerschap',
    'Een kindje meeverzekeren in je hospitalisatie gebeurt best vóór de geboorte',
  ],
};

export const momentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);

  /** Moments as seen by the caller. Customers never see sensitive signal labels or actions before confirming. */
  function momentenVoor(role: string, klantId: string) {
    const signalen = store.signalen(klantId);
    return store.momenten(klantId).map((m) => {
      if (role !== 'klant') return { ...m, signalenDetail: signalen.filter((s) => m.signalen.includes(s.id)) };
      const eigen = signalen.filter((s) => m.signalen.includes(s.id));
      return {
        moment: m.moment,
        score: m.score,
        fase: m.fase,
        bevestigd: m.bevestigd,
        acties: m.fase === 'voorstel' ? m.acties : [],
        waarom: eigen.filter((s) => !s.gevoelig).map((s) => s.label),
        andereSignalen: eigen.filter((s) => s.gevoelig).length, // "en andere signalen waarvoor je toestemming gaf"
      };
    });
  }

  // ---- Signals (ingestion) ----

  app.post(
    '/klanten/:klantId/signalen',
    {
      preHandler: requireKlantAccess('ingest', 'adviseur'),
      schema: {
        ...tags('signalen'),
        params: KlantParams,
        body: z
          .object({
            bron: Bron,
            moment: MomentId,
            gewicht: z.number().min(-1).max(1),
            label: z.string().min(1).max(200),
            gevoelig: z.boolean().default(false),
            week: z.number().int().min(0).max(520).optional(),
          })
          .strict(),
      },
    },
    async (req, reply) => {
      const klant = store.klant(req.params.klantId)!;
      // No consent for this source: drop it, don't store it
      if (!klant.toestemming[req.body.bron]) {
        store.log(req.user.sub, 'signaal_geweigerd', klant.id, req.body.bron);
        return reply.code(422).send({ error: 'no_consent', bron: req.body.bron });
      }
      const signaal = store.addSignaal(klant.id, req.body);
      store.log(req.user.sub, 'signaal_ontvangen', klant.id, `${signaal.bron}/${signaal.moment}`);
      return reply.code(201).send(signaal);
    },
  );

  app.get(
    '/klanten/:klantId/signalen',
    { preHandler: requireKlantAccess('klant', 'adviseur'), schema: { ...tags('signalen'), params: KlantParams } },
    async (req) => {
      const signalen = store.signalen(req.params.klantId);
      if (req.user.role !== 'klant') {
        store.log(req.user.sub, 'read_signalen', req.params.klantId);
        return signalen;
      }
      return signalen.filter((s) => !s.gevoelig).map(({ id, week, bron, moment, label }) => ({ id, week, bron, moment, label }));
    },
  );

  // ---- Moments (output) ----

  app.get(
    '/klanten/:klantId/momenten',
    { preHandler: requireKlantAccess('klant', 'adviseur'), schema: { ...tags('momenten'), params: KlantParams } },
    async (req) => ({ week: store.week, momenten: momentenVoor(req.user.role, req.params.klantId) }),
  );

  app.get(
    '/klanten/:klantId/momenten/:moment',
    { preHandler: requireKlantAccess('klant', 'adviseur'), schema: { ...tags('momenten'), params: MomentParams } },
    async (req, reply) => {
      const m = momentenVoor(req.user.role, req.params.klantId).find((x) => x.moment === req.params.moment);
      return m ?? reply.code(404).send({ error: 'not_found' });
    },
  );

  // Customer taps "Ja, klopt"
  app.post(
    '/klanten/:klantId/momenten/:moment/bevestig',
    { preHandler: requireKlantAccess('klant'), schema: { ...tags('momenten'), params: MomentParams } },
    async (req) => {
      store.bevestig(req.params.klantId, req.params.moment);
      store.log(req.user.sub, 'moment_bevestigd', req.params.klantId, req.params.moment);
      return momentenVoor('klant', req.params.klantId).find((x) => x.moment === req.params.moment) ?? null;
    },
  );

  // "Niet voor ons" / MCP revoke_moment: wipes the signals of that moment
  app.delete(
    '/klanten/:klantId/momenten/:moment',
    { preHandler: requireKlantAccess('klant'), schema: { ...tags('momenten'), params: MomentParams } },
    async (req) => {
      const verwijderd = store.revokeMoment(req.params.klantId, req.params.moment);
      store.log(req.user.sub, 'moment_ingetrokken', req.params.klantId, req.params.moment);
      return { status: 'ingetrokken', verwijderdeSignalen: verwijderd };
    },
  );

  // MCP share_life_moment: the customer's own AI shares a moment + phase, never the conversation
  app.post(
    '/klanten/:klantId/momenten/delen',
    {
      preHandler: requireKlantAccess('klant'),
      schema: {
        ...tags('mcp'),
        params: KlantParams,
        body: z
          .object({
            moment: MomentId,
            fase: z.enum(['orienterend', 'plannend', 'beslist']),
            verwachte_maand: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          })
          .strict(),
      },
    },
    async (req, reply) => {
      const klant = store.klant(req.params.klantId)!;
      if (!klant.toestemming.EIGEN_AI) return reply.code(422).send({ error: 'no_consent', bron: 'EIGEN_AI' });
      const signaal = store.addSignaal(klant.id, {
        bron: 'EIGEN_AI',
        moment: req.body.moment,
        gewicht: MCP_FASE_GEWICHT[req.body.fase],
        label: `Moment gedeeld via eigen AI (${req.body.fase})`,
        gevoelig: false,
      });
      store.log(req.user.sub, 'moment_gedeeld', klant.id, `${req.body.moment}/${req.body.fase}`);
      return reply.code(201).send({
        status: 'ontvangen',
        signaal_id: signaal.id,
        boodschap_voor_klant: 'Bedankt om dit te delen. Kate zet in KBC Mobile klaar wat je nodig hebt. Je kan dit altijd intrekken.',
        nuttige_info: NUTTIGE_INFO[req.body.moment] ?? [],
      });
    },
  );
};
