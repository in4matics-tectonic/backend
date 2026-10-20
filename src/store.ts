// In-memory state. Good enough for a PoC; swap for SQLite/Postgres behind these functions later.
import { randomUUID } from 'node:crypto';
import { beslis, KOPPELINGEN, koppelingId, type AgentBeslissing, type KoppelingStatus } from './agent.js';
import { ECOSYSTEMEN, type PartnerId } from './catalogus.js';
import { berekenScore, filterPlaybook, MOMENTEN, type MomentId, type Signaal } from './domain.js';
import { berekenEcosystemen, PARTNER_INFO, type Link } from './ecosysteem.js';
import { PRODUCT_CATALOGUS, seed } from './seed.js';

type StoredSignaal = Signaal & { klantId: string };

export type KansStatus = 'nieuw' | 'gezien' | 'interesse' | 'afgewezen';
/** A possible link an adviser sent to the customer's app. A snapshot: the link itself may change afterwards. */
export interface Kans {
  id: string;
  klantId: string;
  link: Pick<Link, 'ref' | 'naam' | 'ecosysteem'> & { id: string; soort: Link['soort'] | 'koppeling'; ecosysteemNaam: string };
  /** Who sent it: Kate (the agent, on her own) or an adviser. */
  afzender: 'kate' | 'adviseur';
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
let beslissingen: AgentBeslissing[] = [];
let koppelingen = new Map<string, KoppelingStatus>(); // `${klantId}:${koppelingId}` -> status (mogelijk when absent)
/** Actor in the audit log for everything the agent does on its own. */
export const AGENT = 'kate-agent';
let audit: { ts: string; actor: string; actie: string; klantId?: string; detail?: string }[] = [];

export const store = {
  reset() {
    db = seed();
    huidigeWeek = 0;
    bevestigingen = new Map();
    kansen = [];
    beslissingen = [];
    koppelingen = new Map();
    audit = [];
  },

  get week() {
    return huidigeWeek;
  },
  setWeek(week: number) {
    huidigeWeek = week;
    this.agent();
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
    this.agent();
    return signaal;
  },

  /** Revoke: delete every signal of a moment and forget the confirmation. */
  revokeMoment(klantId: string, moment: MomentId) {
    const before = db.signalen.length;
    db.signalen = db.signalen.filter((s) => !(s.klantId === klantId && s.moment === moment));
    bevestigingen.delete(`${klantId}:${moment}`);
    this.agent();
    return before - db.signalen.length;
  },

  bevestig(klantId: string, moment: MomentId) {
    bevestigingen.set(`${klantId}:${moment}`, true);
    this.agent();
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
    if (k.link.soort === 'koppeling') koppelingen.set(`${k.klantId}:${k.link.id}`, 'voorgesteld');
    // An adviser picked up the agent's task for this customer
    if (k.afzender === 'adviseur') {
      for (const b of beslissingen) if (b.klantId === k.klantId && b.status === 'taak') Object.assign(b, { status: 'afgehandeld', ts: nu });
    }
    return kans;
  },

  zetKansStatus(klantId: string, id: string, status: KansStatus) {
    const kans = kansen.find((k) => k.klantId === klantId && k.id === id);
    if (kans) Object.assign(kans, { status, bijgewerktOp: new Date().toISOString() });
    // A partner pair only goes live when the customer agrees in the app
    if (kans?.link.soort === 'koppeling' && (status === 'interesse' || status === 'afgewezen')) {
      koppelingen.set(`${klantId}:${kans.link.id}`, status === 'interesse' ? 'actief' : 'afgewezen');
    }
    return kans ?? null;
  },

  /** Partner pairs for this customer: both partners must share data with KBC now. */
  koppelingen(klantId: string) {
    const delen = new Set(this.ecosystemen(klantId).clusters.flatMap((c) => c.links).filter((l) => l.soort === 'partner' && l.status === 'actief').map((l) => l.ref));
    return KOPPELINGEN.filter((k) => delen.has(k.van) && delen.has(k.naar)).map((k) => {
      const id = koppelingId(k);
      const naam = (p: string) => PARTNER_INFO.find((x) => x.id === p)?.naam ?? p;
      return {
        id,
        van: `partner:${k.van}`,
        naar: `partner:${k.naar}`,
        naam: `${naam(k.van)} ↔ ${naam(k.naar)}`,
        ecosysteem: k.ecosysteem,
        ecosysteemNaam: ECOSYSTEMEN[k.ecosysteem],
        doel: k.doel,
        status: koppelingen.get(`${klantId}:${id}`) ?? ('mogelijk' as KoppelingStatus),
      };
    });
  },

  /** The agent's decisions, newest first. */
  beslissingen: (klantId?: string) =>
    beslissingen.filter((b) => !klantId || b.klantId === klantId).sort((a, b) => b.ts.localeCompare(a.ts)),

  /**
   * Runs the next-best-channel agent after every change (demo clock, signal, confirmation, revoke). One decision per
   * customer and moment, updated when the score moves; "automatisch" acts right away, "adviseur" leaves a task.
   */
  agent() {
    const nu = new Date().toISOString();
    for (const klant of db.klanten) {
      const momenten = this.momenten(klant.id).filter((m) => m.fase === 'vragen' || m.fase === 'voorstel');
      // A moment that dropped back or was revoked: its decision goes too
      beslissingen = beslissingen.filter((b) => b.klantId !== klant.id || momenten.some((m) => m.moment === b.moment));
      if (!momenten.length) continue;
      const signalen = this.signalen(klant.id);
      const eco = this.ecosystemen(klant.id);
      const links = eco.clusters.flatMap((c) => c.links);
      const eigenKansen = this.kansen(klant.id);
      for (const m of momenten) {
        const keuze = beslis({
          zakelijk: Boolean(klant.onderneming),
          moment: m,
          signalen,
          delendePartners: links.filter((l) => l.soort === 'partner' && l.status === 'actief').length,
          playbook: db.playbooks[m.moment] ?? [],
          antwoordenInApp: eigenKansen.filter((k) => k.status === 'interesse' || k.status === 'afgewezen').length,
        });
        let b = beslissingen.find((x) => x.klantId === klant.id && x.moment === m.moment);
        const nieuw = !b || b.kanaal !== keuze.kanaal || Math.abs(b.score - m.score) >= 0.05;
        if (!b) {
          b = { id: `beslissing-${randomUUID()}`, klantId: klant.id, moment: m.moment, score: m.score, ...keuze, actie: '', status: 'taak', voorstellen: [], ts: nu };
          beslissingen.push(b);
        }
        if (nieuw) Object.assign(b, keuze, { score: m.score, ts: nu });

        if (keuze.kanaal === 'automatisch') {
          // Kate asks herself. Once the moment is in voorstel (confirmed and ≥90%) she sends, once, what it opens most strongly
          const alVerstuurd = eigenKansen.some((k) => k.afzender === 'kate');
          const suggestie = m.fase === 'voorstel' && !alVerstuurd
            ? eco.verbanden
              .filter((v) => v.van === `moment:${m.moment}`)
              .sort((x, y) => y.gewicht - x.gewicht)
              .map((v) => links.find((l) => l.id === v.naar && l.status === 'mogelijk'))
              .find((l) => l && !eigenKansen.some((k) => k.link.id === l.id))
            : undefined;
          if (suggestie) {
            const cluster = eco.clusters.find((c) => c.links.includes(suggestie))!;
            this.addKans({
              klantId: klant.id,
              link: { id: suggestie.id, soort: suggestie.soort, ref: suggestie.ref, naam: suggestie.naam, ecosysteem: suggestie.ecosysteem, ecosysteemNaam: cluster.naam },
              score: suggestie.score ?? 0,
              waarom: [...new Set((suggestie.waarom ?? []).map((w) => w.reden))],
              bericht: null,
              verstuurdDoor: AGENT,
              afzender: 'kate',
            });
            this.log(AGENT, 'kans_verstuurd', klant.id, suggestie.id);
            Object.assign(b, { actie: `Kate stuurde zelf een voorstel naar de app: ${suggestie.naam}`, status: 'uitgevoerd', ts: nu });
          } else if (!b.actie || nieuw) {
            const verstuurd = eigenKansen.find((k) => k.afzender === 'kate');
            Object.assign(b, {
              actie: verstuurd ? `Kate stuurde zelf een voorstel naar de app: ${verstuurd.link.naam}` : m.bevestigd ? 'Kate zet het plan klaar in de app' : 'Kate vraagt het zelf in de app',
              status: 'uitgevoerd',
            });
          }
        } else if (nieuw) {
          const tips = links.filter((l) => l.status === 'mogelijk').sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 2);
          const paren = this.koppelingen(klant.id).filter((k) => k.status === 'mogelijk').slice(0, 1);
          Object.assign(b, {
            actie: `Taak voor de adviseur: neem contact op met ${klant.naam} over ${m.moment === 'ZAAK_UITBREIDEN' ? 'de groei van de zaak' : 'dit moment'}`,
            status: b.status === 'afgehandeld' && b.kanaal === 'adviseur' ? 'afgehandeld' : 'taak',
            voorstellen: [...tips.map((l) => ({ id: l.id, naam: l.naam })), ...paren.map((k) => ({ id: k.id, naam: k.naam }))],
          });
        }
        if (nieuw) this.log(AGENT, 'agent_beslissing', klant.id, `${m.moment}/${keuze.kanaal}`);
      }
    }
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
