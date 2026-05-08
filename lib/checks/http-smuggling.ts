// HTTP Request Smuggling 検出 ( 慎重実装 )。
// TE.CL conflict probe のみ。queue 汚染は実施しない。

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

type RawResp = { status: number; headers: Record<string, string | string[] | undefined>; bodyPreview: string; ms: number; error?: string };

function rawProbe(targetUrl: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<RawResp> {
  return new Promise((resolve) => {
    const start = Date.now();
    let u: URL;
    try { u = new URL(targetUrl); } catch { return resolve({ status: 0, headers: {}, bodyPreview: "", ms: 0, error: "invalid url" }); }
    const lib = u.protocol === "https:" ? httpsRequest : httpRequest;
    const req = lib({
      protocol: u.protocol,
      host: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers,
      timeout: timeoutMs
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => { if (chunks.length < 30) chunks.push(c); });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          bodyPreview: buf.toString("utf8").slice(0, 1500),
          ms: Date.now() - start
        });
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, bodyPreview: "", ms: Date.now() - start, error: "timeout" }); });
    req.on("error", (e) => { resolve({ status: 0, headers: {}, bodyPreview: "", ms: Date.now() - start, error: e.message }); });
    req.write(body);
    req.end();
  });
}

export async function runHttpSmugglingCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);

  // Probe target host and allowed domain hosts
  const hosts = new Set<string>();
  try { hosts.add(`${new URL(targetUrl).protocol}//${new URL(targetUrl).host}/`); } catch { /* ignore */ }

  let count = 0;
  for (const baseUrl of hosts) {
    if (count >= 4) break;
    if (!isUrlInScope(program, baseUrl).allowed) continue;
    // probe: 5 byte chunked body + CL: 999 ( 矛盾 )
    const body = "5\r\nABCDE\r\n0\r\n\r\n";
    const headers = {
      "Host": new URL(baseUrl).host,
      "Content-Length": "999",
      "Transfer-Encoding": "chunked",
      "User-Agent": "Mozilla/5.0 bb-smuggling-detector/1.0",
      "Connection": "close"
    };
    const r = await rawProbe(baseUrl, headers, body, 8000);
    const issues: string[] = [];
    if (r.error === "timeout") {
      issues.push("TE/CL 矛盾リクエストでタイムアウト ( フロントが TE を無視して CL=999 で待機している可能性、smuggling 余地大 )");
    }
    const teHeader = r.headers["transfer-encoding"];
    const teEcho = Array.isArray(teHeader) ? teHeader.some((v) => /chunked/i.test(v)) : (typeof teHeader === "string" && /chunked/i.test(teHeader));
    if (teEcho && r.bodyPreview.length > 0 && r.status === 200) {
      if (r.bodyPreview.includes("ABCDE")) {
        issues.push("リクエストボディがレスポンスに含まれる ( endpoint がエコー型 ) → smuggling 検証は別途要");
      }
    }
    if (r.status === 400 || r.status === 408 || r.status === 411) {
      issues.push(`矛盾 header に対して ${r.status} を返却 ( フロントエンド層で拒否、smuggling 余地は限定的 )`);
    }
    if (issues.length === 0) continue;
    const taggedType = `HTTP Request Smuggling 弱信号 [Medium]`;
    const target = baseUrl;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;
    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity: "medium",
      impact: `${baseUrl} に Transfer-Encoding: chunked + Content-Length: 999 ( 矛盾 ) のリクエストを送ったところ、以下の特異挙動が確認されました: ${issues.join(" / ")}。これ自体は smuggling 確定ではないが、フロント ( CDN ) とオリジンで CL/TE 解釈が分かれている可能性があり、queue 汚染攻撃 ( CL.TE / TE.CL / TE.TE ) の起点になり得ます。本ツールは検証性 1 リクエストのみで queue 汚染は実施しておりません。`,
      inScopeReason: `収集済み許可ドメイン上のホスト`,
      evidence: `host=${baseUrl}, status=${r.status}, ms=${r.ms}, error=${r.error ?? "(none)"}, issues=${issues.length}`,
      requestResponseDiff: maskBody("application/json", JSON.stringify({
        host: baseUrl,
        probeHeaders: headers,
        probeBody: body,
        responseStatus: r.status,
        responseHeaders: r.headers,
        responseBodyPreview: r.bodyPreview,
        responseMs: r.ms,
        error: r.error,
        issues,
        safetyNote: "1 リクエストのみ送信。queue 汚染や第二リクエスト連鎖は実施していない。"
      }, null, 2)),
      reproductionSteps: `1. POST ${baseUrl} に Transfer-Encoding: chunked + Content-Length: 999 + 短い chunked body を送信\n2. ${issues.join("\n3. ")}\n4. PortSwigger smuggling lab の手順に従い CL.TE / TE.CL ペアで queue 汚染を実機検証 ( 本ツールは検証していない )`,
      aiWorthSending: "弱信号です。Burp の HTTP Request Smuggler 拡張等で深堀り検証してください。確定すれば $5000-50000 級の Critical です。",
      bountyLikelihood: "medium",
      recommendedAction: "manual_verify"
    });
    count++;
  }
  return count;
}
