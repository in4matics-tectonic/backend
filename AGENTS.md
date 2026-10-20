# KBC Momentum – Backend API

Aggregator API for the KBC Momentum PoC. Every other project talks to this service:

| Consumer | What it does with the API |
| --- | --- |
| **Mobile app** (Lovable, `/app`) | Reads the customer's own data + moments, confirms/revokes a moment, manages consent |
| **Backoffice** (Lovable, `/backoffice`) | Reads all customers, full signal timeline, drives the demo clock |
| **MCP server** | Acts *on behalf of a customer*: share / read / revoke a life moment |
| **Signal sources** (Doccle, geofence, transactions, LLM classifier) | Push signals in |

Functional/technical spec: https://github.com/in4matics-tectonic/docs/wiki/KBC-Momentum-%E2%80%93-Technisch-document
Live, always-correct contract: **`GET /docs`** (Swagger UI) and **`GET /docs/json`** (OpenAPI 3). If this file and `/docs` disagree, `/docs` wins.

---

## Quick start for an integrating agent

```bash
# 1. log in (all demo users share the password in4matics-must-win)
curl -s -X POST $API/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"tom","password":"in4matics-must-win"}'
# -> { "token": "eyJ...", "tokenType": "Bearer", "expiresIn": 3600, "user": { "sub": "tom", "role": "klant", "klantId": "K-2024-0417" } }

# 2. call anything with the bearer token
curl -s $API/v1/klanten/K-2024-0417/momenten -H "authorization: Bearer $TOKEN"
```

- Base path: `/v1`. All bodies are JSON. Tokens expire after **1 hour** → on `401`, log in again.
- Use `user.klantId` from the login response; don't hardcode customer ids in the app.

## Users and roles

| Username | Role | klantId | Can |
| --- | --- | --- | --- |
| `tom`, `lien` | `klant` | `K-2024-0417` (Tom en Lien, the demo persona) | Own data only; confirm/revoke/share moments; change consent |
| `sarah` | `klant` | `K-2025-0102` | Same; exists to prove customers are isolated |
| `adviseur` | `adviseur` | – | Read every customer, full signal detail, audit log, demo controls |
| `ingest` | `ingest` | – | **Only** `POST /v1/klanten/:klantId/signalen` |

Which account to use: mobile app → `tom`/`lien`; backoffice → `adviseur`; MCP server → the customer's own token (a customer's AI acts as the customer); signal pipelines → `ingest`.

## Endpoints

`K` = `/v1/klanten/:klantId`. Moment ids: `GEZINSUITBREIDING | HUIS_KOPEN | ZAAK_STARTEN`.

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `POST /v1/auth/login` | public (5/min/IP) | `{username, password}` → JWT |
| `GET /v1/me` | any | Decoded token |
| `GET /v1/klanten` | adviseur | List customers `[{id, naam}]` |
| `GET K` | klant, adviseur | Profile: `naam`, `toestemming`, `producten`, `landschap` |
| `GET K/rekeningen` | klant, adviseur | Bank accounts |
| `GET K/transacties?rekeningId=&limit=` | klant, adviseur | Transactions, newest first (limit ≤ 200, default 50) |
| `GET K/producten` | klant, adviseur | `[{code, naam, catalogusId, ecosysteem}]` |
| `GET K/documenten` | klant, adviseur | Doccle documents: **metadata only** (`afzender`, `type`, `datum`) |
| `PUT K/toestemming` | klant | Partial `{ "DOCCLE": false, ... }` → updated consent |
| `POST K/signalen` | ingest, adviseur | Ingest a signal (see below) |
| `GET K/signalen` | klant, adviseur | adviseur: all; klant: non-sensitive only, reduced fields |
| `GET K/momenten` | klant, adviseur | `{ week, momenten: [...] }` computed scores (see below) |
| `GET K/momenten/:moment` | klant, adviseur | One moment (404 if no signals) |
| `POST K/momenten/:moment/bevestig` | klant | "Ja, klopt": unlocks phase `voorstel` + actions |
| `DELETE K/momenten/:moment` | klant | "Niet voor ons" / MCP `revoke_moment`: **deletes** the signals |
| `POST K/momenten/delen` | klant | MCP `share_life_moment`: `{moment, fase: orienterend\|plannend\|beslist, verwachte_maand?: "YYYY-MM"}` |
| `GET /v1/catalogus` | klant, adviseur | Whole KBC catalogue in one call: `{ecosystemen, producten, partners}` |
| `GET /v1/ecosystemen` · `GET /v1/ecosystemen/:ecosysteem` | klant, adviseur | The 21 ecosystems; one ecosystem with its products |
| `GET /v1/partners` | klant, adviseur | The 40 partners: `{id, naam, ecosysteem, ecosystemen, producten, gevoelig}` |
| `GET K/partners` | klant, adviseur | Every partner with the customer's relation: `klantBijPartner`, `deelt`, `herkomst`, `sinds` |
| `PUT K/partners/:partner` | klant | `{deelt: boolean}`: allow / stop that partner sharing data with KBC |
| `GET K/ecosystemen` | klant, adviseur | The customer's ecosystem clusters with active, known and possible links (see below) |
| `GET /v1/audit` | adviseur | Last 500 audit events |
| `GET /v1/demo` · `POST /v1/demo/volgende` · `POST /v1/demo/week {week}` · `POST /v1/demo/reset` | adviseur, only if `DEMO_MODE=true` | Demo clock: Speel af / Volgende / Reset |
| `GET /health` | public | `{ok:true}` |

