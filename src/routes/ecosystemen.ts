// KBC ecosystems and partners: the catalogue (same for everyone) and per customer the partner relations,
// data sharing per partner, and the ecosystem clusters (active, known and possible links).
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireKlantAccess, requireRole } from '../auth.js';
import { ECOSYSTEMEN, PARTNERS, PRODUCTEN, type EcosysteemId, type PartnerId } from '../catalogus.js';
import { PARTNER_INFO } from '../ecosysteem.js';
import { store } from '../store.js';

const EcosysteemIdSchema = z.enum(Object.keys(ECOSYSTEMEN) as [EcosysteemId, ...EcosysteemId[]]);
const PartnerIdSchema = z.enum(Object.keys(PARTNERS) as [PartnerId, ...PartnerId[]]);
const KlantParams = z.object({ klantId: z.string().max(32) });
const tags = (t: string) => ({ security: [{ bearer: [] }], tags: [t] });

const ecosysteemKort = (id: EcosysteemId) => ({
  id,
  naam: ECOSYSTEMEN[id],
  aantalProducten: PRODUCTEN.filter((p) => p.ecosysteem === id).length,
  partners: PARTNER_INFO.filter((p) => p.ecosystemen.includes(id)).map((p) => p.id),
});

export const ecosysteemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);

  // ---- Catalogue: no personal data, so no audit entry ----
  const catalogus = requireRole('klant', 'adviseur');

  app.get('/catalogus', { preHandler: catalogus, schema: { ...tags('catalogus'), description: 'Every ecosystem, product and partner in one call (cache it client-side).' } }, async () => ({
    ecosystemen: (Object.keys(ECOSYSTEMEN) as EcosysteemId[]).map(ecosysteemKort),
    producten: PRODUCTEN,
    partners: PARTNER_INFO,
  }));

  app.get('/ecosystemen', { preHandler: catalogus, schema: tags('catalogus') }, async () =>
    (Object.keys(ECOSYSTEMEN) as EcosysteemId[]).map(ecosysteemKort),
  );

  app.get(
    '/ecosystemen/:ecosysteem',
    { preHandler: catalogus, schema: { ...tags('catalogus'), params: z.object({ ecosysteem: EcosysteemIdSchema }) } },
    async (req) => ({
      ...ecosysteemKort(req.params.ecosysteem),
      producten: PRODUCTEN.filter((p) => p.ecosysteem === req.params.ecosysteem),
    }),
  );

  app.get('/partners', { preHandler: catalogus, schema: tags('catalogus') }, async () => PARTNER_INFO);

  // ---- Per customer ----

  /** Every partner with the customer's relation to it, for the "which partners may share with KBC" screen. */
  function partnersVan(klantId: string) {
    const relaties = store.partnerRelaties(klantId);
    const klant = store.klant(klantId)!;
    return PARTNER_INFO.map((p) => {
      const r = relaties.find((x) => x.partner === p.id);
      // A relation KBC saw through a source without consent doesn't count as known
      const zichtbaar = r && (r.herkomst === 'KLANT' || klant.toestemming[r.herkomst === 'REKENING' ? 'REKENING' : 'APP']);
      return {
        partner: p.id,
        naam: p.naam,
        ecosysteem: p.ecosysteem,
        gevoelig: p.gevoelig,
        klantBijPartner: !!zichtbaar,
        deelt: !!zichtbaar && r!.deelt,
        herkomst: zichtbaar ? r!.herkomst : null,
        sinds: zichtbaar ? r!.sinds : null,
      };
    });
  }

  app.get(
    '/klanten/:klantId/partners',
    { preHandler: requireKlantAccess('klant', 'adviseur'), schema: { ...tags('ecosystemen'), params: KlantParams } },
    async (req) => {
      store.log(req.user.sub, 'read_partners', req.params.klantId);
      return partnersVan(req.params.klantId);
    },
  );

  // Only the customer decides which partner may share data with KBC
  app.put(
    '/klanten/:klantId/partners/:partner',
    {
      preHandler: requireKlantAccess('klant'),
      schema: {
        ...tags('ecosystemen'),
        params: KlantParams.extend({ partner: PartnerIdSchema }),
        body: z.object({ deelt: z.boolean() }).strict(),
      },
    },
    async (req, reply) => {
      const { klantId, partner } = req.params;
      if (PARTNER_INFO.find((p) => p.id === partner)!.gevoelig && req.body.deelt) {
        return reply.code(422).send({ error: 'gevoelige_partner', partner });
      }
      store.zetDeling(klantId, partner, req.body.deelt);
      store.log(req.user.sub, req.body.deelt ? 'partner_deling_aan' : 'partner_deling_uit', klantId, partner);
      return partnersVan(klantId).find((p) => p.partner === partner);
    },
  );

  app.get(
    '/klanten/:klantId/ecosystemen',
    { preHandler: requireKlantAccess('klant', 'adviseur'), schema: { ...tags('ecosystemen'), params: KlantParams } },
    async (req) => {
      store.log(req.user.sub, 'read_ecosystemen', req.params.klantId);
      const { clusters, verbanden } = store.ecosystemen(req.params.klantId);
      const links = clusters.flatMap((c) => c.links);
      const tel = (s: string) => links.filter((l) => l.status === s).length;
      return {
        week: store.week,
        samenvatting: {
          actief: tel('actief'),
          gekend: tel('gekend'),
          mogelijk: tel('mogelijk'),
          ecosystemen: clusters.length,
          nieuweEcosystemen: clusters.filter((c) => c.status === 'mogelijk').map((c) => c.ecosysteem),
        },
        clusters,
        verbanden,
      };
    },
  );
};
