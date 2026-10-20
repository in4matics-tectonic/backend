// KBC's next-best-channel agent. For every life moment Kate may act on (phase vragen or voorstel), it decides who
// approaches the customer: Kate on her own in the app ("automatisch"), or a KBC adviser ("adviseur"), whichever
// the customer is more likely to engage with. It is a small, transparent engagement model on facts KBC already has,
// so every decision comes with its reasons and lands in the audit log. Like the moment score it is computed here,
// deterministically: a language model may word a decision, never make it.
import type { EcosysteemId, PartnerId } from './catalogus.js';
import type { MomentId, MomentScore, PlaybookActie, Signaal } from './domain.js';

export type Kanaal = 'automatisch' | 'adviseur';
export type BeslissingStatus = 'uitgevoerd' | 'taak' | 'afgehandeld';

export interface AgentBeslissing {
  id: string;
  klantId: string;
  moment: MomentId;
  score: number;
  kanaal: Kanaal;
  /** Expected engagement per channel, 0..1. */
  engagement: { app: number; adviseur: number };
  redenen: string[];
  /** What the agent did (automatisch) or asks the adviser to do (adviseur). */
  actie: string;
  status: BeslissingStatus;
  /** For the adviser: links and partner pairs worth proposing. */
  voorstellen: { id: string; naam: string }[];
  ts: string;
}

const MOMENT_NAAM: Record<MomentId, string> = {
  GEZINSUITBREIDING: 'gezinsuitbreiding',
  HUIS_KOPEN: 'een huis kopen',
  TROUWEN: 'trouwen',
  ZAAK_STARTEN: 'een zaak starten',
  ZAAK_UITBREIDEN: 'de zaak uitbreiden',
};
/** Moments with a large financial decision behind them: a person tends to land those better. */
const GROOT: MomentId[] = ['HUIS_KOPEN', 'ZAAK_STARTEN', 'ZAAK_UITBREIDEN'];

const r2 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;

export function beslis(input: {
  zakelijk: boolean;
  moment: MomentScore;
  /** Signals of this customer visible now. */
  signalen: Signaal[];
  /** Partners that share data with KBC for this customer. */
  delendePartners: number;
  playbook: PlaybookActie[];
  /** Earlier opportunities: answered in the app or not. */
  antwoordenInApp: number;
}): Pick<AgentBeslissing, 'kanaal' | 'engagement' | 'redenen'> {
  const digitaal = input.signalen.filter((s) => s.bron === 'APP' || s.bron === 'EIGEN_AI').length;
  const stp = input.playbook.length > 0 && input.playbook.every((a) => a.uitvoering !== 'ADVISEUR');
  const advies = input.playbook.filter((a) => a.uitvoering === 'ADVISEUR').length;
  const groot = GROOT.includes(input.moment.moment);

  const app = 0.4 + Math.min(digitaal, 4) * 0.07 + Math.min(input.delendePartners, 3) * 0.04 + (stp ? 0.1 : 0)
    + Math.min(input.antwoordenInApp, 2) * 0.05 - (input.zakelijk ? 0.1 : 0);
  const adviseur = 0.3 + (input.zakelijk ? 0.2 : 0) + (groot ? 0.15 : 0) + (advies ? 0.1 : 0);
  const kanaal: Kanaal = app >= adviseur ? 'automatisch' : 'adviseur';

  const redenen: string[] = [];
  if (kanaal === 'automatisch') {
    redenen.push(input.zakelijk ? 'Zakelijke klant, maar dit kan volledig digitaal' : 'Particuliere klant, standaardproducten');
    if (stp) redenen.push('Alle acties in het plan kunnen met één tik (STP)');
    if (digitaal) redenen.push(`Digitaal actief: ${digitaal} signalen uit de app of de eigen AI`);
    if (input.delendePartners) redenen.push(`Deelt data via ${input.delendePartners} partners`);
  } else {
    if (input.zakelijk) redenen.push('Zakelijke klant');
    if (groot) redenen.push(`Grote beslissing op komst: ${MOMENT_NAAM[input.moment.moment]}`);
    if (advies) redenen.push(`${advies} acties in het plan vragen advies van een adviseur`);
    redenen.push('Een persoonlijk gesprek haalt hier meer engagement dan een melding in de app');
  }
  return { kanaal, engagement: { app: r2(app), adviseur: r2(adviseur) }, redenen };
}

// ---- Partner pairs: two partners of one customer that would work better together ----

export interface KoppelingRegel {
  van: PartnerId;
  naar: PartnerId;
  ecosysteem: EcosysteemId;
  /** Why, in words the customer can read. */
  doel: string;
}

/** Only between partners the customer already lets share data with KBC; the customer consents per pair. */
export const KOPPELINGEN: KoppelingRegel[] = [
  { van: 'billit', naar: 'kube', ecosysteem: 'ENERGIE', doel: 'Je facturen voor walstroom in Billit worden vanzelf CO2-cijfers in Kube' },
  { van: 'encon', naar: 'kube', ecosysteem: 'ENERGIE', doel: 'De energie-audit van Encon vult je CO2-rapport in Kube automatisch aan' },
];
export type KoppelingStatus = 'mogelijk' | 'voorgesteld' | 'actief' | 'afgewezen';
export const koppelingId = (k: Pick<KoppelingRegel, 'van' | 'naar'>) => `koppeling:${k.van}~${k.naar}`;
