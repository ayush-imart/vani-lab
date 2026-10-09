import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().default(8787),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  AUDITOR: z.enum(["eve", "fake"]).default("eve"),
  EVE_HOST: z.string().default("http://127.0.0.1:2000"),
  // Supabase: both URL and a server key must be present to leave the memory repo.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  // 0 disables the in-process autoscale scheduler.
  // Sarvam Voice Agents (names only; values stay in keys.env). The key is server-side only.
  SARVAM_ORG_ID: z.string().min(1).optional(),
  SARVAM_WORKSPACE_ID: z.string().min(1).optional(),
  SARVAM_APP_ID_A: z.string().min(1).optional(),
  SARVAM_APP_ID_B: z.string().min(1).optional(),
  SARVAM_APP_ID_C: z.string().min(1).optional(),
  SARVAM_VOICE_API_KEY: z.string().min(1).optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  API_SHARED_SECRET: z.string().min(32).optional(),
  AUTOSCALE_TICK_MS: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema> & { supabaseKey: string | undefined };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Names only, never values.
    const bad = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`Invalid environment: ${bad.join(", ")}`);
  }
  const data = parsed.data;
  if (data.NODE_ENV !== "test" && !data.API_SHARED_SECRET) {
    throw new Error("Invalid environment: API_SHARED_SECRET");
  }
  return { ...data, supabaseKey: data.SUPABASE_SERVICE_ROLE_KEY ?? data.SUPABASE_SECRET_KEY };
}

export const useSupabase = (env: Env): boolean => Boolean(env.SUPABASE_URL && env.supabaseKey);
