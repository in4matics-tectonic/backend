import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, verifyLogin } from '../auth.js';
import { store } from '../store.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/login',
    {
      // Brute-force protection on top of the global limit
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        body: z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) }).strict(),
      },
    },
    async (req, reply) => {
      const user = verifyLogin(req.body.username, req.body.password);
      if (!user) {
        store.log(req.body.username, 'login_failed', undefined, req.ip);
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      store.log(user.sub, 'login');
      const token = app.jwt.sign(user);
      return { token, tokenType: 'Bearer', expiresIn: 3600, user };
    },
  );

  app.get('/me', { onRequest: authenticate, schema: { tags: ['auth'], security: [{ bearer: [] }] } }, async (req) => req.user);
};
