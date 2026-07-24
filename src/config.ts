import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MCP_BASE_URL: z.string().url(),
  MS_CLIENT_ID: z.string().min(1, 'MS_CLIENT_ID is required'),
  MS_CLIENT_SECRET: z.string().min(1, 'MS_CLIENT_SECRET is required'),
  MS_TENANT: z.string().default('common'),
  DB_PATH: z.string().default('./data/tokens.sqlite'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, 'TOKEN_ENCRYPTION_KEY is required')
    .refine((key) => Buffer.from(key, 'base64').length === 32, {
      message: 'TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key'
    }),
  DCR_BOOTSTRAP_TOKEN: z.string().optional()
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config = loadConfig();

export const msAuthorizationEndpoint = `https://login.microsoftonline.com/${config.MS_TENANT}/oauth2/v2.0/authorize`;
export const msTokenEndpoint = `https://login.microsoftonline.com/${config.MS_TENANT}/oauth2/v2.0/token`;
export const msGraphScopes = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Calendars.ReadWrite'
];
export const msRedirectUri = new URL('/oauth/microsoft/callback', config.MCP_BASE_URL).href;