### Ingesting a signal

```json
POST /v1/klanten/K-2024-0417/signalen   (role ingest)
{ "bron": "DOCCLE", "moment": "GEZINSUITBREIDING", "gewicht": 0.6,
  "label": "Document van een gynaecoloog ontvangen", "gevoelig": true, "week": 10 }
```

- `bron`: `EIGEN_AI | DOCCLE | GEOFENCE | APP | REKENING`. `gewicht`: -1..1 (negative = counter-signal). `label` ≤ 200 chars, neutral wording, **never medical details**. `week` is optional (defaults to the current demo week).
- Unknown fields → `400`. No customer consent for that `bron` → `422 {"error":"no_consent"}` and the signal is **not stored**.
- For Doccle, classify on metadata only (afzender/type/datum); never send document content anywhere.

### Moment object

adviseur sees the full object:

```json
{ "moment": "GEZINSUITBREIDING", "score": 0.94, "fase": "vragen", "bevestigd": false,
  "signalen": ["s1","s2"], "acties": [ /* playbook actions */ ], "signalenDetail": [ /* full signals */ ] }
```

klant sees a privacy-filtered object:

```json
{ "moment": "GEZINSUITBREIDING", "score": 0.94, "fase": "vragen", "bevestigd": false,
  "acties": [], "waarom": ["3 aankopen in babyspeciaalzaak", "..."], "andereSignalen": 2 }
```

- `fase`: `stil` (<40%) → `info` (≥40%) → `vragen` (≥70%) → `voorstel` (≥90% **and** confirmed).
- A customer gets `acties` only in `voorstel`. `andereSignalen` is the number of sensitive signals whose labels are hidden; show it as "en andere signalen waarvoor je toestemming gaf".
- Playbook actions for products the customer already has are filtered out (e.g. `a7` autolening).

### Ecosystems, partners and clusters

The catalogue (`src/catalogus.ts`, from `KBC_Ecosystems.xlsx`) has 21 ecosystems (`WONEN`, `MOBILITEIT`, `ENERGIE`, `REIZEN`, `ONDERNEMEN`, …), 229 products and 40 partners. Product ids are slugs of the English name (`home-loan`, `train-tickets-nmbs`); `partners` names the third party behind a product. `kanaal: "B2B"` marks APIs, widgets and Partner Hub integrations: those are never suggested to a customer.

Per customer, `GET K/ecosystemen` returns one **cluster per ecosystem** the customer touches:

```json
{ "week": 0,
  "samenvatting": { "actief": 10, "gekend": 3, "mogelijk": 21, "ecosystemen": 10, "nieuweEcosystemen": ["ENERGIE","PENSIOEN","SPAREN"] },
  "clusters": [
    { "ecosysteem": "WONEN", "naam": "Wonen", "status": "actief", "links": [
      { "id": "product:home-loan", "soort": "product", "ref": "home-loan", "naam": "Home loan", "ecosysteem": "WONEN", "status": "actief", "herkomst": "KBC_PRODUCT" },
      { "id": "partner:setle", "soort": "partner", "ref": "setle", "naam": "Setle", "status": "actief", "herkomst": "KBC_MOBILE", "sinds": "2025-11-04", "...": "" },
      { "id": "product:renovation-loan", "status": "mogelijk", "score": 0.65,
        "waarom": [{ "via": "product:home-loan", "naam": "Home loan", "reden": "Een woonkrediet loopt vaak samen met …" }], "...": "" } ] } ],
  "verbanden": [ { "van": "partner:setle", "naar": "product:renovation-loan", "gewicht": 0.5 } ] }
```

