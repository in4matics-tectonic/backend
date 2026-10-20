// Ecosystem clusters: per customer, one cluster per KBC ecosystem with three kinds of links.
//   actief   – a KBC product the customer holds, or a partner the customer lets share data with KBC
//   gekend   – a partner relation KBC knows about from its own data, without data sharing
//   mogelijk – a product or partner the customer might need, derived from the links above by fixed rules
// Like the moment score this is deterministic and computed here; frontends and LLMs only display it.
import { ECOSYSTEMEN, PARTNERS, PRODUCTEN, type EcosysteemId, type PartnerId } from './catalogus.js';
import type { Bron, MomentId } from './domain.js';

export type LinkStatus = 'actief' | 'gekend' | 'mogelijk';
/** Node ids in the graph: a catalogue product or a partner. */
export type NodeId = `product:${string}` | `partner:${string}`;

/**
 * How KBC knows the customer is a client of a partner. Every origin needs consent for the matching source,
 * so a relation seen on the account without 'REKENING' consent simply doesn't exist for the engine.
 */
export type Herkomst = 'REKENING' | 'KBC_MOBILE' | 'KLANT';
const HERKOMST_BRON: Record<Herkomst, Bron | null> = { REKENING: 'REKENING', KBC_MOBILE: 'APP', KLANT: null };

export interface PartnerRelatie {
  partner: PartnerId;
  herkomst: Herkomst;
  deelt: boolean; // customer allows this partner to share data with KBC
  sinds: string; // YYYY-MM-DD
}

/**
 * Health-related partners: never inferred from account data, never offered, never used as input for
 * other suggestions, and customers can't switch on data sharing with them.
 */
export const GEVOELIGE_PARTNERS: readonly PartnerId[] = ['helena', 'leadlife', 'kom-op-tegen-kanker'];

const PRODUCT = new Map(PRODUCTEN.map((p) => [p.id, p]));

/** Home ecosystem of a partner: the one of its first product, unless the customer side sits elsewhere. */
const PARTNER_ECOSYSTEEM_OVERRIDE: Partial<Record<PartnerId, EcosysteemId>> = { joyn: 'WINKELEN', bancontact: 'ONDERNEMEN' };
export const PARTNER_INFO = (Object.keys(PARTNERS) as PartnerId[]).map((id) => {
  const producten = PRODUCTEN.filter((p) => p.partners.includes(id));
  return {
    id,
    naam: PARTNERS[id],
    ecosysteem: PARTNER_ECOSYSTEEM_OVERRIDE[id] ?? producten[0]!.ecosysteem,
    ecosystemen: [...new Set(producten.map((p) => p.ecosysteem))],
    producten: producten.map((p) => p.id),
    gevoelig: GEVOELIGE_PARTNERS.includes(id),
  };
});
const PARTNER = new Map(PARTNER_INFO.map((p) => [p.id, p]));

// ---- Rules: "who has X, often also needs Y" ----

type Van = NodeId | `moment:${MomentId}`;
interface Regel { van: Van; naar: [NodeId, number][]; reden: string }

/** Weight factor per status of the link a rule starts from: KBC only knows *that* a known relation exists. */
const STATUS_FACTOR = { actief: 1, gekend: 0.5 } as const;
/** Below this a suggestion isn't shown. */
export const MOGELIJK_DREMPEL = 0.25;

