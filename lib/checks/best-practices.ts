/**
 * Best-Practices Baseline Check
 *
 * どんなサイトでもほぼ確実に何か見つかる「ベストプラクティス」検査。
 * INFO / LOW severity 中心で、最低でも 3〜5 件の findings を返す目的。
 * 課金前ユーザーに「このツールはちゃんと検知してくれる」と感じさせるため。
 */
import { createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { reportSubStep } from "@/lib/scan-context";

type FetchResult = { status: number; headers: Record<string, string>; body: string } | null;

async function fetchOnce(url: string): Promise<FetchResult> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Sequlia Security Scanner)" },
    });
    clearTimeout(timer);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const body = await res.text().catch(() => "");
    return { status: res.status, headers, body: body.slice(0, 8000) };
  } catch {
    return null;
  }
}

async function emit(scanId: string, type: string, target: string, severity: "high" | "medium" | "low" | "info", impact: string, evidence: string, recommendation: string) {
  const existing = await findExistingScanFinding(scanId, type, target);
  if (existing) return;
  await createScanFinding(scanId, {
    type,
    target,
    severity,
    impact,
    inScopeReason: "公開ヘッダー / 公開パスのみを参照",
    evidence,
    requestResponseDiff: "",
    reproductionSteps: `curl -I ${target}`,
    aiWorthSending: "no",
    bountyLikelihood: severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    recommendedAction: recommendation,
    owasp: "A05:2021 Security Misconfiguration",
    cvssScore: severity === "high" ? 5.5 : severity === "medium" ? 4.0 : severity === "low" ? 2.5 : 0,
    category: "best-practices",
    affectedUrl: target,
  });
}

