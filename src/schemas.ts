// Response schemas for every /v1 route. They document the responses in Swagger (/docs) and, through the Zod
// serializer, are enforced on output: a field a handler returns that isn't listed here is stripped, and a response
// that doesn't match fails with a 500. Keep them in sync with what the routes return.
import { z } from 'zod';
import { ECOSYSTEMEN, PARTNERS, type EcosysteemId as EcosysteemIdType, type PartnerId as PartnerIdType } from './catalogus.js';
import { Bron, BRONNEN, DOMEINEN, MomentId } from './domain.js';

/** z.object with the same value schema for each key, e.g. one boolean per source. */
const perSleutel = <K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>);

export const EcosysteemId = z.enum(Object.keys(ECOSYSTEMEN) as [EcosysteemIdType, ...EcosysteemIdType[]]);
export const PartnerId = z.enum(Object.keys(PARTNERS) as [PartnerIdType, ...PartnerIdType[]]);
const Datum = z.string().describe('YYYY-MM-DD');
const Fase = z.enum(['stil', 'info', 'vragen', 'voorstel']);
const Herkomst = z.enum(['REKENING', 'KBC_MOBILE', 'KLANT']).describe('How KBC knows about the relation: account data, KBC Mobile, or the customer said so');
const LinkStatus = z.enum(['actief', 'gekend', 'mogelijk']);

// ---- Errors ----

const Fout = z.object({
  error: z.string().describe('Machine-readable code'),
  message: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional().describe('Only for validation_error'),
  bron: Bron.optional().describe('Only for no_consent'),
  partner: PartnerId.optional().describe('Only for gevoelige_partner'),
});
const FOUTEN = {
  400: Fout.describe('validation_error: body, params or query invalid'),
  401: Fout.describe('unauthorized (or invalid_credentials on login)'),
  403: Fout.describe('forbidden: role not allowed'),
  404: Fout.describe('not_found: unknown id, or a customer asking for another customer'),
  422: Fout.describe('Refused by a business rule'),
};
/** Error responses for a route's `response` schema. */
export function fouten<C extends keyof typeof FOUTEN>(...codes: C[]): Pick<typeof FOUTEN, C> {
  return Object.fromEntries(codes.map((c) => [c, FOUTEN[c]])) as Pick<typeof FOUTEN, C>;
}

// ---- Auth ----

export const TokenUser = z.object({
  sub: z.string().describe('Username'),
  role: z.enum(['klant', 'adviseur', 'ingest']),
  klantId: z.string().optional().describe('Only for role klant'),
});
export const Login = z.object({ token: z.string(), tokenType: z.literal('Bearer'), expiresIn: z.number().int().describe('Seconds'), user: TokenUser });
export const Me = TokenUser.extend({ iss: z.string(), iat: z.number().int(), exp: z.number().int() });

// ---- Demo ----

export const Week = z.object({ week: z.number().int().describe('Current demo week') });
export const DemoStatus = Week.extend({ weken: z.array(z.number().int()).describe('Weeks "Volgende" steps through') });

// ---- Customers ----

export const KlantKort = z.object({ id: z.string(), naam: z.string(), onderneming: z.string().nullable().describe('Company name, for self-employed customers') });
export const Toestemming = perSleutel(BRONNEN, z.boolean()).describe('Consent per signal source');
export const Klant = z.object({
  id: z.string(),
  naam: z.string(),
  onderneming: z
    .object({ naam: z.string(), ondernemingsnummer: z.string(), sector: z.string(), omschrijving: z.string(), opgericht: Datum, werknemers: z.number().int() })
    .optional(),
  toestemming: Toestemming,
  producten: z.array(z.string()).describe('Product codes, see /producten for names'),
  landschap: perSleutel(DOMEINEN, z.enum(['geregeld', 'kans', 'nieuw'])),
});
export const Rekening = z.object({
  id: z.string(),
  klantId: z.string(),
  iban: z.string(),
  type: z.enum(['ZICHTREKENING', 'SPAARREKENING', 'ZAKELIJKE_REKENING']),
  naam: z.string(),
  saldo: z.number(),
});
export const Transactie = z.object({ id: z.string(), rekeningId: z.string(), datum: Datum, bedrag: z.number(), tegenpartij: z.string(), categorie: z.string() });
export const KlantProduct = z.object({
  code: z.string(),
  naam: z.string(),
  catalogusId: z.string().nullable().describe('Product id in /catalogus'),
  ecosysteem: EcosysteemId.nullable(),
});
export const Document = z.object({ id: z.string(), klantId: z.string(), afzender: z.string(), type: z.string(), datum: Datum }).describe('Doccle metadata only, never the content');

// ---- Signals and moments ----

export const Signaal = z.object({
  id: z.string(),
  week: z.number().int(),
  bron: Bron,
  moment: MomentId,
  gewicht: z.number().describe('-1..1, negative = counter-signal'),
  label: z.string(),
  gevoelig: z.boolean(),
  klantId: z.string(),
});
const KlantSignaal = Signaal.pick({ id: true, week: true, bron: true, moment: true, label: true });
export const Signalen = z.union([
  z.array(Signaal).describe('adviseur: every signal'),
  z.array(KlantSignaal).describe('klant: sensitive signals left out, no weights'),
]);

