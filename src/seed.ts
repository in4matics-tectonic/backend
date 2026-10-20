// Mock data for the two demo profiles:
// - Tom en Lien: renting couple expecting a baby, one electric car, thinking about buying a house and getting married.
// - Jonas: founder of Stroomvaart BV (electric inland shipping), growing the business on renewable energy and partners.
// Each also proves the other can't see their data.
import type { Klant, PlaybookActie, Signaal } from './domain.js';
import type { PartnerRelatie } from './ecosysteem.js';

export interface Rekening {
  id: string;
  klantId: string;
  iban: string;
  type: 'ZICHTREKENING' | 'SPAARREKENING' | 'ZAKELIJKE_REKENING';
  naam: string;
  saldo: number;
}

export interface Transactie {
  id: string;
  rekeningId: string;
  datum: string;
  bedrag: number;
  tegenpartij: string;
  categorie: string;
}

export interface Document {
  id: string;
  klantId: string;
  // Doccle: metadata only, never the content
  afzender: string;
  type: string;
  datum: string;
}

export const PRODUCT_NAMEN: Record<string, string> = {
  ZICHTREKENING: 'KBC-Zichtrekening',
  SPAARREKENING: 'KBC-Spaarrekening',
  HUURWAARBORG: 'Huurwaarborg',
  WOONKREDIET: 'Woonkrediet',
  WOONVERZEKERING: 'Woonverzekering',
  AUTOLENING_ELEKTRISCH: 'Autolening elektrische wagen',
  AUTOVERZEKERING: 'Autoverzekering elektrische wagen',
  HOSPITALISATIE: 'Hospitalisatieverzekering',
  FAMILIALE: 'Familiale verzekering',
  ZAKELIJKE_REKENING: 'KBC Business PRO-rekening',
  ZAKELIJKE_KREDIETKAART: 'KBC Mastercard Business Extra',
  INVESTERINGSKREDIET: 'Investeringskrediet',
  ENERGIEKREDIET: 'Energiekrediet',
  BA_ONDERNEMING: 'BA Onderneming',
  ARBEIDSONGEVALLEN: 'Arbeidsongevallenverzekering',
  VAPZ: 'Vrij aanvullend pensioen voor zelfstandigen',
};

/** Customer product codes -> product id in the KBC catalogue (catalogus.ts). */
export const PRODUCT_CATALOGUS: Record<string, string> = {
  ZICHTREKENING: 'kbc-plus-account',
  SPAARREKENING: 'savings-accounts',
  HUURWAARBORG: 'rental-guarantee',
  WOONKREDIET: 'home-loan',
  WOONVERZEKERING: 'home-insurance',
  AUTOLENING_ELEKTRISCH: 'electric-car-loan',
  AUTOVERZEKERING: 'electric-car-insurance',
  HOSPITALISATIE: 'hospitalisation-insurance',
  FAMILIALE: 'family-insurance',
  ZAKELIJKE_REKENING: 'kbc-business-pro-account',
  ZAKELIJKE_KREDIETKAART: 'kbc-mastercard-business-extra',
  INVESTERINGSKREDIET: 'investment-loan',
  ENERGIEKREDIET: 'energy-loan',
  BA_ONDERNEMING: 'business-liability-insurance',
  ARBEIDSONGEVALLEN: 'occupational-accident-insurance',
  VAPZ: 'supplementary-pension-for-the-self-employed',
};

const TOM = 'K-2024-0417';
const JONAS = 'K-2022-0311';

