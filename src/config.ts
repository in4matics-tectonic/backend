import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}

const Env = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('127.0.0.1'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DEMO_PASSWORD: z.string().min(12, 'DEMO_PASSWORD must be at least 12 characters'),
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    // "https://*.lovable.app" -> /^https:\/\/[a-z0-9-]+\.lovable\.app$/
    .map((o) =>
      o.includes('*') ? new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[a-z0-9-]+') + '$') : o,
    ),
};
