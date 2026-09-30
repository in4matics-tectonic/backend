import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError } from 'fastify';
import { hasZodFastifySchemaValidationErrors, jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authenticate, requireRole } from './auth.js';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { demoRoutes } from './routes/demo.js';
import { klantRoutes } from './routes/klanten.js';
import { momentRoutes } from './routes/momenten.js';
import { store } from './store.js';

export async function buildApp() {
  const app = Fastify({
    logger: { redact: ['req.headers.authorization', 'body.password'] },
    bodyLimit: 64 * 1024,
    trustProxy: config.TRUST_PROXY,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    // swagger-ui needs inline scripts/styles; the API itself only returns JSON
    contentSecurityPolicy: { directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'style-src': ["'self'", "'unsafe-inline'"] } },
  });
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  // In the demo one browser runs every part (app, backoffice, chat, showcase tour), each polling every ~1.5 s from
  // the same IP, so the per-IP budget is higher there. Login keeps its own 5/min limit.
  await app.register(rateLimit, { max: config.DEMO_MODE ? 1200 : 300, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '1h', iss: 'kbc-momentum' },
    verify: { algorithms: ['HS256'], allowedIss: 'kbc-momentum' },
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'KBC Momentum API', version: '0.1.0', description: 'Aggregator API: customer data in, signals in, moments out.' },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: 'validation_error', issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })) });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code ?? 'bad_request', message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal_error' }); // never leak stack traces
  });

  app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(klantRoutes);
      await v1.register(momentRoutes);
      if (config.DEMO_MODE) await v1.register(demoRoutes);
      v1.get('/audit', { onRequest: authenticate, preHandler: requireRole('adviseur'), schema: { tags: ['audit'], security: [{ bearer: [] }] } }, async () =>
        store.audit().slice(0, 500),
      );
    },
    { prefix: '/v1' },
  );

  return app;
}