export function seed() {
  const klanten: Klant[] = [
    {
      id: TOM,
      naam: 'Tom en Lien',
      toestemming: { EIGEN_AI: true, DOCCLE: true, GEOFENCE: true, APP: true, REKENING: true },
      producten: ['ZICHTREKENING', 'SPAARREKENING', 'WOONKREDIET', 'WOONVERZEKERING', 'AUTOLENING_ELEKTRISCH', 'AUTOVERZEKERING', 'HOSPITALISATIE', 'FAMILIALE'],
      landschap: { huis: 'geregeld', auto: 'geregeld', gezin: 'geregeld', bescherming: 'kans', sparen: 'geregeld', gezondheid: 'geregeld', reizen: 'kans', onderneming: 'kans' },
    },
    {
      id: JONAS,
      naam: 'Jonas',
      onderneming: {
        naam: 'Stroomvaart BV',
        ondernemingsnummer: 'BE 0799.311.204',
        sector: 'Elektrische binnenvaart',
        omschrijving: 'Emissievrij goederenvervoer over Schelde en Albertkanaal met elektrische duwboten, geladen met groene walstroom',
        opgericht: '2022-03-11',
        werknemers: 6,
      },
      // Jonas never switched on geofencing
      toestemming: { EIGEN_AI: true, DOCCLE: true, GEOFENCE: false, APP: true, REKENING: true },
      producten: ['ZICHTREKENING', 'ZAKELIJKE_REKENING', 'ZAKELIJKE_KREDIETKAART', 'INVESTERINGSKREDIET', 'ENERGIEKREDIET', 'BA_ONDERNEMING', 'ARBEIDSONGEVALLEN', 'VAPZ'],
      landschap: { huis: 'geregeld', auto: 'kans', gezin: 'kans', bescherming: 'geregeld', sparen: 'kans', gezondheid: 'kans', reizen: 'kans', onderneming: 'geregeld' },
    },
  ];

  // Scripted demo timeline: a signal only "exists" once the demo clock reaches its week (7, 10, 12 … 20).
  // Tom en Lien: gezinsuitbreiding 35 -> 91% (s1-s7, no health signals: those never count), trouwen up to 52% (s13-s15).
  // Jonas: zaak uitbreiden up to 85% (j1-j7); his own AI shares the moment live in the pitch, which takes him to 93%.
  const signalen: (Signaal & { klantId: string })[] = [
    ...[
      { id: 's1', week: 7, bron: 'EIGEN_AI', moment: 'GEZINSUITBREIDING', gewicht: 0.35, label: 'Vraag aan eigen AI over wat te regelen bij een kindje', gevoelig: false },
      { id: 's2', week: 10, bron: 'APP', moment: 'GEZINSUITBREIDING', gewicht: 0.3, label: "Spaarrekening hernoemd naar 'Kleine spruit'", gevoelig: false },
      { id: 's3', week: 12, bron: 'APP', moment: 'GEZINSUITBREIDING', gewicht: 0.15, label: "Pagina's hospitalisatie en kinderrekening bekeken", gevoelig: false },
      { id: 's4', week: 14, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.25, label: '3 aankopen in babyspeciaalzaak', gevoelig: false },
      { id: 's5', week: 16, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.45, label: 'Inschrijvingsgeld kinderopvang betaald', gevoelig: false },
      { id: 's6', week: 18, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.25, label: 'Kinderwagen gekocht', gevoelig: false },
      { id: 's7', week: 20, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.25, label: 'Meubels voor de babykamer gekocht', gevoelig: false },
      { id: 's13', week: 12, bron: 'REKENING', moment: 'TROUWEN', gewicht: 0.3, label: 'Aankoop bij een juwelier', gevoelig: false },
      { id: 's14', week: 16, bron: 'APP', moment: 'TROUWEN', gewicht: 0.15, label: "Pagina's huwelijkscontract en wettelijk samenwonen bekeken", gevoelig: false },
      { id: 's15', week: 18, bron: 'REKENING', moment: 'TROUWEN', gewicht: 0.2, label: 'Voorschot betaald aan een feestzaal', gevoelig: false },
    ].map((s) => ({ ...s, klantId: TOM })),
    ...[
      { id: 'j1', week: 7, bron: 'REKENING', moment: 'ZAAK_UITBREIDEN', gewicht: 0.3, label: 'Omzet Stroomvaart BV 3 maanden op rij gestegen (+28%)', gevoelig: false },
      { id: 'j2', week: 10, bron: 'DOCCLE', moment: 'ZAAK_UITBREIDEN', gewicht: 0.35, label: 'Offerte ontvangen van een scheepswerf', gevoelig: false },
      { id: 'j3', week: 12, bron: 'APP', moment: 'ZAAK_UITBREIDEN', gewicht: 0.2, label: "Pagina's investeringskrediet en KBC Innovation Banking bekeken", gevoelig: false },
      { id: 'j5', week: 16, bron: 'REKENING', moment: 'ZAAK_UITBREIDEN', gewicht: 0.25, label: 'Innovatiesubsidie van VLAIO ontvangen', gevoelig: false },
      { id: 'j6', week: 18, bron: 'REKENING', moment: 'ZAAK_UITBREIDEN', gewicht: 0.2, label: 'Extra bemanning ingehuurd via een uitzendkantoor', gevoelig: false },
      { id: 'j7', week: 20, bron: 'APP', moment: 'ZAAK_UITBREIDEN', gewicht: 0.3, label: 'Investeringskrediet gesimuleerd in KBC Business', gevoelig: false },
    ].map((s) => ({ ...s, klantId: JONAS })),
  ] as (Signaal & { klantId: string })[];

  const playbooks: Partial<Record<string, PlaybookActie[]>> = {
    GEZINSUITBREIDING: [
      { id: 'a1', titel: 'Schuldsaldo verhogen voor het gezin', domein: 'bescherming', uitvoering: 'STP' },
      { id: 'a2', titel: 'Kindje meeverzekeren in hospitalisatie', domein: 'gezondheid', uitvoering: 'STP' },
      { id: 'a3', titel: 'Startbedrag Groeipakket klaarzetten', domein: 'gezin', uitvoering: 'INFO' },
      { id: 'a4', titel: 'Gezinscheck van de auto: houden of een gezinswagen simuleren', domein: 'auto', uitvoering: 'INFO' },
      { id: 'a5', titel: "Spaarplan 'Kleine spruit' openen", domein: 'sparen', uitvoering: 'STP', kateCoin: { bedrag: 100, voorwaarde: 'spaarplan geopend en geboorte geregistreerd' } },
    ],
    HUIS_KOPEN: [
      { id: 'h1', titel: 'Woonbudget berekenen: hoeveel kunnen jullie lenen?', domein: 'huis', uitvoering: 'INFO' },
      { id: 'h2', titel: 'Woonkrediet bespreken met een woonexpert', domein: 'huis', uitvoering: 'ADVISEUR', vereistProductNiet: 'WOONKREDIET' },
      { id: 'h3', titel: 'Woning laten schatten via Immoscoop', domein: 'huis', uitvoering: 'INFO' },
      { id: 'h4', titel: 'Schuldsaldoverzekering voor jullie twee', domein: 'bescherming', uitvoering: 'STP' },
      { id: 'h5', titel: 'Woonverzekering omzetten van huurder naar eigenaar', domein: 'huis', uitvoering: 'STP' },
      { id: 'h6', titel: 'Huurwaarborg vrijgeven bij het einde van de huur', domein: 'sparen', uitvoering: 'INFO' },
    ],
    TROUWEN: [
      { id: 't1', titel: 'Huwelijkscontract of samenlevingscontract: checklist', domein: 'gezin', uitvoering: 'INFO' },
      { id: 't2', titel: 'Begunstigden van jullie verzekeringen aanpassen', domein: 'bescherming', uitvoering: 'ADVISEUR' },
      { id: 't3', titel: 'Spaardoel voor het trouwfeest', domein: 'sparen', uitvoering: 'STP', kateCoin: { bedrag: 25, voorwaarde: 'spaardoel aangemaakt' } },
      { id: 't4', titel: 'Reisverzekering voor de huwelijksreis', domein: 'reizen', uitvoering: 'STP' },
    ],
    ZAAK_UITBREIDEN: [
      { id: 'z1', titel: 'Investeringskrediet voor een tweede elektrisch schip', domein: 'onderneming', uitvoering: 'ADVISEUR' },
      { id: 'z2', titel: 'Groeifinanciering bespreken met KBC Innovation Banking', domein: 'onderneming', uitvoering: 'ADVISEUR' },
      { id: 'z3', titel: 'Energiekrediet voor extra walstroom- en laadinfrastructuur', domein: 'onderneming', uitvoering: 'STP', vereistProductNiet: 'ENERGIEKREDIET' },
      { id: 'z4', titel: 'Flexibele bemanning via NOWJOBS', domein: 'onderneming', uitvoering: 'STP' },
      { id: 'z5', titel: 'CO2-rapportage voor verladers via Kube ESG', domein: 'onderneming', uitvoering: 'INFO' },
      { id: 'z6', titel: 'Rente indekken op het nieuwe krediet', domein: 'onderneming', uitvoering: 'ADVISEUR' },
      { id: 'z7', titel: 'Nieuwe klanten in Nederland en Duitsland via Go&Deal Pro', domein: 'onderneming', uitvoering: 'INFO' },
      { id: 'z8', titel: 'Bemanning meeverzekeren in de arbeidsongevallenverzekering', domein: 'bescherming', uitvoering: 'STP' },
    ],
  };

  const rekeningen: Rekening[] = [
    { id: 'r1', klantId: TOM, iban: 'BE68 7340 1234 5678', type: 'ZICHTREKENING', naam: 'Gezamenlijke rekening', saldo: 4213.57 },
    { id: 'r2', klantId: TOM, iban: 'BE91 7340 8765 4321', type: 'SPAARREKENING', naam: 'Spaarrekening', saldo: 38650 },
    { id: 'r3', klantId: JONAS, iban: 'BE12 7350 9876 5432', type: 'ZICHTREKENING', naam: 'Zichtrekening', saldo: 3140.22 },
    { id: 'r4', klantId: JONAS, iban: 'BE45 7350 1111 2222', type: 'ZAKELIJKE_REKENING', naam: 'Stroomvaart BV', saldo: 84310.55 },
  ];

  const t = (rekeningId: string, rows: [string, number, string, string][]) =>
    rows.map(([datum, bedrag, tegenpartij, categorie]) => ({ rekeningId, datum, bedrag, tegenpartij, categorie }));
  const transacties: Transactie[] = [
    ...t('r1', [
      ['2026-07-01', -1186, 'KBC Woonkrediet', 'LENING'],
      ['2026-07-03', -389, 'KBC Autolening', 'LENING'],
      ['2026-07-11', -2450, 'Juwelier Vandaele', 'JUWELEN'],
      ['2026-07-14', -54.3, 'Allego laadpunt', 'LADEN'],
      ['2026-07-25', 3450, 'Werkgever NV', 'LOON'],
      ['2026-07-25', 3120, 'Ziekenhuis AZ Groeninge', 'LOON'],
      ['2026-07-28', -800, 'Spaarrekening', 'SPAREN'],
      ['2026-08-01', -1186, 'KBC Woonkrediet', 'LENING'],
      ['2026-08-03', -389, 'KBC Autolening', 'LENING'],
      ['2026-08-03', -42, 'Babyland', 'BABY'],
      ['2026-08-09', -38.4, 'Cambio', 'MOBILITEIT'],
      ['2026-08-12', -64.5, 'Baby Dump Kortrijk', 'BABY'],
      ['2026-08-16', -61.8, 'VAB laadkaart', 'LADEN'],
      ['2026-08-20', -189.99, 'Baby Dump Kortrijk', 'BABY'],
      ['2026-08-25', 3450, 'Werkgever NV', 'LOON'],
      ['2026-08-25', 3120, 'Ziekenhuis AZ Groeninge', 'LOON'],
      ['2026-08-28', -1600, 'Spaarrekening', 'SPAREN'],
      ['2026-09-01', -1186, 'KBC Woonkrediet', 'LENING'],
      ['2026-09-02', -150, 'Kinderdagverblijf De Speelboom', 'KINDEROPVANG'],
      ['2026-09-03', -389, 'KBC Autolening', 'LENING'],
      ['2026-09-06', -1500, 'Feestzaal Hof ter Leie', 'FEEST'],
      ['2026-09-10', -24.8, 'NMBS', 'MOBILITEIT'],
      ['2026-09-13', -649, 'Baby Dump Kortrijk', 'BABY'],
      ['2026-09-16', -95, 'Vroedvrouwenpraktijk Levenslicht', 'CURSUS'],
      ['2026-09-18', -112.34, 'Colruyt', 'BOODSCHAPPEN'],
      ['2026-09-19', -58.1, 'VAB laadkaart', 'LADEN'],
      ['2026-09-25', 3450, 'Werkgever NV', 'LOON'],
      ['2026-09-25', 3120, 'Ziekenhuis AZ Groeninge', 'LOON'],
      ['2026-09-27', -1240, 'Kidsdepot', 'BABY'],
      ['2026-09-28', -1600, 'Spaarrekening', 'SPAREN'],
    ]),
    ...t('r2', [
      ['2026-07-28', 800, 'Gezamenlijke rekening', 'SPAREN'],
      ['2026-08-28', 1600, 'Gezamenlijke rekening', 'SPAREN'],
      ['2026-09-28', 1600, 'Gezamenlijke rekening', 'SPAREN'],
    ]),
    ...t('r3', [
      ['2026-07-30', 4200, 'Stroomvaart BV', 'LOON'],
      ['2026-08-30', 4200, 'Stroomvaart BV', 'LOON'],
      ['2026-09-05', -14.99, 'Firsty', 'TELECOM'],
      ['2026-09-30', 4200, 'Stroomvaart BV', 'LOON'],
    ]),
    ...t('r4', [
      ['2026-07-04', 18450, 'Scheldecargo NV', 'FACTUUR'],
      ['2026-07-08', -2860, 'Port of Antwerp-Bruges walstroom', 'ENERGIE'],
      ['2026-07-10', -6950, 'KBC Investeringskrediet', 'LENING'],
      ['2026-07-10', -1180, 'KBC Energiekrediet', 'LENING'],
      ['2026-07-15', -29, 'Billit', 'SOFTWARE'],
      ['2026-07-18', 12780, 'Bouwmaterialen Van Dijck', 'FACTUUR'],
      ['2026-07-29', -21600, 'Lonen bemanning', 'LONEN'],
      ['2026-08-04', 21300, 'Scheldecargo NV', 'FACTUUR'],
      ['2026-08-06', -1850, 'Encon', 'ADVIES'],
      ['2026-08-08', -3120, 'Port of Antwerp-Bruges walstroom', 'ENERGIE'],
      ['2026-08-10', -6950, 'KBC Investeringskrediet', 'LENING'],
      ['2026-08-10', -1180, 'KBC Energiekrediet', 'LENING'],
      ['2026-08-12', -149, 'Kube', 'SOFTWARE'],
      ['2026-08-15', -29, 'Billit', 'SOFTWARE'],
      ['2026-08-19', 9200, 'Agri Logistiek Kempen', 'FACTUUR'],
      ['2026-08-21', -689, 'MoveSmart', 'LEASING'],
      ['2026-08-22', -95, 'Go Solid', 'INCASSO'],
      ['2026-08-29', -21600, 'Lonen bemanning', 'LONEN'],
      ['2026-09-02', 24150, 'Scheldecargo NV', 'FACTUUR'],
      ['2026-09-04', -4200, 'Sweco Belgium', 'ADVIES'],
      ['2026-09-08', -3340, 'Port of Antwerp-Bruges walstroom', 'ENERGIE'],
      ['2026-09-10', -6950, 'KBC Investeringskrediet', 'LENING'],
      ['2026-09-10', -1180, 'KBC Energiekrediet', 'LENING'],
      ['2026-09-12', 25000, 'VLAIO', 'SUBSIDIE'],
      ['2026-09-15', -29, 'Billit', 'SOFTWARE'],
      ['2026-09-17', -3480, 'NOWJOBS', 'PERSONEEL'],
      ['2026-09-20', -7812, 'FOD Financiën btw', 'BELASTING'],
      ['2026-09-21', -689, 'MoveSmart', 'LEASING'],
      ['2026-09-26', 14600, 'Bouwmaterialen Van Dijck', 'FACTUUR'],
      ['2026-09-29', -23400, 'Lonen bemanning', 'LONEN'],
    ]),
  ].map((x, i) => ({ id: `t${i + 1}`, ...x }));

  const documenten: Document[] = [
    { id: 'd1', klantId: TOM, afzender: 'Praktijk Gynaecologie Kortrijk', type: 'afschrift consultatie', datum: '2026-03-12' },
    { id: 'd2', klantId: TOM, afzender: 'Fluvius', type: 'factuur', datum: '2026-09-01' },
    { id: 'd3', klantId: TOM, afzender: 'Stad Kortrijk', type: 'aanslagbiljet onroerende voorheffing', datum: '2026-06-15' },
    { id: 'd4', klantId: TOM, afzender: 'Notariskantoor Vandenberghe', type: 'afspraakbevestiging', datum: '2026-09-22' },
    { id: 'd5', klantId: JONAS, afzender: 'Scheepswerf De Rupel', type: 'offerte', datum: '2026-05-06' },
    { id: 'd6', klantId: JONAS, afzender: 'VLAIO', type: 'beslissing steunaanvraag', datum: '2026-08-28' },
    { id: 'd7', klantId: JONAS, afzender: 'Port of Antwerp-Bruges', type: 'factuur', datum: '2026-09-08' },
    { id: 'd8', klantId: JONAS, afzender: 'FOD Financiën', type: 'aanslagbiljet vennootschapsbelasting', datum: '2026-07-14' },
  ];

  // Partners the customer is a client of. deelt = the customer lets that partner share data with KBC (active link);
  // otherwise KBC only knows the relation exists (known link), from the account or from use inside KBC Mobile.
  const partnerRelaties: (PartnerRelatie & { klantId: string })[] = [
    { klantId: TOM, partner: 'vab', herkomst: 'KBC_MOBILE', deelt: true, sinds: '2025-03-02' },
    { klantId: TOM, partner: 'nmbs', herkomst: 'KBC_MOBILE', deelt: true, sinds: '2024-09-01' },
    { klantId: TOM, partner: 'joyn', herkomst: 'KBC_MOBILE', deelt: true, sinds: '2024-05-22' },
    { klantId: TOM, partner: 'cambio', herkomst: 'REKENING', deelt: false, sinds: '2025-06-10' },
    { klantId: TOM, partner: 'brussels-airport', herkomst: 'REKENING', deelt: false, sinds: '2026-07-02' },
    { klantId: JONAS, partner: 'billit', herkomst: 'KLANT', deelt: true, sinds: '2022-05-02' },
    { klantId: JONAS, partner: 'encon', herkomst: 'KLANT', deelt: true, sinds: '2025-09-15' },
    { klantId: JONAS, partner: 'kube', herkomst: 'KBC_MOBILE', deelt: true, sinds: '2026-01-20' },
    { klantId: JONAS, partner: 'sweco', herkomst: 'REKENING', deelt: false, sinds: '2025-11-04' },
    { klantId: JONAS, partner: 'nowjobs', herkomst: 'REKENING', deelt: false, sinds: '2026-05-12' },
    { klantId: JONAS, partner: 'go-solid', herkomst: 'REKENING', deelt: false, sinds: '2026-02-03' },
    { klantId: JONAS, partner: 'movesmart', herkomst: 'REKENING', deelt: false, sinds: '2024-10-01' },
    { klantId: JONAS, partner: 'firsty', herkomst: 'REKENING', deelt: false, sinds: '2026-03-09' },
  ];

  return { klanten, signalen, playbooks, rekeningen, transacties, documenten, partnerRelaties };
}