- Link `status`: **`actief`** = a KBC product the customer holds, or a partner the customer lets share data with KBC. **`gekend`** = a partner relation KBC knows from its own data (`herkomst`: `REKENING` payments seen on the account, `KBC_MOBILE` the partner service was used inside the app), without data sharing. **`mogelijk`** = a product or partner the customer might need.
- Cluster `status` is its strongest link. A cluster with only `mogelijk` links is an ecosystem that's new for the customer (`samenvatting.nieuweEcosystemen`): that's where the app's world can grow.
- `verbanden` are the reasoning edges behind every `mogelijk` link (draw them as the graph). `van` can also be `moment:<MomentId>`.
- Possible links come from fixed rules (`REGELS` in `src/ecosysteem.ts`) with the same noisy-OR as the moment score; a `gekend` link counts half, an active one fully. Shown from 25%. Only a **confirmed** life moment adds suggestions.
- Consent: a `REKENING`-origin relation only exists with `REKENING` consent, a `KBC_MOBILE` one only with `APP` consent.
- Health partners (`helena`, `leadlife`, `kom-op-tegen-kanker`, `gevoelig: true`) are never inferred, never suggested and never feed suggestions; `PUT … {deelt:true}` on them → `422 gevoelige_partner`.
- `PUT K/partners/:partner {deelt:true}` on a partner KBC didn't know creates the relation (`herkomst: "KLANT"`); switching that one off removes it again.

### Demo timeline

Signals `s1..s7` (weeks 7–20) are pre-seeded for Tom en Lien and only "exist" once the demo clock reaches their week. The clock starts at 0. Each `POST /v1/demo/volgende` jumps to the next week and the score goes **35 → 74 → 79 → 82 → 87 → 93 → 94%**. `POST /v1/demo/reset` restores all seed data. Frontends should poll `GET K/momenten` (e.g. every 1–2 s) to stay in sync.

### Errors

Always `{ "error": "<code>", ... }`: `400 validation_error` (with `issues`), `401 unauthorized|invalid_credentials`, `403 forbidden` (wrong role), `404 not_found` (also when a customer requests **another** customer's id, on purpose), `422 no_consent` / `gevoelige_partner`, `429` rate limited (300/min global, 5/min on login).

---

## Rules for agents integrating with this API

1. The demo password `in4matics-must-win` may be hardcoded in frontends for the PoC. **Never** hardcode or commit `JWT_SECRET` or a token; keep tokens in memory or `sessionStorage`.
2. Don't ask for new "god-mode" endpoints to work around roles. If your app needs data it can't get, add a scoped endpoint here.
3. Keep the Dutch field names (`bron`, `gewicht`, `fase`, …). They match the types in the tech doc, so the frontend can reuse `src/types.ts`.
4. The score is deterministic and computed **here**. Don't let an LLM decide scores or phases.
5. Sensitive signals (`gevoelig: true`) are never shown to the customer and never unlock proposals without confirmation. Don't re-derive them client-side from the adviseur view.
6. The MCP server exposes only share/read/revoke. It must never move money or open products.

## Working on this backend

Stack: Node ≥ 22, TypeScript, Fastify 5, Zod 3 (validation + OpenAPI via `fastify-type-provider-zod`), `@fastify/jwt` (HS256, 1h, pinned algorithm), helmet, CORS allowlist, rate limiting. Data is **in memory** and resets on restart (`src/seed.ts`).

```bash
pnpm install
pnpm dev               # http://127.0.0.1:3000, docs at /docs
pnpm typecheck
```

```
src/
  config.ts        env parsing + defaults; refuses to start with weak secrets
  domain.ts        types, score engine (berekenScore), playbook filter
  catalogus.ts     KBC ecosystems, products and partners (from KBC_Ecosystems.xlsx)
  ecosysteem.ts    partner relations, suggestion rules (REGELS) and the cluster engine (berekenEcosystemen)
  seed.ts          mock customers, accounts, transactions, Doccle docs, signals, playbook, partner relations
  store.ts         in-memory state + demo clock + audit log
  auth.ts          demo users (scrypt), JWT roles, requireRole / requireKlantAccess
  app.ts           Fastify setup, security plugins, error handler, route mounting
  routes/          auth, klanten (customer data), momenten (signals + moments + MCP share), ecosystemen (catalogue, partners, clusters), demo
```

Adding an endpoint: put it in the right `routes/*.ts`, give it a Zod `schema` (`params`/`querystring`/`body`, use `.strict()` on bodies) plus `tags` and `security: [{ bearer: [] }]`. Guard it with `requireKlantAccess(...roles)` for anything under `/klanten/:klantId`, or `requireRole(...)` otherwise. Call `store.log(...)` on reads of personal data and on every write. Then run `pnpm typecheck`.

## Hosting

Any container host works (Railway, Render, Fly.io, Cloud Run). There's no build step and no database.

- `Dockerfile` runs as a non-root user and listens on `0.0.0.0:$PORT` with `TRUST_PROXY=true`.
- Set env vars on the host: `JWT_SECRET` (recommended, else tokens reset on each restart), `DEMO_MODE`, `CORS_ORIGINS` (include your Lovable preview + published origins). Most hosts inject `PORT` themselves.
- Without Docker (e.g. Railway/Render Node runtime): build `pnpm install`, start `pnpm start`, set `HOST=0.0.0.0` and `TRUST_PROXY=true`.
- It runs as a single instance: state is in memory, so don't scale it horizontally.