export const REGELS: Regel[] = [
  // Wonen
  { van: 'product:home-loan', reden: 'Een woonkrediet loopt vaak samen met verbouwen en energiezuinig wonen', naar: [
    ['product:outstanding-balance-insurance', 0.55], ['product:energy-loan', 0.4], ['product:renovation-loan', 0.3],
    ['partner:setle', 0.35], ['product:myhome', 0.3], ['product:calculate-solar-panels-and-request-a-quote', 0.35],
    ['product:energy-consumption-and-saving-tips', 0.3], ['product:life-insurance', 0.35], ['product:pension-savings-fund', 0.2],
  ] },
  { van: 'product:home-insurance', reden: 'Bij een woonverzekering hoort hulp bij pech in huis', naar: [['product:home-assistance-insurance', 0.4]] },
  { van: 'partner:setle', reden: 'Renovatiekosten en premies geschat via Setle', naar: [
    ['product:renovation-loan', 0.5], ['product:energy-loan', 0.45], ['partner:impact-us-today', 0.4],
  ] },
  { van: 'partner:impact-us-today', reden: 'Offerte gevraagd voor energiewerken', naar: [
    ['product:energy-loan', 0.4], ['product:calculate-a-home-battery-and-request-a-quote', 0.3],
  ] },
  { van: 'partner:immoscoop', reden: 'Op zoek naar een woning via Immoscoop', naar: [
    ['product:calculate-housing-budget', 0.5], ['product:home-loan', 0.45], ['product:indicative-online-property-valuation', 0.35],
    ['partner:de-immowinkel', 0.3],
  ] },
  { van: 'product:rental-guarantee', reden: 'Huurders denken vaak aan een eigen woning', naar: [['partner:immoscoop', 0.25], ['product:calculate-housing-budget', 0.3]] },
  { van: 'moment:HUIS_KOPEN', reden: 'Levensmoment huis kopen, bevestigd door de klant', naar: [
    ['product:home-loan', 0.6], ['product:calculate-housing-budget', 0.6], ['partner:immoscoop', 0.5],
    ['product:home-insurance', 0.5], ['partner:de-immowinkel', 0.4],
  ] },

  // Mobiliteit
  { van: 'product:car-insurance', reden: 'Een autoverzekering wijst op een eigen wagen', naar: [
    ['product:electric-car-loan', 0.3], ['partner:vab', 0.3], ['product:calculate-monthly-car-costs', 0.3],
  ] },
  { van: 'partner:q8', reden: 'Tankt via Q8 in KBC Mobile', naar: [['product:calculate-monthly-car-costs', 0.35], ['partner:vab', 0.25], ['product:electric-car-loan', 0.2]] },
  { van: 'partner:cambio', reden: 'Deelt auto’s via Cambio', naar: [['partner:nmbs', 0.3], ['partner:blue-bike', 0.35]] },
  { van: 'partner:nmbs', reden: 'Reist met de trein', naar: [['partner:blue-bike', 0.45], ['partner:de-lijn', 0.35], ['product:bicycle-insurance', 0.2]] },
  { van: 'partner:de-lijn', reden: 'Reist met bus en tram', naar: [['partner:nmbs', 0.35], ['partner:mobit', 0.3]] },
  { van: 'partner:velo-antwerpen', reden: 'Fietst met deelfietsen', naar: [['product:bicycle-insurance', 0.4], ['product:bicycle-scooter-or-motorcycle-loan', 0.3]] },
  { van: 'partner:vab', reden: 'Lid van VAB', naar: [['product:car-insurance', 0.35], ['product:travel-insurance', 0.25]] },
  { van: 'product:electric-car-loan', reden: 'Elektrisch rijden en thuis laden', naar: [
    ['product:electric-car-insurance', 0.6], ['product:calculate-solar-panels-and-request-a-quote', 0.35],
    ['product:calculate-a-home-battery-and-request-a-quote', 0.35],
  ] },
  { van: 'partner:movesmart', reden: 'Beheert een leasewagen', naar: [['product:manage-business-mobility-costs', 0.4]] },

  // Reizen
  { van: 'partner:brussels-airport', reden: 'Vliegt via Brussels Airport', naar: [['product:travel-insurance', 0.55], ['partner:firsty', 0.5]] },
  { van: 'partner:firsty', reden: 'Gebruikt een reis-eSIM', naar: [['product:travel-insurance', 0.5]] },
  { van: 'product:credit-cards', reden: 'Kredietkaarthouders reizen vaker', naar: [['product:travel-insurance', 0.25]] },

  // Energie
  { van: 'partner:encon', reden: 'Duurzaamheidsadvies via Encon', naar: [['partner:kube', 0.3], ['product:energy-loan', 0.3]] },

  // Gezin en gezondheid
  { van: 'moment:GEZINSUITBREIDING', reden: 'Levensmoment gezinsuitbreiding, bevestigd door de klant', naar: [
    ['product:save-for-someone-else', 0.7], ['product:family-insurance', 0.6], ['product:hospitalisation-insurance', 0.6],
    ['product:life-insurance', 0.55], ['product:service-vouchers', 0.45], ['product:accident-insurance', 0.35],
  ] },
  { van: 'product:family-insurance', reden: 'Een gezin wil goed beschermd zijn', naar: [['product:accident-insurance', 0.3], ['product:life-insurance', 0.25]] },

  // Sparen, beleggen, pensioen
  { van: 'product:savings-accounts', reden: 'Spaart al bij KBC', naar: [
    ['product:kbc-investment-plan', 0.4], ['product:pension-savings-fund', 0.4], ['product:invest-spare-change', 0.3],
  ] },
  { van: 'product:kbc-plus-account', reden: 'Dagelijks bankieren bij KBC', naar: [
    ['product:savings-accounts', 0.3], ['product:pension-savings-fund', 0.3], ['product:invest-spare-change', 0.2], ['partner:wero', 0.25],
  ] },
  { van: 'partner:bolero', reden: 'Belegt zelf via Bolero', naar: [
    ['product:thematic-investing', 0.35], ['product:responsible-investing', 0.3], ['product:pension-savings-fund', 0.3],
  ] },

  // Ondernemen
  { van: 'partner:billit', reden: 'Factureert via Billit', naar: [
    ['product:kbc-business-pro-account', 0.55], ['product:supplementary-pension-for-the-self-employed', 0.4],
    ['product:business-liability-insurance', 0.35], ['product:start-it-at-kbc', 0.35], ['partner:go-solid', 0.35],
    ['product:guaranteed-income-insurance-for-the-self-employed', 0.3],
  ] },
  { van: 'partner:soluz-io', reden: 'Factureert via Soluz.io', naar: [['product:kbc-business-pro-account', 0.5], ['partner:go-solid', 0.3]] },
  { van: 'moment:ZAAK_STARTEN', reden: 'Levensmoment zaak starten, bevestigd door de klant', naar: [
    ['product:kbc-business-pro-account', 0.6], ['product:start-it-at-kbc', 0.55], ['partner:billit', 0.5],
    ['product:business-liability-insurance', 0.45], ['product:supplementary-pension-for-the-self-employed', 0.4],
    ['product:tax-and-legal-advice-for-smes', 0.4],
  ] },
  { van: 'product:kbc-business-pro-account', reden: 'Heeft een zakelijke rekening', naar: [
    ['product:kbc-business-debit-card', 0.4], ['product:payment-terminals', 0.3], ['partner:bancontact', 0.3],
  ] },
  { van: 'partner:nowjobs', reden: 'Werkt met flexwerkers via NOWJOBS', naar: [['product:occupational-accident-insurance', 0.45]] },

  // Dagelijks, winkelen, veiligheid
  { van: 'partner:joyn', reden: 'Spaart Joyn-punten', naar: [['product:digital-loyalty-cards', 0.4], ['product:kate-coins', 0.35]] },
  { van: 'partner:paypal', reden: 'Betaalt online via PayPal', naar: [['product:online-fraud-insurance', 0.35]] },
  { van: 'partner:wero', reden: 'Betaalt met Wero', naar: [['product:split-group-expenses', 0.3]] },
];

