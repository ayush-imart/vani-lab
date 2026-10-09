import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { loadEnv, useSupabase } from "./lib/env";
import { log } from "./lib/logger";
import { createReposFromEnv } from "./repos";
import { buildServices } from "./registry";
import { createEveAuditor, createFakeAuditor } from "./services/auditor";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";

const EVE_START_TIMEOUT_MS = 60_000;
const EVE_PROBE_TIMEOUT_MS = 1_000;

function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(EVE_PROBE_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForEve(host: string, port: number, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + EVE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Eve exited before becoming ready");
    }
    if (await probeTcp(host, port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Eve did not become ready before the startup timeout");
}

const env = loadEnv();
const eveProcess = env.AUDITOR === "eve"
  ? spawn(process.execPath, ["node_modules/eve/bin/eve.js", "start", "--host", "127.0.0.1", "--port", "2000"], {
      stdio: "inherit",
      env: process.env,
    })
  : undefined;
eveProcess?.on("error", (error) => log.error("eve process failed to start", { error: error.message }));
let stopping = false;
eveProcess?.on("exit", (code, signal) => {
  if (!stopping) {
    log.error("eve process exited unexpectedly", { code: code ?? -1, signal: signal ?? "" });
    process.exit(1);
  }
});
if (eveProcess) {
  const eveUrl = new URL(env.EVE_HOST);
  await waitForEve(eveUrl.hostname, Number(eveUrl.port || 80), eveProcess);
  log.info("eve ready", { host: eveUrl.hostname, port: Number(eveUrl.port || 80) });
}
const repos = createReposFromEnv(env);
const auditor = env.AUDITOR === "fake" ? createFakeAuditor(300) : createEveAuditor(env.EVE_HOST);
const publicApiUrl = env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
const services = buildServices(repos, {
  auditor,
  realAuditor: env.AUDITOR === "eve" ? auditor : undefined,
  voice: {
    orgId: env.SARVAM_ORG_ID,
    workspaceId: env.SARVAM_WORKSPACE_ID,
    appIds: { A: env.SARVAM_APP_ID_A, B: env.SARVAM_APP_ID_B, C: env.SARVAM_APP_ID_C },
    apiKey: env.SARVAM_VOICE_API_KEY,
    publicApiUrl,
  },
});
await services.versions.ensureSeed();
services.autoscale.startScheduler(env.AUTOSCALE_TICK_MS);

const app = buildApp(
  services,
  env.CORS_ORIGINS.split(",").map((o) => o.trim()),
  env.API_SHARED_SECRET,
);
serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" });
log.info("api listening", {
  port: env.PORT,
  repo: useSupabase(env) ? "supabase" : "memory",
  auditor: env.AUDITOR,
  autoscaleTickMs: env.AUTOSCALE_TICK_MS,
});

function stop(signal: NodeJS.Signals): void {
  stopping = true;
  eveProcess?.kill(signal);
  process.exit(0);
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
