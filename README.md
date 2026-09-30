# KBC Momentum – Backend

Aggregator API for the KBC Momentum PoC. The mobile app, the backoffice, the MCP server and the signal sources all connect here. It serves customer data (accounts, transactions, products, Doccle documents), takes in **signals** and returns scored life **moments**.

- Spec: [KBC Momentum – Technisch document](https://github.com/in4matics-tectonic/docs/wiki/KBC-Momentum-%E2%80%93-Technisch-document)
- Integration guide (endpoints, roles, payloads): [AGENTS.md](AGENTS.md)
- Live API docs: `/docs` (Swagger UI), `/docs/json` (OpenAPI)

## Run locally

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm dev               # http://127.0.0.1:3000
```

No configuration is required. Optionally copy `.env.example` to `.env` to override defaults. Set a fixed `JWT_SECRET` if tokens should survive restarts.

## Try it

```bash
TOKEN=$(curl -s -X POST localhost:3000/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"tom","password":"in4matics-must-win"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s localhost:3000/v1/klanten/K-2024-0417/momenten -H "authorization: Bearer $TOKEN"
```

Demo users: `tom`, `lien`, `sarah` (customers), `adviseur` (backoffice) and `ingest` (signal sources). They all use the password `in4matics-must-win` (override with `DEMO_PASSWORD`).

## Demo flow

Log in as `adviseur` and call `POST /v1/demo/volgende` repeatedly. Tom en Lien's score for `GEZINSUITBREIDING` climbs 35 → 74 → 79 → 82 → 87 → 93 → 94%. Once Tom confirms (`POST /v1/klanten/K-2024-0417/momenten/GEZINSUITBREIDING/bevestig`) the moment moves to `voorstel` and the playbook actions appear. `POST /v1/demo/reset` starts over.

## Security

- JWT (HS256, pinned, 1h) with three roles: `klant`, `adviseur` and `ingest`
- Object-level access control: customers only reach their own `klantId` and get a 404 for any other
- Passwords hashed with scrypt; login is timing-safe and rate-limited (5/min)
- Strict Zod validation on every input, 64 KB body limit, global rate limit
- Helmet security headers, CORS allowlist, no stack traces in responses
- Consent enforced at ingestion and in scoring; sensitive signals are hidden from customers
- Audit log of personal-data reads and all writes (`GET /v1/audit`)
- Refuses to start with weak secrets; a random JWT secret is generated if none is set

## Deploy

No build step and no database. Deploy the `Dockerfile` to any container host (Railway, Render, Fly.io, Cloud Run), or use a Node runtime with `pnpm install` / `pnpm start`. Set `JWT_SECRET` (recommended), `DEMO_MODE`, `CORS_ORIGINS`, `HOST=0.0.0.0` and `TRUST_PROXY=true`. State lives in memory, so run a single instance.

## Stack

Node, TypeScript, Fastify 5, Zod, `@fastify/jwt`, `@fastify/helmet`, `@fastify/cors` and `@fastify/rate-limit`.
