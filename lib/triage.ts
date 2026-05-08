import OpenAI from "openai";
import { z } from "zod";
import { env, highSpecModel } from "./env";
import { prisma } from "./prisma";
import { maskText } from "./mask";
import { evaluateExploitabilityGate } from "./exploitability-gate";

export const triageSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info", "not_a_bug"]).default("low"),
  bountyLikelihood: z.enum(["very_high", "high", "medium", "low", "very_low", "unknown"]).default("unknown"),
  evidenceStrength: z.enum(["strong", "moderate", "weak", "insufficient"]).default("weak"),
  reproducibility: z.enum(["confirmed", "likely", "uncertain", "not_reproduced"]).default("uncertain"),
  scopeStatus: z.enum(["in_scope", "probably_in_scope", "unclear", "probably_out_of_scope", "out_of_scope"]).default("in_scope"),
  falsePositiveRisk: z.enum(["low", "medium", "high"]).default("medium"),
  recommendedAction: z.enum(["report_now", "manual_verify", "collect_more_evidence", "monitor", "ignore", "mark_out_of_scope"]).default("manual_verify"),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().default(""),
  missingEvidence: z.array(z.string()).default([]),
  nextManualChecks: z.array(z.string()).default([]),
  reportTitleDraft: z.string().default(""),
  notify: z.boolean().default(false),
});

export type TriageResult = z.infer<typeof triageSchema>;

type FindingLike = { id?: string; type: string; target: string; impact: string; inScopeReason?: string; evidence: string; requestResponseDiff?: string; reproductionSteps?: string; };

function ruleFallback(finding: FindingLike): TriageResult {
  const text = `${finding.type} ${finding.target} ${finding.impact} ${finding.requestResponseDiff ?? ""} ${finding.reproductionSteps ?? ""}`.toLowerCase();
  const critical = /別ユーザー|other user|cross[- ]?account|billing|請求|権限外|unauthorized/.test(text) && /200|leaked|固有情報|成功|exposed/.test(text);
  const high = critical || /権限|role|admin|個人情報|pii/.test(text);
  const medium = !high && /internal|api|差分|information/.test(text);
  const hasDiff = (finding.requestResponseDiff ?? "").length > 20;
  const hasSteps = (finding.reproductionSteps ?? "").length > 20;
  const evidenceStrength: TriageResult["evidenceStrength"] = hasDiff && hasSteps ? "moderate" : hasDiff ? "weak" : "insufficient";
  const severity: TriageResult["severity"] = critical ? "critical" : high ? "high" : medium ? "medium" : "low";
  const bountyLikelihood: TriageResult["bountyLikelihood"] = critical ? "very_high" : high ? "high" : medium ? "medium" : "low";
  const recommendedAction: TriageResult["recommendedAction"] =
    evidenceStrength === "insufficient" ? "collect_more_evidence" :
    ["critical", "high"].includes(severity) ? "report_now" :
    medium ? "manual_verify" : "monitor";
  return {
    severity, bountyLikelihood, evidenceStrength,
    reproducibility: hasSteps ? "likely" : "uncertain",
    scopeStatus: "in_scope",
    falsePositiveRisk: evidenceStrength === "insufficient" ? "high" : "medium",
    recommendedAction,
    confidence: 0.5,
    reason: "ルールベースの暫定評価です",
    missingEvidence: [!hasSteps ? "再現手順" : "", !hasDiff ? "リクエスト/レスポンス差分" : ""].filter(Boolean),
    nextManualChecks: ["プログラムポリシーでスコープ内確認", "秘密情報が含まれないことを確認"],
    reportTitleDraft: `${finding.type}: ${finding.target}`.slice(0, 160),
    notify: ["critical", "high"].includes(severity),
  };
}

export async function triageFinding(findingId: string): Promise<TriageResult> {
  const finding = await prisma.scanFinding.findUniqueOrThrow({ where: { id: findingId } });
  const gate = evaluateExploitabilityGate({ type: finding.type, target: finding.target, evidence: finding.evidence, impact: finding.impact, requestResponseDiff: finding.requestResponseDiff, severity: finding.severity, scopeStatus: finding.scopeStatus });

  let result = ruleFallback(finding);

  if (env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const model = highSpecModel();
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "あなたはWebセキュリティの専門家です。脆弱性のトリアージ結果をJSON形式で返してください。severity, bountyLikelihood, evidenceStrength, recommendedAction, reason, notify を必ず含めてください。" },
          { role: "user", content: maskText(`脆弱性タイプ: ${finding.type}\n対象: ${finding.target}\n影響: ${finding.impact}\n証拠: ${finding.evidence}\nリクエスト/レスポンス差分: ${finding.requestResponseDiff}\nExploitability Gate: ${gate.passed ? "PASSED" : "FAILED"} - ${gate.reason}`) }
        ],
      });
      const raw = JSON.parse(response.choices[0]?.message.content ?? "{}");
      result = triageSchema.parse({ ...result, ...raw });
    } catch (e) { console.warn("[triage] AI failed, using rule fallback:", e); }
  }

  if (!gate.passed && result.recommendedAction === "report_now") {
    result = { ...result, recommendedAction: "manual_verify", reason: `${result.reason} (Gate: ${gate.reason})` };
  }

  await prisma.scanFinding.update({
    where: { id: findingId },
    data: {
      severity: result.severity as string,
      bountyLikelihood: result.bountyLikelihood,
      evidenceStrength: result.evidenceStrength,
      reproducibility: result.reproducibility,
      scopeStatus: result.scopeStatus,
      falsePositiveRisk: result.falsePositiveRisk,
      recommendedAction: result.recommendedAction,
      aiTriageReason: result.reason,
      aiTriageConfidence: result.confidence,
      triaged: true,
    },
  }).catch(() => {});

  return result;
}

export function shouldNotifyHighTriage(result: TriageResult) {
  return result.notify && ["critical", "high"].includes(result.severity);
}