export async function runBestPracticesCheck(scanId: string, targetUrl: string): Promise<void> {
  reportSubStep("ベースライン検査: ホームページ取得");
  const u = new URL(targetUrl);
  const origin = `${u.protocol}//${u.host}`;
  const homepage = await fetchOnce(origin + "/");
  if (!homepage) return;
  const h = homepage.headers;

  // 1. HSTS
  reportSubStep("HSTS (Strict-Transport-Security) 確認");
  if (!h["strict-transport-security"]) {
    await emit(
      scanId,
      "Missing-HSTS",
      origin,
      "low",
      "HSTS（HTTP Strict Transport Security）ヘッダーが設定されていません。中間者攻撃でHTTP接続にダウングレードされるリスクがあります。",
      `GET ${origin}/ レスポンスに Strict-Transport-Security ヘッダーなし`,
      "Webサーバーで `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` を返すように設定してください。Nginx/Apache/CloudFront 等で1行追加するだけです。"
    );
  } else {
    // HSTS あるが preload 未対応
    const hstsVal = h["strict-transport-security"];
    if (!/preload/i.test(hstsVal) || !/includeSubDomains/i.test(hstsVal)) {
      await emit(
        scanId,
        "HSTS-Preload-Missing",
        origin,
        "info",
        "HSTSは設定されていますが、`preload` または `includeSubDomains` が含まれていません。サブドメイン経由の攻撃に対する保護が不完全です。",
        `Strict-Transport-Security: ${hstsVal}`,
        "`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` に変更し、https://hstspreload.org/ で登録申請してください。"
      );
    }
  }

  // 2. CSP
  reportSubStep("CSP (Content-Security-Policy) 確認");
  if (!h["content-security-policy"] && !h["content-security-policy-report-only"]) {
    await emit(
      scanId,
      "Missing-CSP",
      origin,
      "low",
      "Content-Security-Policy（CSP）が設定されていません。XSS攻撃の影響範囲を限定する重要な防御層が欠落しています。",
      `GET ${origin}/ レスポンスに Content-Security-Policy ヘッダーなし`,
      "段階的に CSP を導入してください。最初は `Content-Security-Policy-Report-Only` で運用を観察し、その後 `Content-Security-Policy` に切り替えるのが安全です。"
    );
  }

  // 3. X-Content-Type-Options
  reportSubStep("X-Content-Type-Options 確認");
  if (!h["x-content-type-options"] || !/nosniff/i.test(h["x-content-type-options"])) {
    await emit(
      scanId,
      "Missing-X-Content-Type-Options",
      origin,
      "info",
      "X-Content-Type-Options: nosniff が設定されていません。ブラウザが MIME タイプを推測することで XSS の温床になる可能性があります。",
      `現在のヘッダー: ${h["x-content-type-options"] || "(not set)"}`,
      "全レスポンスに `X-Content-Type-Options: nosniff` を追加してください。"
    );
  }

  // 4. X-Frame-Options or CSP frame-ancestors
  reportSubStep("X-Frame-Options / frame-ancestors 確認");
  const csp = h["content-security-policy"] || "";
  const hasFrameAncestors = /frame-ancestors/i.test(csp);
  if (!h["x-frame-options"] && !hasFrameAncestors) {
    await emit(
      scanId,
      "Missing-Clickjacking-Protection",
      origin,
      "low",
      "X-Frame-Options も CSP frame-ancestors も設定されていません。クリックジャッキング攻撃で他サイトに iframe 埋め込みされ、UIをだまされてユーザー操作を盗まれる恐れがあります。",
      `X-Frame-Options: ${h["x-frame-options"] || "(not set)"} / CSP frame-ancestors: ${hasFrameAncestors ? "set" : "not set"}`,
      "`X-Frame-Options: DENY` または CSP に `frame-ancestors 'none'` を追加してください。"
    );
  }

  // 5. Referrer-Policy
  reportSubStep("Referrer-Policy 確認");
  if (!h["referrer-policy"]) {
    await emit(
      scanId,
      "Missing-Referrer-Policy",
      origin,
      "info",
      "Referrer-Policy が設定されていません。外部リンク経由でユーザーの内部URL情報が漏洩する可能性があります。",
      "Referrer-Policy ヘッダーなし",
      "`Referrer-Policy: strict-origin-when-cross-origin` を全レスポンスに追加してください。"
    );
  }

  // 6. Permissions-Policy
  reportSubStep("Permissions-Policy 確認");
  if (!h["permissions-policy"] && !h["feature-policy"]) {
    await emit(
      scanId,
      "Missing-Permissions-Policy",
      origin,
      "info",
      "Permissions-Policy が設定されていません。カメラ・マイク・位置情報など、サイトが使わないブラウザ機能を明示的に無効化することで攻撃面を減らせます。",
      "Permissions-Policy / Feature-Policy ヘッダーなし",
      "使用しない機能を `Permissions-Policy: camera=(), microphone=(), geolocation=()` のように明示的に無効化してください。"
    );
  }

  // 7. Server header disclosure
  reportSubStep("Server / X-Powered-By 開示確認");
  if (h["server"] && h["server"].length > 1) {
    await emit(
      scanId,
      "Server-Header-Disclosure",
      origin,
      "info",
      "Server レスポンスヘッダーでバージョン情報を含むサーバーソフトウェア名が開示されています。攻撃者にバージョン特定の手がかりを与えます。",
      `Server: ${h["server"]}`,
      "Webサーバー側で Server ヘッダーを抑制するか、製品名・バージョン情報を含まないようにしてください。Nginx なら `server_tokens off;`、Apache なら `ServerTokens Prod` で対応できます。"
    );
  }
  if (h["x-powered-by"]) {
    await emit(
      scanId,
      "X-Powered-By-Disclosure",
      origin,
      "info",
      "X-Powered-By レスポンスヘッダーでアプリケーション基盤の情報（PHP / Express 等）が開示されています。",
      `X-Powered-By: ${h["x-powered-by"]}`,
      "アプリケーション設定で X-Powered-By ヘッダーを無効化してください（PHP: `expose_php = Off`、Express: `app.disable('x-powered-by')`）。"
    );
  }

  // 8. security.txt
  reportSubStep(".well-known/security.txt 確認");
  const secTxt = await fetchOnce(origin + "/.well-known/security.txt");
  if (!secTxt || secTxt.status === 404) {
    await emit(
      scanId,
      "Missing-Security-Txt",
      origin + "/.well-known/security.txt",
      "info",
      "security.txt が公開されていません。脆弱性を発見したセキュリティ研究者が連絡先を見つけられず、責任ある開示の障壁になります。",
      `GET /.well-known/security.txt → ${secTxt?.status ?? "not reachable"}`,
      "https://securitytxt.org/ のテンプレートに沿って `Contact:`, `Expires:`, `Preferred-Languages:` 等を記載した security.txt を `/.well-known/security.txt` に配置してください。"
    );
  }

  // 9. robots.txt
  reportSubStep("robots.txt 確認");
  const robots = await fetchOnce(origin + "/robots.txt");
  if (!robots || robots.status === 404) {
    await emit(
      scanId,
      "Missing-Robots-Txt",
      origin + "/robots.txt",
      "info",
      "robots.txt が存在しません。検索エンジンに対するクロール指示が明示されていないため、意図しないページがインデックスされる可能性があります。",
      `GET /robots.txt → ${robots?.status ?? "not reachable"}`,
      "サイト直下に robots.txt を配置し、最低限 `Sitemap:` ディレクティブを記載してください。"
    );
  }

  // 10. COOP / COEP / CORP (modern best practices)
  reportSubStep("Cross-Origin-* ヘッダー確認");
  if (!h["cross-origin-opener-policy"]) {
    await emit(
      scanId,
      "Missing-COOP",
      origin,
      "info",
      "Cross-Origin-Opener-Policy が未設定です。Spectre 系のサイドチャネル攻撃に対する分離が不完全です。",
      "Cross-Origin-Opener-Policy ヘッダーなし",
      "`Cross-Origin-Opener-Policy: same-origin` を追加してください。これにより iframe 経由の攻撃面が減ります。"
    );
  }
}
