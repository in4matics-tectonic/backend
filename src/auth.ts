import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { store } from './store.js';

/**
 * klant    – customer (mobile app, or their own AI via MCP): only their own data
 * adviseur – backoffice: read all customers, drive the demo
 * ingest   – signal sources (Doccle, geofence, transactions…): may only push signals
 */
export type Role = 'klant' | 'adviseur' | 'ingest';
export interface TokenUser {
  sub: string;
  role: Role;
  klantId?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenUser;
    user: TokenUser;
  }
}

function hash(password: string, salt: Buffer) {
  return scryptSync(password, salt, 64);
}

const USERS: Record<string, { role: Role; klantId?: string }> = {
  tom: { role: 'klant', klantId: 'K-2024-0417' },
  lien: { role: 'klant', klantId: 'K-2024-0417' },
  sarah: { role: 'klant', klantId: 'K-2025-0102' },
  adviseur: { role: 'adviseur' },
  ingest: { role: 'ingest' },
};

// Demo users share DEMO_PASSWORD; only a salted scrypt hash is kept in memory.
const credentials = new Map(
  Object.entries(USERS).map(([name, u]) => {
    const salt = randomBytes(16);
    return [name, { ...u, salt, hash: hash(config.DEMO_PASSWORD, salt) }];
  }),
);
const dummySalt = randomBytes(16);
const dummyHash = hash('dummy-password-for-timing', dummySalt);

/** Returns the user or null. Always runs scrypt so response time doesn't reveal which usernames exist. */
export function verifyLogin(username: string, password: string): TokenUser | null {
  const c = credentials.get(username);
  const candidate = hash(password, c?.salt ?? dummySalt);
  const ok = timingSafeEqual(candidate, c?.hash ?? dummyHash) && !!c;
  return ok ? { sub: username, role: c!.role, klantId: c!.klantId } : null;
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'forbidden' });
  };
}

/**
 * Object-level authorization for /v1/klanten/:klantId/*.
 * A customer asking for someone else's id gets 404, same as a non-existent id, so ids can't be probed.
 */
export function requireKlantAccess(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const { role, klantId } = req.user;
    const params = req.params as { klantId: string };
    if (!roles.includes(role)) return reply.code(403).send({ error: 'forbidden' });
    const ownsIt = role !== 'klant' || klantId === params.klantId;
    if (!ownsIt || !store.klant(params.klantId)) return reply.code(404).send({ error: 'not_found' });
  };
}
