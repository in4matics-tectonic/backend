// In-memory state. Good enough for a PoC; swap for SQLite/Postgres behind these functions later.
import { randomUUID } from 'node:crypto';
import { berekenScore, filterPlaybook, MOMENTEN, type MomentId, type Signaal } from './domain.js';
import { seed } from './seed.js';

type StoredSignaal = Signaal & { klantId: string };

let db = seed();
let huidigeWeek = 0; // demo clock
let bevestigingen = new Map<string, boolean>(); // `${klantId}:${moment}` -> confirmed
let audit: { ts: string; actor: string; actie: string; klantId?: string; detail?: string }[] = [];

export const store = {
  reset() {
    db = seed();
    huidigeWeek = 0;
    bevestigingen = new Map();
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

  log(actor: string, actie: string, klantId?: string, detail?: string) {
    audit.push({ ts: new Date().toISOString(), actor, actie, klantId, detail });
    if (audit.length > 5000) audit.shift();
  },
  audit: () => audit.slice().reverse(),
};
