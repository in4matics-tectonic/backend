// Mock data. Tom & Lien come from the tech doc; Sarah exists to prove customers can't see each other.
import type { Klant, PlaybookActie, Signaal } from './domain.js';

export interface Rekening {
  id: string;
  klantId: string;
  iban: string;
  type: 'ZICHTREKENING' | 'SPAARREKENING';
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
  WOONKREDIET: 'Woonkrediet',
  WOONVERZEKERING: 'Woonverzekering',
  AUTOVERZEKERING: 'Autoverzekering',
  HOSPITALISATIE: 'Hospitalisatieverzekering',
  FAMILIALE: 'Familiale verzekering',
};

export function seed() {
  const klanten: Klant[] = [
    {
      id: 'K-2024-0417',
      naam: 'Tom en Lien',
      toestemming: { EIGEN_AI: true, DOCCLE: true, GEOFENCE: true, APP: true, REKENING: true },
      producten: ['ZICHTREKENING', 'WOONKREDIET', 'WOONVERZEKERING', 'AUTOVERZEKERING', 'HOSPITALISATIE', 'FAMILIALE'],
      landschap: { huis: 'geregeld', auto: 'geregeld', gezin: 'geregeld', bescherming: 'kans', sparen: 'kans', gezondheid: 'geregeld', reizen: 'kans' },
    },
    {
      id: 'K-2025-0102',
      naam: 'Sarah',
      toestemming: { EIGEN_AI: false, DOCCLE: false, GEOFENCE: false, APP: true, REKENING: true },
      producten: ['ZICHTREKENING', 'SPAARREKENING'],
      landschap: { huis: 'kans', auto: 'kans', gezin: 'kans', bescherming: 'kans', sparen: 'geregeld', gezondheid: 'kans', reizen: 'kans' },
    },
  ];

  // Scripted demo timeline: a signal only "exists" once the demo clock reaches its week.
  const signalen: (Signaal & { klantId: string })[] = [
    { id: 's1', week: 7, bron: 'EIGEN_AI', moment: 'GEZINSUITBREIDING', gewicht: 0.35, label: 'Vraag aan eigen AI over wat te regelen bij een kindje', gevoelig: false },
    { id: 's2', week: 10, bron: 'DOCCLE', moment: 'GEZINSUITBREIDING', gewicht: 0.6, label: 'Document van een gynaecoloog ontvangen', gevoelig: true },
    { id: 's3', week: 12, bron: 'GEOFENCE', moment: 'GEZINSUITBREIDING', gewicht: 0.2, label: '2 bezoeken aan praktijk vroedvrouw', gevoelig: true },
    { id: 's4', week: 14, bron: 'APP', moment: 'GEZINSUITBREIDING', gewicht: 0.15, label: "Pagina's hospitalisatie en kinderrekening bekeken", gevoelig: false },
    { id: 's5', week: 16, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.25, label: '3 aankopen in babyspeciaalzaak', gevoelig: false },
    { id: 's6', week: 18, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.45, label: 'Inschrijvingsgeld kinderopvang betaald', gevoelig: false },
    { id: 's7', week: 20, bron: 'REKENING', moment: 'GEZINSUITBREIDING', gewicht: 0.2, label: 'Prenatale cursus betaald', gevoelig: false },
  ].map((s) => ({ ...s, klantId: 'K-2024-0417' }) as Signaal & { klantId: string });

  const playbooks: Partial<Record<string, PlaybookActie[]>> = {
    GEZINSUITBREIDING: [
      { id: 'a1', titel: 'Kindje meeverzekeren in hospitalisatie', domein: 'gezondheid', uitvoering: 'STP' },
      { id: 'a2', titel: 'Familiale verzekering nakijken voor het kind', domein: 'bescherming', uitvoering: 'STP' },
      { id: 'a3', titel: 'Spaarrekening voor het kind openen', domein: 'sparen', uitvoering: 'STP', kateCoin: { bedrag: 50, voorwaarde: 'rekening geopend en geboorte geregistreerd' } },
      { id: 'a4', titel: 'Gezinsbudget en ouderschapsverlof simuleren', domein: 'gezin', uitvoering: 'INFO' },
      { id: 'a5', titel: 'Begunstigden levensverzekering nakijken', domein: 'huis', uitvoering: 'ADVISEUR' },
      { id: 'a6', titel: 'Groeipakket en geboortepremie: checklist', domein: 'gezin', uitvoering: 'INFO' },
      { id: 'a7', titel: 'Autolening voor een gezinswagen', domein: 'auto', uitvoering: 'STP', vereistProductNiet: 'AUTOVERZEKERING' },
    ],
  };

  const rekeningen: Rekening[] = [
    { id: 'r1', klantId: 'K-2024-0417', iban: 'BE68 7340 1234 5678', type: 'ZICHTREKENING', naam: 'Gezamenlijke rekening', saldo: 4213.57 },
    { id: 'r2', klantId: 'K-2025-0102', iban: 'BE12 7350 9876 5432', type: 'ZICHTREKENING', naam: 'Zichtrekening', saldo: 1820.1 },
    { id: 'r3', klantId: 'K-2025-0102', iban: 'BE45 7350 1111 2222', type: 'SPAARREKENING', naam: 'Spaarrekening', saldo: 12500 },
  ];

  const transacties: Transactie[] = [
    { id: 't1', rekeningId: 'r1', datum: '2026-08-28', bedrag: -1250, tegenpartij: 'KBC Woonkrediet', categorie: 'LENING' },
    { id: 't2', rekeningId: 'r1', datum: '2026-08-25', bedrag: 3450, tegenpartij: 'Werkgever NV', categorie: 'LOON' },
    { id: 't3', rekeningId: 'r1', datum: '2026-08-20', bedrag: -189.99, tegenpartij: 'Baby Dump Kortrijk', categorie: 'BABY' },
    { id: 't4', rekeningId: 'r1', datum: '2026-08-12', bedrag: -64.5, tegenpartij: 'Baby Dump Kortrijk', categorie: 'BABY' },
    { id: 't5', rekeningId: 'r1', datum: '2026-08-03', bedrag: -42, tegenpartij: 'Babyland', categorie: 'BABY' },
    { id: 't6', rekeningId: 'r1', datum: '2026-09-02', bedrag: -150, tegenpartij: 'Kinderdagverblijf De Speelboom', categorie: 'KINDEROPVANG' },
    { id: 't7', rekeningId: 'r1', datum: '2026-09-16', bedrag: -95, tegenpartij: 'Vroedvrouwenpraktijk Levenslicht', categorie: 'CURSUS' },
    { id: 't8', rekeningId: 'r1', datum: '2026-09-18', bedrag: -112.34, tegenpartij: 'Colruyt', categorie: 'BOODSCHAPPEN' },
    { id: 't9', rekeningId: 'r2', datum: '2026-09-10', bedrag: 2100, tegenpartij: 'Werkgever BV', categorie: 'LOON' },
    { id: 't10', rekeningId: 'r2', datum: '2026-09-12', bedrag: -750, tegenpartij: 'Verhuurder', categorie: 'HUUR' },
  ];

  const documenten: Document[] = [
    { id: 'd1', klantId: 'K-2024-0417', afzender: 'Praktijk Gynaecologie Kortrijk', type: 'afschrift consultatie', datum: '2026-03-12' },
    { id: 'd2', klantId: 'K-2024-0417', afzender: 'Fluvius', type: 'factuur', datum: '2026-09-01' },
    { id: 'd3', klantId: 'K-2025-0102', afzender: 'Proximus', type: 'factuur', datum: '2026-09-05' },
  ];

  return { klanten, signalen, playbooks, rekeningen, transacties, documenten };
}