const PlaybookActie = z.object({
  id: z.string(),
  titel: z.string(),
  domein: z.enum(DOMEINEN),
  uitvoering: z.enum(['STP', 'INFO', 'ADVISEUR']),
  vereistProductNiet: z.string().optional(),
  kateCoin: z.object({ bedrag: z.number(), voorwaarde: z.string() }).optional(),
});
const MomentBasis = z.object({ moment: MomentId, score: z.number().describe('0..1'), fase: Fase, bevestigd: z.boolean() });
export const MomentKlant = MomentBasis.extend({
  acties: z.array(PlaybookActie).describe('Empty until fase is voorstel'),
  waarom: z.array(z.string()).describe('Labels of the non-sensitive signals'),
  andereSignalen: z.number().int().describe('Number of sensitive signals, without labels'),
}).describe('klant view');
const MomentAdviseur = MomentBasis.extend({
  signalen: z.array(z.string()).describe('Signal ids'),
  acties: z.array(PlaybookActie),
  signalenDetail: z.array(Signaal),
}).describe('adviseur view');
// Adviseur first: the union keeps the first match, and the klant view would otherwise strip the adviseur fields
export const Moment = z.union([MomentAdviseur, MomentKlant]);
export const Momenten = z.object({ week: z.number().int(), momenten: z.array(Moment) });
export const Ingetrokken = z.object({ status: z.literal('ingetrokken'), verwijderdeSignalen: z.number().int() });
export const Gedeeld = z.object({
  status: z.literal('ontvangen'),
  signaal_id: z.string(),
  boodschap_voor_klant: z.string(),
  nuttige_info: z.array(z.string()),
});

// ---- Catalogue, ecosystems and partners ----

export const CatalogusProduct = z.object({
  id: z.string(),
  naam: z.string(),
  ecosysteem: EcosysteemId,
  partners: z.array(PartnerId).describe('Third parties behind the product'),
  kanaal: z.enum(['KLANT', 'B2B']).describe('B2B: integration partners embed, never offered to a customer'),
});
export const Partner = z.object({
  id: PartnerId,
  naam: z.string(),
  ecosysteem: EcosysteemId.describe('Home ecosystem'),
  ecosystemen: z.array(EcosysteemId).describe('Every ecosystem with a product of this partner'),
  producten: z.array(z.string()).describe('Catalogue product ids'),
  gevoelig: z.boolean().describe('Health partner: never inferred or suggested, data sharing cannot be switched on'),
});
export const EcosysteemKort = z.object({
  id: EcosysteemId,
  naam: z.string(),
  aantalProducten: z.number().int(),
  partners: z.array(PartnerId),
});
export const EcosysteemDetail = EcosysteemKort.extend({ producten: z.array(CatalogusProduct) });
export const Catalogus = z.object({ ecosystemen: z.array(EcosysteemKort), producten: z.array(CatalogusProduct), partners: z.array(Partner) });

export const KlantPartner = z.object({
  partner: PartnerId,
  naam: z.string(),
  ecosysteem: EcosysteemId,
  gevoelig: z.boolean(),
  klantBijPartner: z.boolean().describe('KBC knows the customer is a client, with consent for the source'),
  deelt: z.boolean().describe('Customer lets this partner share data with KBC'),
  herkomst: Herkomst.nullable(),
  sinds: Datum.nullable(),
});

const NodeId = z.string().describe('product:<catalogue id> or partner:<partner id>');
const Link = z.object({
  id: NodeId,
  soort: z.enum(['product', 'partner']),
  ref: z.string().describe('Catalogue product id or partner id'),
  naam: z.string(),
  ecosysteem: EcosysteemId,
  status: LinkStatus.describe('actief: held product or sharing partner; gekend: known partner without sharing; mogelijk: suggestion'),
  herkomst: z.union([Herkomst, z.literal('KBC_PRODUCT')]).optional().describe('Not for mogelijk'),
  sinds: Datum.optional(),
  score: z.number().optional().describe('Only for mogelijk: 0..1'),
  waarom: z
    .array(z.object({ via: z.string().describe('Node id or moment:<MomentId>'), naam: z.string(), reden: z.string() }))
    .optional()
    .describe('Only for mogelijk: the rules that suggested it'),
});
const Cluster = z.object({
  ecosysteem: EcosysteemId,
  naam: z.string(),
  status: LinkStatus.describe('Best status of its links'),
  links: z.array(Link).describe('Sorted actief, gekend, mogelijk (by score)'),
});
export const KlantEcosystemen = z.object({
  week: z.number().int(),
  samenvatting: z.object({
    actief: z.number().int(),
    gekend: z.number().int(),
    mogelijk: z.number().int(),
    ecosystemen: z.number().int().describe('Number of clusters'),
    nieuweEcosystemen: z.array(EcosysteemId).describe('Clusters with only mogelijk links'),
  }),
  clusters: z.array(Cluster).describe('Only ecosystems with at least one link'),
  verbanden: z
    .array(z.object({ van: z.string().describe('Node id or moment:<MomentId>'), naar: NodeId, gewicht: z.number() }))
    .describe('Edges behind the mogelijk links, for drawing the graph'),
});

// ---- Audit ----

export const AuditRegel = z.object({ ts: z.string().describe('ISO timestamp'), actor: z.string(), actie: z.string(), klantId: z.string().optional(), detail: z.string().optional() });
