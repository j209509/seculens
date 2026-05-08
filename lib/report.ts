import OpenAI from "openai";
import { env, bulkModel } from "./env";
import { maskText } from "./mask";

type FindingForReport = {
  id: string;
  priority: string;
  type: string;
  target: string;
  impact: string;
  inScopeReason: string;
  evidence: string;
  requestResponseDiff: string;
  reproductionSteps: string;
};

export async function generateReportDraft(finding: FindingForReport, format: string): Promise<string> {
  const base = `# ${finding.type}: ${finding.target}

## 概要
${finding.impact}

## 優先度
${finding.priority}

## 対象URL
${finding.target}

## 再現手順
${finding.reproductionSteps || "確認中"}

## 証拠
${finding.evidence}

## リクエスト/レスポンス差分
\`\`\`json
${finding.requestResponseDiff}
\`\`\`

## 実害確認の範囲
通常操作と安全な参照系リクエストの再実行のみで確認しました。削除・決済・外部通知等の操作は行っていません。

## 推奨修正案
サーバー側で適切な認可チェック・入力バリデーション・セキュリティヘッダーの設定を実装してください。`;

  if (!env.OPENAI_API_KEY) return maskText(base);

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: bulkModel(),
      messages: [
        { role: "system", content: "バグバウンティ報告文の編集者。危険操作を行っていないこと、秘密情報を出さないこと、再現手順を明確にすること。" },
        { role: "user", content: `次のドラフトを${format}向けMarkdownとして整えてください。秘密情報はマスクしてください。\n\n${base}` }
      ]
    });
    return maskText(response.choices[0]?.message.content ?? base);
  } catch {
    return maskText(base);
  }
}
