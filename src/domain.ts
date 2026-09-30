// Data model and score engine from the "KBC Momentum – Technisch document" wiki page.
// Field names stay Dutch so the frontend can reuse the same types.
import { z } from 'zod';

export const BRONNEN = ['EIGEN_AI', 'DOCCLE', 'GEOFENCE', 'APP', 'REKENING'] as const;
export const MOMENTEN = ['GEZINSUITBREIDING', 'HUIS_KOPEN', 'ZAAK_STARTEN'] as const;
export const DOMEINEN = ['huis', 'gezin', 'auto', 'bescherming', 'sparen', 'gezondheid', 'reizen'] as const;

export const Bron = z.enum(BRONNEN);
export const MomentId = z.enum(MOMENTEN);
export type Bron = z.infer<typeof Bron>;
export type MomentId = z.infer<typeof MomentId>;
export type Domein = (typeof DOMEINEN)[number];
export type DomeinStatus = 'geregeld' | 'kans' | 'nieuw';

export interface Klant {
  id: string;
  naam: string;
  toestemming: Record<Bron, boolean>;
  producten: string[];
  landschap: Record<Domein, DomeinStatus>;
}

export interface Signaal {
  id: string;
  week: number;
  bron: Bron;
  moment: MomentId;
  gewicht: number; // 0..1, negative = counter-signal
  label: string;
  gevoelig: boolean;
}

export type Fase = 'stil' | 'info' | 'vragen' | 'voorstel';

export interface MomentScore {
  moment: MomentId;
  score: number;
  fase: Fase;
  bevestigd: boolean;
  signalen: string[];
}

export interface PlaybookActie {
  id: string;
  titel: string;
  domein: Domein;
  uitvoering: 'STP' | 'INFO' | 'ADVISEUR';
  vereistProductNiet?: string;
  kateCoin?: { bedrag: number; voorwaarde: string };
}

export const HALVERINGSTIJD = Infinity; // days; 60 for production
export const DREMPELS = { info: 0.4, vragen: 0.7, voorstel: 0.9 };

/** Weight of an EIGEN_AI signal per phase shared via MCP. */
export const MCP_FASE_GEWICHT = { orienterend: 0.35, plannend: 0.55, beslist: 0.85 } as const;

export function berekenScore(
  klant: Klant,
  signalen: Signaal[],
  moment: MomentId,
  huidigeWeek: number,
  bevestigd: boolean,
): MomentScore {
  // Privacy rule: no signal counts without consent for its source.
  const relevant = signalen.filter((s) => s.moment === moment && s.week <= huidigeWeek && klant.toestemming[s.bron]);
  let nietsAanDeHand = 1;
  let demping = 1;

  for (const s of relevant) {
    const leeftijdDagen = (huidigeWeek - s.week) * 7;
    const verval = Math.pow(0.5, leeftijdDagen / HALVERINGSTIJD);
    if (s.gewicht >= 0) nietsAanDeHand *= 1 - s.gewicht * verval;
    else demping *= 1 + s.gewicht * verval;
  }

  const score = Math.round((1 - nietsAanDeHand) * demping * 100) / 100;
  const gevoelig = relevant.some((s) => s.gevoelig);

  let fase: Fase = 'stil';
  if (score >= DREMPELS.info) fase = 'info';
  if (score >= DREMPELS.vragen) fase = 'vragen';
  if (score >= DREMPELS.voorstel && bevestigd) fase = 'voorstel';
  // Sensitive moment without confirmation: never past 'vragen'
  if (gevoelig && !bevestigd && fase === 'voorstel') fase = 'vragen';

  return { moment, score, fase, bevestigd, signalen: relevant.map((s) => s.id) };
}

/** Playbook actions the customer does not already have covered. */
export function filterPlaybook(klant: Klant, acties: PlaybookActie[]): PlaybookActie[] {
  return acties.filter((a) => !a.vereistProductNiet || !klant.producten.includes(a.vereistProductNiet));
}
