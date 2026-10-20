// In-memory state. Good enough for a PoC; swap for SQLite/Postgres behind these functions later.
import { randomUUID } from 'node:crypto';
import type { PartnerId } from './catalogus.js';
import { berekenScore, filterPlaybook, MOMENTEN, type MomentId, type Signaal } from './domain.js';
import { berekenEcosystemen, type Link } from './ecosysteem.js';
import { PRODUCT_CATALOGUS, seed } from './seed.js';

type StoredSignaal = Signaal & { klantId: string };

export type KansStatus = 'nieuw' | 'gezien' | 'interesse' | 'afgewezen';
/** A possible link an adviser sent to the customer's app. A snapshot: the link itself may change afterwards. */
export interface Kans {
  id: string;
  klantId: string;
  link: Pick<Link, 'id' | 'soort' | 'ref' | 'naam' | 'ecosysteem'> & { ecosysteemNaam: string };
  score: number; // at the time it was sent
  waarom: string[]; // the reasons behind the suggestion, in words the customer can read
  bericht: string | null; // optional personal note from the adviser
  status: KansStatus;
  verstuurdDoor: string;
  verstuurdOp: string;
  bijgewerktOp: string;
}

let db = seed();
let huidigeWeek = 0; // demo clock
let bevestigingen = new Map<string, boolean>(); // `${klantId}:${moment}` -> confirmed
let kansen: Kans[] = [];
let audit: { ts: string; actor: string; actie: string; klantId?: string; detail?: string }[] = [];

export const store = {
  reset() {
    db = seed();
    huidigeWeek = 0;
    bevestigingen = new Map();
    kansen = [];
    audit = [];
  },

  get week() {
    return huidigeWeek;
  },
  setWeek(week: number) {
    huidigeWeek = week;
  },

  klant: (id: string) => db.klanten.find((k) => k.id === id),
  klanten: () => db.klanten,
  rekeningen: (klantId: string) => db.rekeningen.filter((r) => r.klantId === klantId),
  transacties(klantId: string, rekeningId?: string) {
    const ids = new Set(this.rekeningen(klantId).map((r) => r.id));
    return db.transacties
      .filter((t) => ids.has(t.rekeningId) && (!rekeningId || t.rekeningId === rekeningId))
      .sort((a, b) => b.datum.localeCompare(a.datum));
  },
  documenten: (klantId: string) => db.documenten.filter((d) => d.klantId === klantId),

  /** Signals visible at the current demo week. */
  signalen: (klantId: string): StoredSignaal[] =>
    db.signalen.filter((s) => s.klantId === klantId && s.week <= huidigeWeek).sort((a, b) => a.week - b.week),

  addSignaal(klantId: string, s: Omit<Signaal, 'id' | 'week'> & { week?: number }): StoredSignaal {
    const signaal = { ...s, id: `s-${randomUUID()}`, week: s.week ?? huidigeWeek, klantId };
    db.signalen.push(signaal);
    return signaal;
  },

  /** Revoke: delete every signal of a moment and forget the confirmation. */
  revokeMoment(klantId: string, moment: MomentId) {
    const before = db.signalen.length;
    db.signalen = db.signalen.filter((s) => !(s.klantId === klantId && s.moment === moment));
    bevestigingen.delete(`${klantId}:${moment}`);
    return before - db.signalen.length;
  },

  bevestig(klantId: string, moment: MomentId) {
    bevestigingen.set(`${klantId}:${moment}`, true);
  },

  momenten(klantId: string) {
    const klant = this.klant(klantId)!;
    const signalen = this.signalen(klantId);
    return MOMENTEN.map((moment) => {
      const score = berekenScore(klant, signalen, moment, huidigeWeek, bevestigingen.get(`${klantId}:${moment}`) ?? false);
      const acties = score.fase === 'stil' ? [] : filterPlaybook(klant, db.playbooks[moment] ?? []);
      return { ...score, acties };
    }).filter((m) => m.signalen.length > 0);
  },

  partnerRelaties: (klantId: string) => db.partnerRelaties.filter((r) => r.klantId === klantId),

  /**
   * Customer switches data sharing for a partner. Switching it on for a partner KBC didn't know creates the
   * relation (origin KLANT); switching that one off again removes it, since KBC never knew it otherwise.
   */
  zetDeling(klantId: string, partner: PartnerId, deelt: boolean) {
    const r = db.partnerRelaties.find((x) => x.klantId === klantId && x.partner === partner);
    if (!r) {
      if (deelt) db.partnerRelaties.push({ klantId, partner, herkomst: 'KLANT', deelt, sinds: new Date().toISOString().slice(0, 10) });
    } else if (!deelt && r.herkomst === 'KLANT') {
      db.partnerRelaties = db.partnerRelaties.filter((x) => x !== r);
    } else {
      r.deelt = deelt;
    }
    return db.partnerRelaties.find((x) => x.klantId === klantId && x.partner === partner) ?? null;
  },

  ecosystemen(klantId: string) {
    const klant = this.klant(klantId)!;
    return berekenEcosystemen({
      producten: klant.producten.map((c) => PRODUCT_CATALOGUS[c] ?? c),
      relaties: this.partnerRelaties(klantId),
      toestemming: klant.toestemming,
      // Only a moment the customer confirmed may widen their world; a detected-but-unconfirmed one may not
      bevestigdeMomenten: this.momenten(klantId).filter((m) => m.bevestigd).map((m) => m.moment),
    });
  },

  /** Newest first. */
  kansen: (klantId: string) => kansen.filter((k) => k.klantId === klantId).sort((a, b) => b.verstuurdOp.localeCompare(a.verstuurdOp)),

  addKans(k: Omit<Kans, 'id' | 'status' | 'verstuurdOp' | 'bijgewerktOp'>): Kans {
    const nu = new Date().toISOString();
    const kans: Kans = { ...k, id: `kans-${randomUUID()}`, status: 'nieuw', verstuurdOp: nu, bijgewerktOp: nu };
    kansen.push(kans);
    return kans;
  },

  zetKansStatus(klantId: string, id: string, status: KansStatus) {
    const kans = kansen.find((k) => k.klantId === klantId && k.id === id);
    if (kans) Object.assign(kans, { status, bijgewerktOp: new Date().toISOString() });
    return kans ?? null;
  },

  log(actor: string, actie: string, klantId?: string, detail?: string) {
    // Polling clients re-read the same data every few seconds: one entry per minute per read is enough
    const vorige = audit.findLast((a) => a.actor === actor && a.actie === actie && a.klantId === klantId);
    if (actie.startsWith('read_') && vorige && Date.now() - Date.parse(vorige.ts) < 60_000) return;
    audit.push({ ts: new Date().toISOString(), actor, actie, klantId, detail });
    if (audit.length > 5000) audit.shift();
  },
  audit: () => audit.slice().reverse(),
};
