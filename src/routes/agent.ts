// The next-best-channel agent's decisions (see agent.ts): what it handled on its own, and the tasks it left for an
// adviser. Read-only: the agent acts by itself inside the backend, advisers act through the normal endpoints.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireKlantAccess, requireRole } from '../auth.js';
import { AgentBeslissing, fouten } from '../schemas.js';
import { store } from '../store.js';

const tags = { security: [{ bearer: [] }], tags: ['agent'] };

export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', authenticate);

  app.get(
    '/agent',
    {
      preHandler: requireRole('adviseur'),
      schema: { ...tags, description: 'Every decision of the agent, newest first.', response: { 200: z.array(AgentBeslissing), ...fouten(401, 403) } },
    },
    async (req) => {
      store.log(req.user.sub, 'read_agent');
      return store.beslissingen();
    },
  );

  app.get(
    '/klanten/:klantId/agent',
    {
      preHandler: requireKlantAccess('adviseur'),
      schema: {
        ...tags,
        description: "The agent's decisions for one customer, newest first.",
        params: z.object({ klantId: z.string().max(32) }),
        response: { 200: z.array(AgentBeslissing), ...fouten(400, 401, 403, 404) },
      },
    },
    async (req) => {
      store.log(req.user.sub, 'read_agent', req.params.klantId);
      return store.beslissingen(req.params.klantId);
    },
  );
};
