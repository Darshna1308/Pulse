import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REFRESH_IDLE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  ML_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  ML_SERVICE_TOKEN: z.string().optional(),
  ML_TIMEOUT_MS: z.coerce.number().int().min(250).max(60_000).default(8000),
  ML_DETECTION_POLICY: z.enum(['model', 'hybrid']).default('hybrid'),
  ALLOW_DEMO_DATA: bool.optional(),
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().min(1).max(100_000).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof schema> & { cookieSecure: boolean; allowDemoData: boolean; corsOrigins: string[] };

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';
  return {
    ...env,
    cookieSecure: env.COOKIE_SECURE ?? isProd,
    allowDemoData: env.ALLOW_DEMO_DATA ?? !isProd,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

let cached: Env | undefined;

/** Validated configuration. Loaded lazily so tests can set process.env first. */
export function env(): Env {
  cached ??= load();
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
