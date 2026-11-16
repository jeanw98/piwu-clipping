import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().optional().default(''),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    ADMIN_EMAIL: z.string().email().default('admin@piwumarket.com'),
    ADMIN_PASSWORD: z.string().min(8).default('change-me-admin'),
    ANTHROPIC_API_KEY: z.string().min(1),
    /** Model for every Claude call (scripts, specs, highlight picking). */
    ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-5'),
    ELEVENLABS_API_KEY: z.string().min(1),
    ELEVENLABS_VOICE_ID: z.string().min(1).default('21m00Tcm4TlvDq8ikWAM'),
    OPENAI_API_KEY: z.string().min(1),
    LEONARDO_API_KEY: z.string().min(1),
    RUNWAY_API_SECRET: z.string().optional().default(''),
    MINIMAX_API_KEY: z.string().optional().default(''),
    MINIMAX_VIDEO_MODEL: z
      .string()
      .optional()
      .default('MiniMax-Hailuo-2.3-Fast'),
    MINIMAX_VIDEO_RESOLUTION: z
      .enum(['512P', '768P', '1080P'])
      .optional()
      .default('768P'),
    /** Optional better tier for the hook scene; empty = same as MINIMAX_VIDEO_*. */
    MINIMAX_HOOK_MODEL: z.string().optional().default(''),
    MINIMAX_HOOK_RESOLUTION: z
      .union([z.enum(['512P', '768P', '1080P']), z.literal('')])
      .optional()
      .default(''),
    MINIMAX_VIDEO_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(600_000),
    /** Motion Graphics: max objects generated per clip when missing from the library. */
    MG_MAX_GENERATED_ASSETS: z.coerce.number().int().min(0).max(10).default(3),
    /** Motion Graphics: max full backgrounds generated per clip for very specific places. */
    MG_MAX_GENERATED_BACKGROUNDS: z.coerce.number().int().min(0).max(6).default(2),
    // ---------- social publishing (all optional: a provider without its
    // credentials is shown as "not configured") ----------
    /** 32-byte key (base64 or hex) to encrypt OAuth tokens at rest. */
    SOCIAL_TOKEN_KEY: z.string().optional().default(''),
    /** Public base URL where the API is reachable (OAuth callbacks), e.g. https://clipping.piwumarket.com */
    PUBLIC_API_URL: z.string().optional().default(''),
    /** Public web URL to return to after linking (defaults to CORS_ORIGIN). */
    PUBLIC_WEB_URL: z.string().optional().default(''),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    INSTAGRAM_APP_ID: z.string().optional().default(''),
    INSTAGRAM_APP_SECRET: z.string().optional().default(''),
    TIKTOK_CLIENT_KEY: z.string().optional().default(''),
    TIKTOK_CLIENT_SECRET: z.string().optional().default(''),
    // ---------- clipping from YouTube / Instagram links ----------
    /** Netscape cookies.txt (browser export) mounted in the container; helps when YouTube asks "not a bot". */
    YTDLP_COOKIES_FILE: z.string().optional().default(''),
    /** Proxy for yt-dlp (http://user:pass@host:port or socks5://…). */
    YTDLP_PROXY: z.string().optional().default(''),
    /** Raw yt-dlp --extractor-args value, e.g. youtube:player_client=default */
    YTDLP_EXTRACTOR_ARGS: z.string().optional().default(''),
    /** Update yt-dlp on boot and daily (production). */
    YTDLP_AUTO_UPDATE: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v !== 'false' && v !== '0'),
    /** Max size of an uploaded source video, in MB. */
    MAX_UPLOAD_MB: z.coerce.number().int().min(10).max(4096).default(1024),
    /** Pre-built Remotion bundle dir (set in Docker). Empty = bundle at runtime (dev). */
    REMOTION_SERVE_URL: z.string().optional().default(''),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    AWS_ACCESS_KEY_ID: z.string().optional().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
    AWS_REGION: z.string().default('us-east-1'),
    AWS_BUCKET: z.string().optional().default(''),
    S3_PREFIX: z.string().default('piwu-clipping'),
    S3_PUBLIC_BASE_URL: z.string().optional().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          });
        }
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}
