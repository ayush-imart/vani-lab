import { judgeVerdictSchema, type JudgeVerdict } from "../judge/rubric";
import type { AuditorInput, AuditorPort } from "./auditor";

const MAX_ATTEMPTS = 2; // first try + one retry on invalid output

// Calls the judge and validates the verdict: schema + every requested guardrail present.
export async function verdictFor(
  auditor: AuditorPort,
  input: AuditorInput,
): Promise<{ verdict: JudgeVerdict; model: string }> {
  let lastProblem = "no attempt";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const out = await auditor.audit(input);
    const parsed = judgeVerdictSchema.safeParse(out.raw);
    if (!parsed.success) {
      lastProblem = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      continue;
    }
    if (input.requireKpiBreakdown && !parsed.data.breakdown) {
      lastProblem = "missing KPI breakdown";
      continue;
    }
    const names = new Set(parsed.data.guardrails.map((g) => g.name));
    const missing = input.guardrails.filter((g) => !names.has(g));
    if (missing.length > 0) {
      lastProblem = `missing guardrails: ${missing.join(", ")}`;
      continue;
    }
    return { verdict: parsed.data, model: out.model };
  }
  throw new Error(`Judge returned invalid output after ${MAX_ATTEMPTS} attempts (${lastProblem})`);
}
