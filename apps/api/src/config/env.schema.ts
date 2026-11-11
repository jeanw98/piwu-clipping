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
    ANTHROPIC_API_KEY: z.string().min(1),
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
    MINIMAX_VIDEO_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(600_000),
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
