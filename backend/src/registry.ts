// SINGLE REGISTRATION POINT for domains.
// New domain = src/repos/<domain>.ts (+ line in repos/index.ts), src/services/<domain>.ts,
// src/routes/<domain>.ts, then one line in buildServices() and one in domainRoutes below.
import type { Hono } from "hono";
import type { Repos } from "./repos";
import { auditRoutes } from "./routes/audits";
import { autoscaleRoutes } from "./routes/autoscale";
import { experimentRoutes } from "./routes/experiments";
import { healthRoutes } from "./routes/health";
import { preprodRoutes } from "./routes/preprod";
import { sessionRoutes } from "./routes/sessions";
import { notificationRoutes } from "./routes/notifications";
import { performanceRoutes } from "./routes/performance";
import { rolloutRoutes } from "./routes/rollouts";
import { rubricRoutes } from "./routes/rubric";
import { versionRoutes } from "./routes/versions";
import { createFakeAuditor, type AuditorPort } from "./services/auditor";
import { createAuditService } from "./services/audits";
import { createAutoscaleService } from "./services/autoscale";
import { createExperimentService } from "./services/experiments";
import { createNotificationService, type NotificationSender } from "./services/notifications";
import { createPerformanceService } from "./services/performance";
import { createPreprodService } from "./services/preprod";
import { createSessionService, type VoiceConfig } from "./services/sessions";
import { createRolloutService } from "./services/rollouts";
import { createRubricService } from "./services/rubric";
import { createVersionService } from "./services/versions";

export type Ports = {
  auditor: AuditorPort;
  sender?: NotificationSender;
  // Real Eve judge for explicit pre-prod runs; undefined when the server runs with AUDITOR=fake.
  realAuditor?: AuditorPort | undefined;
  voice?: VoiceConfig;
};
const NO_VOICE: VoiceConfig = { appIds: {}, publicApiUrl: "http://localhost:8787" };

export function buildServices(repos: Repos, ports: Ports) {
  const rubric = createRubricService(repos);
  const notifications = createNotificationService(repos, ports.sender);
  const autoscale = createAutoscaleService(repos, notifications);
  const versions = createVersionService(repos);
  const performance = createPerformanceService(repos, rubric, autoscale);
  const experiments = createExperimentService(repos, versions);
  return {
    rubric,
    notifications,
    autoscale,
    versions,
    audits: createAuditService(repos, ports.auditor, rubric, (a, glid) => performance.ingestAudited(a, glid)),
    experiments,
    rollouts: createRolloutService(repos, experiments, versions, notifications),
    performance,
    preprod: createPreprodService(repos, versions, {
      fakeAuditor: createFakeAuditor(),
      realAuditor: ports.realAuditor,
    }),
    sessions: createSessionService(ports.voice ?? NO_VOICE),
  };
}
export type Services = ReturnType<typeof buildServices>;

export const domainRoutes: ((s: Services) => Hono)[] = [
  () => healthRoutes(),
  (s) => auditRoutes(s.audits),
  (s) => rubricRoutes(s.rubric),
  (s) => performanceRoutes(s.performance),
  (s) => versionRoutes(s.versions),
  (s) => experimentRoutes(s.experiments),
  (s) => rolloutRoutes(s.rollouts),
  (s) => autoscaleRoutes(s.autoscale),
  (s) => notificationRoutes(s.notifications),
  (s) => preprodRoutes(s.preprod),
  (s) => sessionRoutes(s.sessions),
];
