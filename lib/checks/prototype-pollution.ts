// Prototype Pollution ( client-side ) 検出。
// 戦略 ( 静的解析 ):
//   1. メインページの JS バンドルを取得
//   2. 以下の vulnerable pattern を検出:
//      a) lodash _.merge / _.set / _.mergeWith / _.defaultsDeep でユーザー入力を直渡し
//      b) jQuery $.extend(true, {}, ...) で deep merge
//      c) Object.assign({}, JSON.parse(location.search.slice(1))) みたいな URL 解析後の merge
//      d) querystring.parse / qs.parse の戻り値を そのまま merge / extend
//      e) "__proto__" / "constructor.prototype" を含む文字列
//   3. 各 pattern にスコア付与し、合計が閾値超なら Finding 化

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

type PolutionPattern = {
  name: string;
  re: RegExp;
  weight: number;
  description: string;
};

const PATTERNS: PolutionPattern[] = [
  {
    name: "lodash _.merge with user input",
    re: /\b_\s*\.\s*(?:merge|mergeWith|defaultsDeep)\s*\(\s*\{?[^,]*,\s*(?:JSON\.parse|location\.|window\.location|history\.state|qs\.parse|querystring\.parse|new\s+URLSearchParams)/,
    weight: 5,
    description: "lodash の deep merge にユーザー制御値を直接渡している ( CVE-2018-3721 / 2019-10744 系の典型 )"
  },
  {
    name: "lodash _.set with user input",
    re: /\b_\s*\.\s*(?:set|setWith)\s*\([^,]+,\s*(?:JSON\.parse|location\.|qs\.parse|querystring\.parse)/,
    weight: 5,
    description: "lodash の _.set にユーザー入力 path → 任意 prototype 改変余地"
  },
  {
    name: "jQuery deep extend",
    re: /\$\s*\.\s*extend\s*\(\s*true\s*,/,
    weight: 3,
    description: "jQuery の $.extend(true, ...) は古い実装で prototype 汚染が報告されている"
  },
  {
    name: "Object.assign with parsed query",
    re: /Object\.assign\s*\(\s*\{?\s*[a-zA-Z_$][\w]*\s*\}?\s*,\s*(?:JSON\.parse|qs\.parse|querystring\.parse)\s*\(\s*location/,
    weight: 4,
    description: "Object.assign に URL クエリのパース結果を渡している ( __proto__ キー混入で汚染 )"
  },
  {
    name: "Direct __proto__ string",
    re: /["']__proto__["']/,
    weight: 1,
    description: "コード中に '__proto__' リテラルが含まれる ( gadget 存在示唆 )"
  },
  {
    name: "Direct constructor.prototype string",
    re: /["']constructor["']\s*[:,\]]\s*[\["']prototype/,
    weight: 2,
    description: "constructor.prototype アクセスパターン ( pollution gadget )"
  },
  {
    name: "Recursive merge function",
    re: /function\s+(\w*[mM]erge)\s*\([^)]*\)\s*\{[^}]*for\s*\([^)]*in\s+\w+\s*\)\s*\{[^}]*\1\s*\(/s,
    weight: 4,
    description: "for-in ループでキーを recursive にコピーする自前 merge 関数 ( __proto__ フィルタ無し疑い )"
  },
  {
    name: "URL hash to object pattern",
    re: /location\s*\.\s*hash[^;]*\.\s*(?:split|replace|substr|slice|substring)\s*\(/,
    weight: 1,
    description: "location.hash を解析して object 化するパターン ( 後続 merge と組み合わせると pollution )"
  }
];

async function fetchJsBundle(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    await ctx.close();
    return body.slice(0, 500000);
  } finally { await browser.close().catch(() => undefined); }
}

export async function runPrototypePollutionCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const seen = new Set<string>();
  let count = 0;

  // Get list of JS files from main page
  const mainPageBody = await fetchJsBundle(targetUrl);
  const jsUrls: string[] = [];
  const scriptMatches = mainPageBody.matchAll(/<script[^>]*src=["']([^"']+\.js[^"']*)["']/gi);
  for (const m of scriptMatches) {
    try {
      const jsUrl = new URL(m[1], base).toString();
      if (isUrlInScope(program, jsUrl).allowed) jsUrls.push(jsUrl);
      if (jsUrls.length >= 10) break;
    } catch { /* ignore */ }
  }

  for (const jsUrl of jsUrls.slice(0, 10)) {
    if (count >= 5) break;
    if (seen.has(jsUrl)) continue;
    seen.add(jsUrl);

    try {
      const body = await fetchJsBundle(jsUrl);
      if (!body || body.length < 200) continue;

      const hits: { pattern: PolutionPattern; matched: string }[] = [];
      for (const p of PATTERNS) {
        const m = body.match(p.re);
        if (m) hits.push({ pattern: p, matched: m[0].slice(0, 200) });
      }
      if (hits.length === 0) continue;

      const totalWeight = hits.reduce((acc, h) => acc + h.pattern.weight, 0);
      if (totalWeight < 4) continue; // Low signal excluded

      const severity: "high" | "medium" | "low" = totalWeight >= 7 ? "high" : totalWeight >= 4 ? "medium" : "low";
      const sev: string = severity;
      const sevLabel = sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
      const taggedType = `Prototype Pollution 候補 (${hits.length} pattern, weight=${totalWeight}) [${sevLabel}]`;
      const target = jsUrl;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: severity === "high" ? "high" : "medium",
        impact: `JS バンドル ${jsUrl} に prototype pollution の vulnerable pattern が ${hits.length} 個確認されました ( 合計 weight=${totalWeight} ) : ${hits.map((h) => h.pattern.name).join(" / ")}。これらが URL hash / location.search / postMessage 等のユーザー制御入力と組み合わさっていれば、攻撃者は Object.prototype を任意に汚染し、後続コード ( admin 判定 / config 取得等 ) の挙動を変えて XSS / 認可バイパス / RCE に発展させられます。`,
        inScopeReason: `収集済み許可ドメイン内の JS バンドル ( 静的解析 )`,
        evidence: `jsUrl=${jsUrl}, hits=${hits.length}, totalWeight=${totalWeight}, patterns=${hits.map((h) => h.pattern.name).join(",")}`,
        requestResponseDiff: maskBody("application/javascript", JSON.stringify({
          jsUrl,
          totalWeight,
          hits: hits.map((h) => ({
            patternName: h.pattern.name,
            description: h.pattern.description,
            weight: h.pattern.weight,
            matchedSnippet: h.matched
          })),
          safetyNote: "静的解析のみ。実行 / payload 送信は行っていない。"
        }, null, 2)),
        reproductionSteps: `1. ${jsUrl} の JS ソースを確認\n2. 検出 pattern: ${hits.map((h) => h.pattern.name).join(" / ")}\n3. 各 pattern が どのコードパス ( endpoint / event handler ) で叩かれるかを実機ブラウザで追跡\n4. PoC 例: location.hash#__proto__[admin]=true で gadget を発火、後続 admin チェックを bypass`,
        aiWorthSending: severity === "high" ? "High weight 検出。実機での gadget 連鎖確認後 $500-2000 報告候補。" : "Medium: gadget 単独では判定不能。実機ブラウザでの reachability 確認必須。",
        bountyLikelihood: severity === "high" ? "high" : "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