// Fail fast on a typo in a rule: every id must exist in the catalogue and point at something a customer can get.
for (const r of REGELS) {
  for (const id of [r.van, ...r.naar.map(([n]) => n)]) {
    if (id.startsWith('moment:')) continue;
    const [soort, ref] = id.split(':') as ['product' | 'partner', string];
    const ok = soort === 'product' ? PRODUCT.get(ref)?.kanaal === 'KLANT' : PARTNER.has(ref as PartnerId) && !PARTNER.get(ref as PartnerId)!.gevoelig;
    if (!ok) throw new Error(`Unknown or non-offerable node in REGELS: ${id}`);
  }
}

// ---- Engine ----

export interface Waarom { via: NodeId | `moment:${MomentId}`; naam: string; reden: string }
export interface Link {
  id: NodeId;
  soort: 'product' | 'partner';
  ref: string;
  naam: string;
  ecosysteem: EcosysteemId;
  status: LinkStatus;
  herkomst?: Herkomst | 'KBC_PRODUCT';
  sinds?: string;
  /** Only for 'mogelijk': 0..1, same noisy-OR as the moment score. */
  score?: number;
  waarom?: Waarom[];
}
export interface Cluster { ecosysteem: EcosysteemId; naam: string; status: LinkStatus; links: Link[] }
export interface Verband { van: NodeId | `moment:${MomentId}`; naar: NodeId; gewicht: number }

const MOMENT_NAAM: Record<MomentId, string> = { GEZINSUITBREIDING: 'gezinsuitbreiding', HUIS_KOPEN: 'huis kopen', ZAAK_STARTEN: 'zaak starten' };
const naamVan = (id: Van): string => {
  const [soort, ref] = id.split(':') as [string, string];
  if (soort === 'product') return PRODUCT.get(ref)!.naam;
  if (soort === 'partner') return PARTNERS[ref as PartnerId];
  return `Levensmoment ${MOMENT_NAAM[ref as MomentId]}`;
};
const nodeVan = (id: NodeId): Pick<Link, 'id' | 'soort' | 'ref' | 'naam' | 'ecosysteem'> => {
  const [soort, ref] = id.split(':') as ['product' | 'partner', string];
  const ecosysteem = soort === 'product' ? PRODUCT.get(ref)!.ecosysteem : PARTNER.get(ref as PartnerId)!.ecosysteem;
  return { id, soort, ref, naam: naamVan(id), ecosysteem };
};

export function berekenEcosystemen(input: {
  producten: string[]; // catalogue ids the customer holds at KBC
  relaties: PartnerRelatie[];
  toestemming: Record<Bron, boolean>;
  bevestigdeMomenten: MomentId[];
}): { clusters: Cluster[]; verbanden: Verband[] } {
  const links = new Map<NodeId, Link>();

  for (const id of input.producten) {
    if (PRODUCT.has(id)) links.set(`product:${id}`, { ...nodeVan(`product:${id}`), status: 'actief', herkomst: 'KBC_PRODUCT' });
  }
  for (const r of input.relaties) {
    const bron = HERKOMST_BRON[r.herkomst];
    if (bron && !input.toestemming[bron]) continue; // no consent for the source: KBC doesn't "know" this
    if (PARTNER.get(r.partner)?.gevoelig && r.herkomst !== 'KLANT') continue;
    links.set(`partner:${r.partner}`, {
      ...nodeVan(`partner:${r.partner}`),
      status: r.deelt ? 'actief' : 'gekend',
      herkomst: r.herkomst,
      sinds: r.sinds,
    });
  }

  // Suggestions: noisy-OR over every rule that fires, so several weak hints add up but never pass 100%.
  const bronnen: [Van, number][] = [
    ...[...links.values()].filter((l) => !PARTNER.get(l.ref as PartnerId)?.gevoelig).map((l) => [l.id, STATUS_FACTOR[l.status as 'actief' | 'gekend']] as [Van, number]),
    ...input.bevestigdeMomenten.map((m) => [`moment:${m}`, 1] as [Van, number]),
  ];
  const kandidaten = new Map<NodeId, { nietsAanDeHand: number; waarom: Waarom[]; verbanden: Verband[] }>();
  for (const [van, factor] of bronnen) {
    for (const regel of REGELS.filter((r) => r.van === van)) {
      for (const [naar, gewicht] of regel.naar) {
        if (links.has(naar)) continue; // already active or known
        const k = kandidaten.get(naar) ?? { nietsAanDeHand: 1, waarom: [], verbanden: [] };
        k.nietsAanDeHand *= 1 - gewicht * factor;
        k.waarom.push({ via: van, naam: naamVan(van), reden: regel.reden });
        k.verbanden.push({ van, naar, gewicht: Math.round(gewicht * factor * 100) / 100 });
        kandidaten.set(naar, k);
      }
    }
  }

  const verbanden: Verband[] = [];
  for (const [id, k] of kandidaten) {
    const score = Math.round((1 - k.nietsAanDeHand) * 100) / 100;
    if (score < MOGELIJK_DREMPEL) continue;
    links.set(id, { ...nodeVan(id), status: 'mogelijk', score, waarom: k.waarom });
    verbanden.push(...k.verbanden);
  }

  const RANG: Record<LinkStatus, number> = { actief: 0, gekend: 1, mogelijk: 2 };
  const clusters = (Object.keys(ECOSYSTEMEN) as EcosysteemId[])
    .map((ecosysteem): Cluster | null => {
      const eigen = [...links.values()]
        .filter((l) => l.ecosysteem === ecosysteem)
        .sort((a, b) => RANG[a.status] - RANG[b.status] || (b.score ?? 0) - (a.score ?? 0) || a.naam.localeCompare(b.naam));
      if (eigen.length === 0) return null;
      return { ecosysteem, naam: ECOSYSTEMEN[ecosysteem], status: eigen[0]!.status, links: eigen };
    })
    .filter((c): c is Cluster => c !== null)
    .sort((a, b) => RANG[a.status] - RANG[b.status] || b.links.length - a.links.length);

  return { clusters, verbanden };
}
