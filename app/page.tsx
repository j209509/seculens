"use client";

import "./lp.css";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

// ─── リアルfindingsの型 ─────────────────────────────────────────────────
type LiveFinding = {
  id: string;
  type: string;
  severity: string;
  impact: string;
  target: string;
};

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_CLASS: Record<string, string> = {
  critical: "sev sev-crit", high: "sev sev-high", medium: "sev sev-med",
  low: "sev sev-low", info: "sev sev-info",
};
const SEV_LABEL: Record<string, string> = {
  critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", info: "INFO",
};
const MAX_RECONNECT = 5;

const FAQ_ITEMS = [
  { q: "診断は本当に無料ですか？", a: "はい、ゲスト診断（10項目）はクレジットカード登録不要で完全無料です。無料アカウントを作成いただくと、全174項目の診断を月3回まで実行可能です。有料プランへの自動切替もありません。" },
  { q: "診断中に対象サイトに影響は出ませんか？", a: "Sequliaは「受動的スキャン」を採用しており、対象サービスへの不正なリクエストや負荷試験のような攻撃的な検査は行いません。本番環境でも安全に診断可能で、平均HTTPリクエスト数は数百件程度に抑えられます。" },
  { q: "競合他社のサイトを診断できますか？", a: "利用規約により、ご自身が運営するサイト・正当な権限を持つサイトのみ診断対象とさせていただいております。第三者サイトへの無断診断は不正アクセス禁止法違反に該当する可能性があります。" },
  { q: "ログイン後のページも診断できますか？", a: "プロプラン以上で対応しています。テスト用アカウント情報を安全に登録いただくことで、認証後の管理画面・会員専用ページも診断対象に含めることが可能です。" },
];

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [realFindings, setRealFindings] = useState<LiveFinding[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [me, setMe] = useState<{ email: string; name: string | null; plan: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setMe({ email: d.user.email, name: d.user.name ?? null, plan: d.user.plan ?? "free" });
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.reload();
  }

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef(0);
  const scanIdRef = useRef<string | null>(null);

  const fetchFindings = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/scans/${id}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const sorted: LiveFinding[] = [...(data.findings ?? [])].sort(
        (a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5)
      );
      setRealFindings(sorted);
      setScanPhase("done");
    } catch {
      setScanPhase("error");
    }
  }, []);

  const connectStream = useCallback((id: string) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const es = new EventSource(`/api/scans/${id}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "reconnect") {
          es.close();
          if (reconnectRef.current < MAX_RECONNECT) {
            reconnectRef.current++;
            setTimeout(() => connectStream(id), 2000);
          } else { setScanPhase("error"); }
          return;
        }
        setScanProgress(data.progress ?? 0);
        setCurrentStep(data.currentStep ?? "");
        if (data.status === "completed") { es.close(); fetchFindings(id); }
        else if (data.status === "failed") { es.close(); setScanPhase("error"); }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      if (reconnectRef.current < MAX_RECONNECT && scanIdRef.current) {
        reconnectRef.current++;
        setTimeout(() => connectStream(scanIdRef.current!), 2000);
      } else { setScanPhase("error"); }
    };
  }, [fetchFindings]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setScanPhase("scanning");
    setScanProgress(0);
    setCurrentStep("スキャンを開始しています...");
    setRealFindings([]);
    reconnectRef.current = 0;
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("start failed");
      const { scanId } = await res.json();
      scanIdRef.current = scanId;
      connectStream(scanId);
    } catch { setScanPhase("error"); }
  }

  // severity カウント（done時）
  const sevCount = (sev: string) => realFindings.filter(f => f.severity === sev).length;
  const visible = realFindings.slice(0, 10);
  const locked = realFindings.slice(10);

  return (
    <div className="lp-root">

      {/* 1. Announcement Bar */}
      <div className="announce">
        <div className="container">
          <div className="msg">🎉 経産省 SCS評価制度 ★3 脆弱性診断 対応完了！<span className="sep"> | </span><span className="announce-ipa">IPA SECURITY ACTION ★2 対応</span></div>
          <a href="#scs">詳しく見る →</a>
        </div>
      </div>

      {/* 2. Sticky Nav */}
      <nav className="lp-nav">
        <div className="container">
          <Link href="/" className="logo">
            <img src="/sequlia-icon.png" alt="Sequlia icon" className="logo-icon" />
            Sequlia
          </Link>
          <div className="nav-links">
            <a href="#scan">無料診断</a>
            <a href="#why">機能</a>
            <a href="#incident">被害事例</a>
            <a href="#pricing">料金</a>
            <a href="#scs">SCS対応</a>
          </div>
          <div className="nav-cta">
            {me ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <Link href="/dashboard" className="btn btn-ghost">ダッシュボード</Link>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  aria-label="ユーザーメニュー"
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    color: "#2563eb", fontSize: 12, fontWeight: 700,
                  }}>{(me.name?.trim() || me.email.split("@")[0]).charAt(0).toUpperCase()}</span>
                  <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name?.trim() || me.email.split("@")[0]}</span>
                  <span style={{ fontSize: 10 }}>▾</span>
                </button>
                {userMenuOpen && (
                  <div
                    style={{
                      position: "absolute", top: "calc(100% + 8px)", right: 0,
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                      boxShadow: "0 12px 30px rgba(15,23,42,0.12)", minWidth: 220, zIndex: 50,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ fontSize: 12, color: "#64748b" }}>ログイン中</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name?.trim() || me.email.split("@")[0]}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis" }}>{me.email}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "#2563eb", fontWeight: 600, textTransform: "uppercase" }}>Plan: {me.plan}</div>
                    </div>
                    <Link href="/dashboard" className="user-menu-item" style={menuItemStyle} onClick={() => setUserMenuOpen(false)}>ダッシュボード</Link>
                    <Link href="/billing" className="user-menu-item" style={menuItemStyle} onClick={() => setUserMenuOpen(false)}>課金・プラン</Link>
                    <Link href="/settings" className="user-menu-item" style={menuItemStyle} onClick={() => setUserMenuOpen(false)}>設定</Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      style={{ ...menuItemStyle, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #f1f5f9", color: "#dc2626", cursor: "pointer" }}
                    >ログアウト</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost">ログイン</Link>
                <Link href="/signup" className="btn btn-primary">無料登録</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* 3. Hero */}
      <section className="hero" id="scan">

        <div className="container hero-layout">
          {/* 左: テキスト + フォーム */}
          <div className="hero-left">
            <div className="scs-hero-seal">
              <div className="scs-seal-badge">
                <div className="scs-seal-ring">
                  <div className="scs-seal-core">
                    <div className="scs-seal-gov">経済産業省</div>
                    <div className="scs-seal-name">SCS</div>
                    <div className="scs-seal-stars">★★★</div>
                    <div className="scs-seal-lvl">Level 3</div>
                  </div>
                </div>
              </div>
              <div className="scs-seal-info">
                <div className="scs-seal-main">セキュリティ・チェックシート<br />評価制度 <strong>★3 対応</strong></div>
                <div className="scs-seal-sub">脆弱性診断を定期実施・記録管理済み</div>
                <div className="scs-seal-ipa">
                  <img src="/ipa-security-action-2.svg" alt="IPA SECURITY ACTION ★2" className="scs-ipa-logo" />
                  <span>IPA SECURITY ACTION ★2 宣言済み</span>
                </div>
              </div>
            </div>
            <h1>見つける、守れる、<br /><span className="accent">Webのリスクを可視化</span></h1>
            <p className="hero-sub">自動化された診断で、脆弱性を早期に発見。<br />安全なWebサービス運用をサポートします。</p>
            <div className="hero-feats">
              <div className="hfeat"><span className="hfeat-ico">🎯</span><div><strong>高精度スキャン</strong><span>174項目を自動診断</span></div></div>
              <div className="hfeat"><span className="hfeat-ico">⚡</span><div><strong>スピード診断</strong><span>最短3分で結果を確認</span></div></div>
              <div className="hfeat"><span className="hfeat-ico">🛡️</span><div><strong>安心のサポート</strong><span>専門チームが徹底支援</span></div></div>
            </div>

            {scanPhase !== "scanning" ? (
              <>
                <form className="url-form" onSubmit={handleScan}>
                  <div className="url-input-wrap">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <input type="url" value={url} required placeholder="https://example.com"
                      onChange={(e) => { setUrl(e.target.value); if (scanPhase !== "idle") setScanPhase("idle"); }} />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={!url}>
                    今すぐ無料で診断する →
                  </button>
                </form>
                <div className="form-meta">
                  <span><span className="check-mark">✓</span> URLを入力するだけ</span>
                  <span><span className="check-mark">✓</span> クレジットカード不要</span>
                  <span><span className="check-mark">✓</span> 3〜8分で結果を確認</span>
                </div>
              </>
            ) : (
              <div className="scan-progress-card">
                <div className="scan-spinner" />
                <div className="scan-url-label">{url}</div>
                <div className="scan-step-label">
                  <span>{currentStep || "準備中..."}</span>
                  <strong style={{ color: "var(--blue)" }}>{scanProgress}%</strong>
                </div>
                <div className="scan-bar-track">
                  <div className="scan-bar-fill" style={{ width: `${scanProgress}%` }} />
                </div>
                <p className="scan-hint">通常3〜8分かかります。このページを開いたままお待ちください。</p>
              </div>
            )}
          </div>

          {/* 右: ダッシュボードUIモックアップ */}
          <div className="hero-right">
            <div className="dash-mock">
              <div className="dash-topbar">
                <div className="dash-dots"><span /><span /><span /></div>
                <div className="dash-url">🔒 app.sequlia.jp/dashboard</div>
              </div>
              <div className="dash-kpis">
                <div className="dash-kpi"><span className="dk-num">47</span><span className="dk-lbl">スキャン数</span></div>
                <div className="dash-kpi warn"><span className="dk-num">23</span><span className="dk-lbl">脆弱性検出</span></div>
                <div className="dash-kpi danger"><span className="dk-num">7</span><span className="dk-lbl">HIGHリスク</span></div>
                <div className="dash-kpi ok"><span className="dk-num">18</span><span className="dk-lbl">完了スキャン</span></div>
              </div>
              <div className="dash-chart-wrap">
                <div className="dash-chart-title">脆弱性検出数の推移</div>
                <div className="dash-bars">
                  {[{s:20,v:28},{s:26,v:40},{s:22,v:35},{s:30,v:52},{s:18,v:30},{s:24,v:38}].map((d,i) => (
                    <div key={i} className="dash-bar-col">
                      <div className="db-scan" style={{height:`${d.s}px`}} />
                      <div className="db-vuln" style={{height:`${d.v}px`}} />
                    </div>
                  ))}
                </div>
                <div className="dash-legend">
                  <span><span className="leg-dot" style={{background:"var(--blue)"}} />スキャン数</span>
                  <span><span className="leg-dot" style={{background:"var(--orange)"}} />脆弱性検出</span>
                </div>
              </div>
              <div className="dash-list">
                <div className="dl-header">最近のスキャン結果</div>
                {[
                  {url:"techsolution.co.jp", sevs:["C","H","H"], score:78, c:"high"},
                  {url:"sample-shoji.com",   sevs:["H","M","L"], score:52, c:"med"},
                  {url:"innovation-lab.co.jp",sevs:["M","L"],    score:28, c:"low"},
                ].map((r,i) => (
                  <div key={i} className="dl-row">
                    <span className="dl-url">{r.url}</span>
                    <span className="dl-sevs">{r.sevs.map((s,j) => <span key={j} className={`dl-badge dl-${s.toLowerCase()}`}>{s}</span>)}</span>
                    <span className={`dl-score dl-${r.c}`}>{r.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Trust Stats */}
      <section className="stats">
        <div className="container">
          <div className="stat"><div className="num">23<span className="unit">カテゴリ</span></div><div className="lbl">診断カテゴリ数</div></div>
          <div className="stat"><div className="num">174</div><div className="lbl">検査項目数</div></div>
          <div className="stat"><div className="num">3〜8<span className="unit">分</span></div><div className="lbl">診断所要時間</div></div>
          <div className="stat"><div className="num" style={{ fontSize: 24 }}>OWASP Top10</div><div className="lbl">完全準拠</div></div>
        </div>
      </section>

      {/* 5. Problem */}
      <section className="block problem">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow warn">⚠ こんな不安、ありませんか？</span>
            <h2 className="section-title">今この瞬間も、あなたのサイトは<br /><span className="accent">狙われている</span>かもしれない</h2>
            <p className="section-sub">サイバー攻撃は日々巧妙化しています。気づかないうちに、情報漏えいや改ざんにつながるリスクが潜んでいます。</p>
          </div>
          {/* フォトカード */}
          <div className="prob-photo-grid">
            {[
              {
                photo: "/prob-1.jpg",
                icoClass: "red", ico: "🔒",
                text: <>セキュリティ診断って<br />いつやったか<em className="red">分からない...</em></>
              },
              {
                photo: "/prob-2.jpg",
                icoClass: "orange", ico: "¥",
                text: <>専門業者に頼むと<br /><em className="orange">数十万円</em>かかる...</>
              },
              {
                photo: "/prob-3.jpg",
                icoClass: "amber", ico: "!",
                text: <>もし情報漏えいしたら...<br />どうしようと<em className="amber">不安...</em></>
              },
            ].map((c, i) => (
              <div key={i} className="prob-photo-card">
                <img src={c.photo} alt="" loading="lazy" />
                <div className="prob-photo-label">
                  <div className={`prob-photo-ico ${c.icoClass}`} style={{
                    background: i===0?"var(--red-50)": i===1?"#fff7ed":"#fffbeb",
                    color: i===0?"var(--red)": i===1?"var(--orange)":"var(--amber)"
                  }}>{c.ico}</div>
                  <div className="prob-photo-text">{c.text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 詳細カード */}
          <div className="prob-detail-grid">
            {[
              {
                cls: "red", ico: "🔒", color: "var(--red-50)", iconColor: "var(--red)",
                title: "放置するほど\n悪用リスクは高まる",
                body: "脆弱性は放置するほど悪用リスクが高まります。最後に診断した時期が分からない、社内に詳しい人がいない...そんな企業様が多くいらっしゃいます。",
                solution: "定期的な診断がリスク低減の第一歩です",
              },
              {
                cls: "orange", ico: "¥", color: "#fff7ed", iconColor: "var(--orange)",
                title: "高コストでは\n継続的な診断が困難",
                body: "中小企業が定期的に診断を行うにはコストが大きな負担に。年1回のテストでは、年間の脆弱性の変化をカバーしきれません。",
                solution: "コストを抑えて継続できる仕組みが必要です",
              },
              {
                cls: "amber", ico: "!", color: "#fffbeb", iconColor: "var(--amber)",
                title: "事後対応では\n信頼回復に時間がかかる",
                body: "対策していないと取引先・顧客への説明ができない。被害が出てからでは信頼の回復に時間もコストもかかってしまいます。",
                solution: "「備え」が企業の信頼と価値を守ります",
              },
            ].map((c, i) => (
              <div key={i} className="prob-detail-card">
                <div className="prob-detail-head">
                  <div className="prob-detail-ico" style={{ background: c.color, color: c.iconColor }}>{c.ico}</div>
                  <div className="prob-detail-title">{c.title.split("\n").map((l, j) => <span key={j}>{l}{j === 0 && <br />}</span>)}</div>
                </div>
                <div className={`prob-detail-line ${c.cls}`} />
                <div className="prob-detail-body">{c.body}</div>
                <div className="prob-solution">{c.solution}</div>
              </div>
            ))}
          </div>

          {/* CTAバナー */}
          <div className="prob-cta-bar">
            <div className="prob-cta-icon">🛡</div>
            <div className="prob-cta-text">
              <em>Sequlia</em>なら、手軽・高精度・低コストで<br />継続的なセキュリティ診断を実現します。
            </div>
            <div className="prob-cta-feats">
              {[
                { ico: "⏱", title: "最短3分で診断開始", sub: "すぐに始められる手軽さ" },
                { ico: "🎯", title: "高精度な診断エンジン", sub: "最新の脆弱性に対応" },
                { ico: "¥", title: "圧倒的なコストパフォーマンス", sub: "月額制で無理なく継続" },
              ].map((f, i) => (
                <div key={i} className="prob-cta-feat">
                  <span className="prob-cta-feat-ico">{f.ico}</span>
                  <div className="prob-cta-feat-body">
                    <strong>{f.title}</strong>
                    <small>{f.sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. スキャン結果パネル */}
      <section className="block scan" style={{ background: "#fff" }}>
        <div className="container">
          {scanPhase === "idle" && (
            <>
              <div className="section-head">
                <span className="eyebrow">📊 サンプル結果</span>
                <h2 className="section-title">診断結果のサンプルを確認する</h2>
                <p className="section-sub">URLを入力するだけで、Critical / High / Medium の3段階で脆弱性をリスト化。各項目に対策手順も同時に表示します。</p>
              </div>
              <div className="scan-window">
                <div className="browser-bar">
                  <div className="browser-dots"><span /><span /><span /></div>
                  <div className="browser-url">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
                    app.sequlia.jp/scan/example-com
                  </div>
                </div>
                <div className="scan-head">
                  <h4><span className="url">example.com</span> の診断結果（サンプル）</h4>
                  <div className="scan-tally">
                    <span className="sev-crit">Critical 1</span>
                    <span className="sev-high">High 3</span>
                    <span className="sev-med">Medium 4</span>
                  </div>
                </div>
                <div className="findings">
                  {[
                    { sev: "sev-crit", label: "CRITICAL", title: "SQLインジェクション脆弱性", desc: "データベースへの不正アクセスが可能な状態", cwe: "CWE-89" },
                    { sev: "sev-high", label: "HIGH", title: "HTTPSリダイレクト未設定", desc: "通信が盗聴されるリスク。HSTSヘッダーも未設定", cwe: "CWE-319" },
                    { sev: "sev-high", label: "HIGH", title: "セキュリティヘッダー不足", desc: "X-Frame-Options 未設定。クリックジャッキング攻撃が可能", cwe: "CWE-1021" },
                    { sev: "sev-med", label: "MEDIUM", title: "robots.txt に管理パスの記載", desc: "/admin/ パスが外部から推測可能な状態", cwe: "CWE-200" },
                    { sev: "sev-med", label: "MEDIUM", title: "古いJavaScriptライブラリ使用", desc: "jQuery 1.12.4 — 既知の脆弱性 CVE-2020-11023", cwe: "CWE-1104" },
                  ].map((f, i) => (
                    <div key={i} className="finding">
                      <span className={`sev ${f.sev}`}>{f.label}</span>
                      <div className="body"><strong>{f.title}</strong><span>{f.desc}</span></div>
                      <div className="meta">{f.cwe}</div>
                    </div>
                  ))}
                </div>
                <div className="lock-overlay">
                  <div className="lock-ico">🔒</div>
                  <h5>残り 100+ 項目を見るには無料アカウント登録が必要です</h5>
                  <p>SQLi詳細・XSS・CSRF・認証バイパス・SSRF など全カテゴリのチェック結果をご覧いただけます</p>
                  <Link href="/signup" className="btn btn-primary btn-lg">無料アカウントで全結果を見る →</Link>
                </div>
              </div>
            </>
          )}

          {scanPhase === "done" && (
            <>
              <div className="section-head">
                <span className="eyebrow">✅ 診断完了</span>
                <h2 className="section-title">{url} の診断結果</h2>
              </div>
              <div className="scan-window">
                <div className="browser-bar">
                  <div className="browser-dots"><span /><span /><span /></div>
                  <div className="browser-url">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
                    {url}
                  </div>
                </div>
                {realFindings.length === 0 ? (
                  <div className="no-vuln-msg">
                    <div className="no-vuln-ico">✅</div>
                    <h4>脆弱性は検出されませんでした</h4>
                    <p>基本的なセキュリティ設定は問題ありません。詳細な内部診断はプランをご確認ください。</p>
                  </div>
                ) : (
                  <>
                    <div className="scan-head">
                      <h4><span className="url">{url}</span> の診断結果</h4>
                      <div className="scan-tally">
                        {sevCount("critical") > 0 && <span className="sev-crit">Critical {sevCount("critical")}</span>}
                        {sevCount("high") > 0 && <span className="sev-high">High {sevCount("high")}</span>}
                        {sevCount("medium") > 0 && <span className="sev-med">Medium {sevCount("medium")}</span>}
                        {sevCount("low") > 0 && <span className="sev-low">Low {sevCount("low")}</span>}
                      </div>
                    </div>
                    <div className="findings">
                      {visible.map((f) => (
                        <div key={f.id} className="finding">
                          <span className={SEV_CLASS[f.severity] ?? "sev"}>{SEV_LABEL[f.severity] ?? f.severity}</span>
                          <div className="body"><strong>{f.type}</strong><span>{f.impact}</span></div>
                          <div className="meta">{f.target ? new URL(f.target.startsWith("http") ? f.target : "https://" + f.target).hostname : ""}</div>
                        </div>
                      ))}
                    </div>
                    {locked.length > 0 && (
                      <div className="lock-overlay">
                        <div className="lock-ico">🔒</div>
                        <h5>残り {locked.length} 件を確認するには</h5>
                        <p>無料アカウントを作成すると全結果を閲覧できます</p>
                        <Link href="/signup" className="btn btn-primary btn-lg">無料で全項目を見る →</Link>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ textAlign: "center", marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {!me && (
                  <Link href="/signup" className="btn btn-primary btn-lg">
                    全174項目で診断するには無料登録 →
                  </Link>
                )}
                <button onClick={() => { setScanPhase("idle"); setUrl(""); }} className="btn btn-soft">別のURLを診断する</button>
              </div>
            </>
          )}

          {scanPhase === "error" && (
            <div className="scan-window">
              <div className="scan-error">
                <div className="err-ico">⚠️</div>
                <h4>診断でエラーが発生しました</h4>
                <p>URLを確認して再度お試しください</p>
                <button onClick={() => setScanPhase("idle")} className="btn btn-soft">もう一度試す</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 7. Why Chosen */}
      <section className="block why" id="why">
        <div className="container">
          <div className="section-head why-head">
            <span className="eyebrow">🛡 選ばれる理由</span>
            <h2 className="section-title why-title"><span className="accent">Sequlia</span>が選ばれる、5つの理由</h2>
            <p className="section-sub">URLを入れるだけ。専門知識ゼロでも本格的なセキュリティ診断が3分で完結します。</p>
          </div>

          <div className="why-split">
            {/* モバイル専用: why-bannerを画像表示 */}
            <div className="why-mobile-img">
              <img src="/why-banner.png" alt="Sequlia導入事例" />
            </div>

            {/* 左: ダッシュボードモックアップ */}
            <div className="why-left">
              <div className="why-mock">
                {/* ブラウザバー */}
                <div className="wm-bar">
                  <div className="wm-dots"><span/><span/><span/></div>
                  <div className="wm-url">app.sequlia.jp/dashboard</div>
                </div>
                <div className="wm-body">
                  {/* サイドバー */}
                  <div className="wm-side">
                    <div className="wm-logo"><span className="wm-logo-ico">🛡</span>Sequlia</div>
                    {["ダッシュボード","診断履歴","レポート","プロジェクト","設定"].map((m,i)=>(
                      <div key={i} className={`wm-menu${i===0?" active":""}`}>{m}</div>
                    ))}
                  </div>
                  {/* メインコンテンツ */}
                  <div className="wm-main">
                    <div className="wm-kpi-row">
                      <div className="wm-score-card">
                        <div className="wm-score-label">総合リスクスコア</div>
                        <div className="wm-score-gauge">
                          <svg viewBox="0 0 80 80" width="80" height="80">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#e2e8f0" strokeWidth="6"/>
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#dc2626" strokeWidth="6"
                              strokeDasharray="138 63" strokeLinecap="round" transform="rotate(-90 40 40)"/>
                          </svg>
                          <div className="wm-score-num"><span>78</span><small>/100</small></div>
                        </div>
                        <div className="wm-score-badge">HIGH</div>
                      </div>
                      <div className="wm-risk-card">
                        <div className="wm-score-label">リスクレベル内訳</div>
                        {[["HIGH","#dc2626",7],["MEDIUM","#f97316",23],["LOW","#10b981",18]].map(([l,c,n])=>(
                          <div key={l as string} className="wm-risk-row">
                            <span className="wm-risk-dot" style={{background:c as string}}/>
                            <span className="wm-risk-lbl">{l as string}</span>
                            <span className="wm-risk-n">{n as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="wm-chart-row">
                      <div className="wm-chart-card">
                        <div className="wm-chart-title">脆弱性の推移</div>
                        <div className="wm-line-chart">
                          {[20,28,22,35,26,40,32].map((v,i)=>(
                            <div key={i} className="wm-line-col" style={{"--h":`${v}px`} as React.CSSProperties}/>
                          ))}
                        </div>
                      </div>
                      <div className="wm-chart-card">
                        <div className="wm-chart-title">OWASP Top10 対応状況</div>
                        <div className="wm-donut-wrap">
                          <svg viewBox="0 0 60 60" width="52" height="52">
                            <circle cx="30" cy="30" r="22" fill="none" stroke="#e2e8f0" strokeWidth="8"/>
                            <circle cx="30" cy="30" r="22" fill="none" stroke="#2563eb" strokeWidth="8"
                              strokeDasharray="83 55" strokeLinecap="round" transform="rotate(-90 30 30)"/>
                          </svg>
                          <div className="wm-donut-label"><strong>48件</strong><small>検出数</small></div>
                        </div>
                        <div className="wm-owasp-list">
                          {["A01:2017 – Broken Access Control","A02:2017 – Cryptographic Failures","A03:2021 – Injection"].map((t,i)=>(
                            <div key={i} className="wm-owasp-row"><span className="wm-owasp-dot" style={{background:["#2563eb","#f97316","#dc2626"][i]}}/>{t}</div>
                          ))}
                          <div className="wm-owasp-row"><span className="wm-owasp-dot" style={{background:"#94a3b8"}}/>その他</div>
                        </div>
                      </div>
                    </div>
                    <div className="wm-scan-title">最近のスキャン結果</div>
                    <div className="wm-scan-table">
                      {[["example.com","2024/05/30 10:30",78,"HIGH","#dc2626"],["sample-shop.com","2024/05/30 09:15",52,"MEDIUM","#f97316"],["service.inc","2024/05/29 16:45",28,"LOW","#10b981"]].map(([d,t,s,l,c])=>(
                        <div key={d as string} className="wm-scan-row">
                          <span className="wm-scan-domain">{d as string}</span>
                          <span className="wm-scan-date">{t as string}</span>
                          <span className="wm-scan-score" style={{borderColor:c as string}}>{s as number}</span>
                          <span className="wm-scan-lv" style={{color:c as string}}>{l as string}</span>
                        </div>
                      ))}
                    </div>
                    <div className="wm-more">すべての診断履歴を見る →</div>
                  </div>
                </div>
                {/* SCSバッジ */}
                <div className="wm-scs-badge">
                  <div className="wm-scs-icon">🛡</div>
                  <div className="wm-scs-text">SCS<br/>★★★<br/>対応</div>
                </div>
                {/* 人物アイコン */}
                <div className="wm-person">
                  <img src="/testi-1.png" alt="" />
                </div>
              </div>
            </div>

            {/* 右: 5つの理由リスト */}
            <div className="why-right">
              {[
                { ico: "🔍", title: "URLを入れるだけで診断開始", body: "管理画面にログイン不要。対象URLを入力するだけで、主要なセキュリティ項目を自動チェックできます。" },
                { ico: "📊", title: "危険度をスコアで可視化", body: "専門用語だけで終わらず、危険度・優先度・対応すべき箇所をわかりやすく表示します。" },
                { ico: "📋", title: "SCS★3の確認にも使える", body: "診断結果はレポート化でき、社内確認・取引先提出・セキュリティ対策の証跡として活用できます。" },
                { ico: "🛡️", title: "対象サイトへの影響を抑えた診断", body: "本番環境でも使いやすい受動的な診断を中心に、過度な負荷をかけずにチェックできます。" },
                { ico: "☰", title: "OWASP Top10をまとめて確認", body: "代表的なWeb脆弱性をまとめて確認し、見落としや対応漏れを防ぎます。" },
              ].map((w, i) => (
                <div key={i} className="why-item">
                  <div className="why-num">{i + 1}</div>
                  <div className="why-ico">{w.ico}</div>
                  <div className="why-text">
                    <h3>{w.title}</h3>
                    <p>{w.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7.5. Testimonials */}
      <section className="block testimonials">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">💬 導入企業の声</span>
            <h2 className="section-title">多くの企業が、<br /><span className="accent">セキュリティ診断の習慣化</span>に活用しています</h2>
            <p className="section-sub">業種・規模を問わず、Webサイトの安全性向上と運用コストの削減に貢献しています。</p>
          </div>

          <div className="testimonials-grid">
            {[
              {
                ico: "¥", photo: "/testi-2.png",
                name: "田中 健二", role: "情報システム部 部長", company: "株式会社テックソリューション", emp: "300名",
                title: "SCS対応レポートの提出がスムーズになりました",
                quote: "月次で自社サービスの診断を行い、SCS対応レポートとして取引先へ提出しています。自動でレポート化されるので、工数を大幅に削減できました。",
              },
              {
                ico: "🛡", photo: "/testi-1.png",
                name: "佐藤 恵子", role: "情報管理部室 室長", company: "ヘルスケアテック株式会社", emp: "150名",
                title: "専門知識がなくてもリスクを正しく把握できます",
                quote: "医療情報を扱うため、セキュリティは最優先事項。専門知識がなくても、危険度や対応方法までわかりやすく、社内のセキュリティ意識向上にもつながっています。",
              },
              {
                ico: "⏱", photo: "/testi-3.png",
                name: "山本 翔", role: "CTO", company: "ECスタートアップ Inc.", emp: "20名",
                title: "3分で結果が出る手軽さが継続の理由です",
                quote: "URLを入力するだけで、すぐに結果を確認できる手軽さが魅力です。本番前の脆弱性チェックを習慣化でき、安心してリリースできるようになりました。",
              },
            ].map((t, i) => (
              <div key={i} className="tcard">
                <div className="tcard-top">
                  <div className="tcard-ico">{t.ico}</div>
                  <div className="tcard-stars">{"★".repeat(5)}</div>
                </div>
                <div className="tcard-title">{t.title}</div>
                <div className="tcard-quote">{t.quote}</div>
                <div className="tcard-author">
                  <img src={t.photo} alt={t.name} className="tcard-avatar" loading="lazy" />
                  <div className="tcard-info">
                    <div className="tcard-name">{t.name} <span className="tcard-sama">様</span></div>
                    <div className="tcard-role">{t.role}</div>
                    <div className="tcard-company">{t.company}</div>
                  </div>
                  <div className="tcard-emp">従業員数 {t.emp}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 統計バー */}
          <div className="testi-stats">
            {[
              { ico: "🏢", num: "3,200", unit: "社以上", label: "導入企業数" },
              { ico: "👥", num: "98%", unit: "", label: "顧客満足度" },
              { ico: "🛡", num: "SCS★3", unit: "対応", label: "証跡として利用可能" },
              { ico: "🎧", num: "導入後も安心", unit: "", label: "専任サポートが支援" },
            ].map((s, i) => (
              <div key={i} className="testi-stat">
                <div className="testi-stat-ico">{s.ico}</div>
                <div className="testi-stat-body">
                  <div className="testi-stat-num">{s.num}<span className="testi-stat-unit">{s.unit}</span></div>
                  <div className="testi-stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ロゴ行 */}
          <div className="testi-logos">
            <div className="testi-logos-title">さまざまな業種・規模の企業にご利用いただいています</div>
            <div className="testi-logos-row">
              {[
                { ico: "◇", name: "Tech Solution" },
                { ico: "✚", name: "HealthTech" },
                { ico: "🛒", name: "EC STARTUP" },
                { ico: "❋", name: "Digital Works" },
                { ico: "M", name: "MARKETING ONE" },
                { ico: "⊕", name: "Global Systems" },
              ].map((l, i) => (
                <div key={i} className="testi-logo-item">
                  <span className="testi-logo-ico">{l.ico}</span>
                  <span className="testi-logo-name">{l.name}</span>
                </div>
              ))}
            </div>
            <div className="testi-logos-note">※掲載の企業名・ロゴは一例です</div>
          </div>
        </div>
      </section>

      {/* 8. Incident Cases */}
      <section className="block incident" id="incident">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow warn">⚠ 実際に起きたサイバー攻撃事例（抜粋）</span>
            <h2 className="section-title">放置すると、こうなる実際の事例</h2>
            <p className="section-sub">セキュリティ対策の遅れが、事業停止や信頼失墜など大きなリスクにつながります。</p>
          </div>
          <div className="incident-grid">
            {[
              {
                cls: "", tag: "2023 / RANSOMWARE", ico: "🔒", icoColor: "#dc2626", imgColor: "#fee2e2",
                photo: "/beverage-factory.jpg",
                co: "大手飲料メーカー", meta: "ランサムウェア攻撃",
                body: "製造・物流システムが全停止。出荷停止が数週間続き、損失は数十億円規模に。サプライチェーン全体に波及した。",
                prev: "公開Webシステムの侵入経路を\n事前発見できた可能性があります。",
                prevColor: "#dc2626", period: "約3週間", loss: "数十億円規模",
              },
              {
                cls: "orange", tag: "2022 / SUPPLY CHAIN", ico: "🔗", icoColor: "#f97316", imgColor: "#ffedd5",
                photo: "/autoparts-factory.jpg",
                co: "大手自動車部品メーカー", meta: "サプライチェーン攻撃",
                body: "VPN脆弱性から侵入。大手自動車メーカーの全工場が1日停止し、損失は数百億円規模に達した。",
                prev: "VPNの既知脆弱性を発見し、\nパッチ適用できた可能性があります。",
                prevColor: "#f97316", period: "約1日", loss: "数百億円規模",
              },
              {
                cls: "purple", tag: "2021 / MEDICAL", ico: "🏥", icoColor: "#8b5cf6", imgColor: "#ede9fe",
                photo: "/hospital.jpg",
                co: "地方病院", meta: "電子カルテ停止",
                body: "電子カルテが完全停止。救急受入れ停止が2ヶ月以上続き、地域医療に大きな影響が出た。",
                prev: "定期的な脆弱性診断が\n早期の検知と対策につながった可能性があります。",
                prevColor: "#8b5cf6", period: "約2ヶ月", loss: "数億円規模",
              },
            ].map((inc) => (
              <div key={inc.co} className={`icard ${inc.cls}`}>
                <div className="icard-photo">
                  <img src={inc.photo} alt={inc.co} loading="lazy" />
                  <div className="icard-photo-overlay">
                    <span className="icard-tag">{inc.tag}</span>
                    <div className="icard-ico" style={{ background: inc.icoColor }}>{inc.ico}</div>
                  </div>
                </div>
                <div className="icard-body">
                  <h3>{inc.co}</h3>
                  <p className="meta">{inc.meta}</p>
                  <p className="icard-desc">{inc.body}</p>
                  <div className="icard-prevent" style={{ background: inc.icoColor + "12", borderColor: inc.icoColor + "40" }}>
                    <span className="icard-prev-icon" style={{ color: inc.icoColor }}>🛡</span>
                    <div>
                      <strong style={{ color: inc.icoColor }}>診断があれば</strong>
                      <span>{inc.prev.split("\n").map((l,i) => <span key={i}>{l}{i===0&&<br/>}</span>)}</span>
                    </div>
                  </div>
                  <div className="icard-stats">
                    <div className="icard-stat"><span className="icard-stat-ico">📅</span><div><div className="icard-stat-label">影響期間</div><div className="icard-stat-val">{inc.period}</div></div></div>
                    <div className="icard-stat"><span className="icard-stat-ico">💸</span><div><div className="icard-stat-label">想定損失</div><div className="icard-stat-val">{inc.loss}</div></div></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 統計バー */}
          <div className="incident-stats">
            {[
              { ico: "🛡", strong: "被害の多くは", accent: "「既知の脆弱性」が原因", sub: "早期発見と対応が被害を防ぎます" },
              { ico: "⭕", strong: "約80%の攻撃は", accent: "Webアプリが起点", sub: "出典：Verizon DBIR 2023" },
              { ico: "📈", strong: "平均被害額は", accent: "約4,500万円", sub: "出典：IBM Cost of a Data Breach 2023" },
              { ico: "🔄", strong: "定期診断で", accent: "リスクを継続的に低減", sub: "継続的な対策が事業を守ります" },
            ].map((s, i) => (
              <div key={i} className="incident-stat">
                <div className="incident-stat-ico">{s.ico}</div>
                <div>
                  <div className="incident-stat-text"><span>{s.strong}</span><strong>{s.accent}</strong></div>
                  <div className="incident-stat-sub">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA バナー */}
          <div className="incident-cta">
            <div className="incident-cta-photo">
              <img src="/testi-1.png" alt="" />
            </div>
            <div className="incident-cta-body">
              <h3>今、診断してリスクを把握しましょう</h3>
              <p>小さな気づきが、大きな被害を防ぎます。</p>
              <div className="incident-cta-checks">
                {["3〜8分で診断完了","クレジットカード不要","PDFレポートで証跡化"].map(c=>(
                  <span key={c} className="incident-cta-check">✓ {c}</span>
                ))}
              </div>
            </div>
            <div className="incident-cta-action">
              <a href="#scan" className="btn btn-primary btn-lg">🛡 無料診断をはじめる →</a>
              <div className="incident-cta-note">URLを入力するだけで、すぐに診断できます</div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Pricing */}
      <section className="block pricing" id="pricing">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">💳 PRICING</span>
            <h2 className="section-title">シンプルな料金プラン</h2>
            <p className="section-sub">使い方に合わせて選べる4プラン。すべてのプランで主要な脆弱性検査を提供します。</p>
          </div>
          <div className="pricing-grid">
            {[
              {
                ico: "🌱", name: "フリー", price: "¥0", per: "", tag: "無料登録", featured: false,
                feats: ["1ドメインまで","月10回までスキャン","全174項目チェック","結果はWeb上で閲覧","証明書発行 ❌"],
                cta: { label: "無料登録で始める", href: "/signup", cls: "btn-outline-plan" },
              },
              {
                ico: "🛡", name: "スタンダード", price: "¥4,980", per: "/月", tag: "中小企業に最適", featured: true,
                feats: ["3ドメインまで","月30回までスキャン","公式証明書 ★2★3 発行可能","PDF/CSVレポート出力","Slack/Discord通知","メールサポート"],
                cta: { label: "このプランで始める", href: "/signup?plan=standard", cls: "btn-primary" },
              },
              {
                ico: "🏢", name: "プロ", price: "¥19,800", per: "/月", tag: "エンタープライズ向け", featured: false,
                feats: ["10ドメインまで","月100回までスキャン","公式証明書 ★2★3★4 発行可能","ログイン後ページ診断","API連携","優先サポート","SCS★3対応レポート"],
                cta: { label: "このプランで始める", href: "/signup?plan=pro", cls: "btn-outline-plan" },
              },
              {
                ico: "🏛", name: "エンタープライズ", price: "個別", per: "見積", tag: "大規模/政府/SI", featured: false,
                feats: ["無制限ドメイン・無制限スキャン","全証明書（カスタム含む）","SAML SSO","オンプレ対応","SLA保証","専任CS"],
                cta: { label: "お問い合わせ", href: "mailto:nugeirba@gmail.com?subject=Enterprise%20Plan", cls: "btn-outline-plan" },
              },
            ].map((plan) => (
              <div key={plan.name} className={`price-card${plan.featured ? " featured" : ""}`}>
                {plan.featured && <div className="pop-badge">★ MOST POPULAR</div>}
                <div className="plan-ico">{plan.ico}</div>
                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">{plan.price}{plan.per && <span className="per">{plan.per}</span>}</div>
                <div className="plan-tag">{plan.tag}</div>
                <ul className="plan-feats">
                  {plan.feats.map(f => <li key={f}>{f}</li>)}
                </ul>
                <Link href={plan.cta.href} className={`btn plan-cta ${plan.cta.cls}`}>{plan.cta.label}</Link>
              </div>
            ))}
          </div>

          {/* 安心ポイントバー */}
          <div className="pricing-assurance">
            {[
              { ico: "🛡", title: "クレジットカード不要", sub: "いつでも無料で始められます" },
              { ico: "⏱", title: "3〜8分で診断完了", sub: "すぐに結果を確認できます" },
              { ico: "📄", title: "PDFレポート対応", sub: "そのまま提出・共有が可能" },
              { ico: "🔒", title: "データは安全に管理", sub: "診断データは厳重に管理します" },
            ].map((a, i) => (
              <div key={i} className="pricing-assurance-item">
                <div className="pricing-assurance-ico">{a.ico}</div>
                <div>
                  <div className="pricing-assurance-title">{a.title}</div>
                  <div className="pricing-assurance-sub">{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="pricing-note">※料金はすべて税抜表示です。</div>
        </div>
      </section>

      {/* 10. 公式証明書 */}
      <section className="block" style={{ background: "linear-gradient(180deg, #fefefe 0%, #f8fafc 100%)" }}>
        <div className="container">
          <div className="section-head" style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="eyebrow">📜 公式証明書発行</span>
            <h2 className="section-title">取引先・監査用に <span className="accent">「公式証明書」</span> を発行できます</h2>
            <p className="section-sub">経産省マーク・IPAマーク入りの正式書類。スキャン完了で即時PDFダウンロード可能。<br />サプライチェーン監査・ISMS更新・取引先審査での提示にお使いいただけます。</p>
          </div>

          <div className="cert-tier-grid" style={{ maxWidth: 1100, margin: "0 auto" }}>
            {/* ★2 */}
            <div style={{ background: "#fff", border: "2px solid #d1fae5", borderRadius: 16, padding: 28, position: "relative" }}>
              <div style={{ fontSize: 24, color: "#16a34a", fontWeight: 800, letterSpacing: 2 }}>★★</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>LEVEL 2 ／ 取得しやすい</div>
              <h3 style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>実施宣言証</h3>
              <p style={{ marginTop: 8, fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
                Webサイトの脆弱性診断を実施したことを証明する基本証明書。<strong>初回スキャン完了で即時発行</strong>。
              </p>
              <div style={{ marginTop: 14, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, color: "#15803d" }}>
                ✓ 1回スキャン完了で取得可能
              </div>
            </div>

            {/* ★3 */}
            <div style={{ background: "#fff", border: "2px solid #2563eb", borderRadius: 16, padding: 28, position: "relative", boxShadow: "0 8px 24px rgba(37,99,235,0.12)" }}>
              <div style={{ position: "absolute", top: -10, left: 16, background: "#f59e0b", color: "#fff", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 800 }}>人気</div>
              <div style={{ fontSize: 24, color: "#2563eb", fontWeight: 800, letterSpacing: 2 }}>★★★</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#2563eb", fontWeight: 700 }}>LEVEL 3 ／ 経産省 SCS★3 対応</div>
              <h3 style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>継続実施認定証</h3>
              <p style={{ marginTop: 8, fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
                経産省 SCS★3 要件「継続的な脆弱性診断」に対応する認定証。<strong>大手取引先の監査要件をクリア</strong>。
              </p>
              <div style={{ marginTop: 14, padding: "8px 12px", background: "#eff6ff", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
                ✓ 1回スキャン完了で取得可能（Standard以上）
              </div>
            </div>

            {/* ★4 */}
            <div style={{ background: "#fff", border: "2px solid #ddd6fe", borderRadius: 16, padding: 28, position: "relative" }}>
              <div style={{ position: "absolute", top: -10, right: 16, background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 800 }}>PREMIUM</div>
              <div style={{ fontSize: 24, color: "#7c3aed", fontWeight: 800, letterSpacing: 2 }}>★★★★</div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>LEVEL 4 ／ 最上位認定</div>
              <h3 style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>高度継続認定証</h3>
              <p style={{ marginTop: 8, fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
                <strong>31日以上の継続運用実績</strong>を持つ組織のみが取得できる最上位認定。サプライチェーン審査で他社との差別化に。
              </p>
              <div style={{ marginTop: 14, padding: "8px 12px", background: "#faf5ff", borderRadius: 8, fontSize: 12, color: "#6d28d9" }}>
                ✓ 31日以上＋2回以上の継続実績で取得（Pro限定）
              </div>
            </div>
          </div>

          <div style={{ marginTop: 36, textAlign: "center", padding: 24, background: "#0f172a", borderRadius: 16, color: "#fff", maxWidth: 800, margin: "36px auto 0" }}>
            <p style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 8 }}>💡 ポイント</p>
            <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.7 }}>
              SCS制度では <span style={{ color: "#fbbf24" }}>★2は誰でも取れる</span> が、<br />
              <span style={{ color: "#60a5fa" }}>★3は急に難易度が上がる</span>のが業界の常識。<br />
              <strong style={{ color: "#fff" }}>Sequliaなら、★3も★4も最短ルートで取得できます。</strong>
            </p>
          </div>
        </div>
      </section>

      {/* 11. SCS */}
      <section className="scs" id="scs">
        <div className="container scs-grid">
          <div>
            <span className="scs-eyebrow">2027年 本格運用開始</span>
            <h2>経産省 SCS評価制度に今から対応。<br />取引先からの証明要求に備える。</h2>
            <p className="body">2027年に本格運用が予定される経産省「セキュリティ・チェックシート（SCS）評価制度」。★3要件の脆弱性診断、★4要件の継続的診断管理に対応したテンプレートを標準提供。Sequliaの診断レポートはそのまま証跡として提出できます。</p>
            <div className="scs-actions">
              <Link href="/compliance" className="btn btn-white btn-lg">SCS対応ページを見る</Link>
              <a href="https://www.ipa.go.jp/security/security-action/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-white btn-lg">IPA SECURITY ACTION ★2 ↗</a>
            </div>
          </div>
          <div className="scs-cards">
            <div className="scs-card">
              <div className="star">★★★</div>
              <h4>脆弱性診断要件 対応</h4>
              <p>★3 で求められる定期的な脆弱性診断と是正記録の保管をカバー</p>
            </div>
            <div className="scs-card">
              <div className="star">★★★★</div>
              <h4>継続的診断管理 対応</h4>
              <p>★4 で求められる継続的なセキュリティ診断・運用記録に対応</p>
            </div>
          </div>
        </div>
      </section>

      {/* 11. Certifications */}
      <section className="certs">
        <div className="container">
          <div className="certs-label">セキュリティ基準への準拠</div>
          <div className="certs-row">
            <span className="cert"><span className="cert-mark">OW</span>OWASP</span>
            <span className="cert"><span className="cert-mark">ISO</span>ISO 27001 準拠</span>
            <span className="cert"><span className="cert-mark">EU</span>GDPR 対応</span>
            <span className="cert"><span className="cert-mark">PS</span>受動的スキャン認定</span>
          </div>
        </div>
      </section>

      {/* 12. FAQ */}
      <section className="block faq">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">❓ FAQ</span>
            <h2 className="section-title">よくある質問</h2>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="q-mark">Q</span>
                  <span className="q-text">{faq.q}</span>
                  <span className="faq-toggle">+</span>
                </button>
                <div className="faq-a">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 13. Final 3-Path CTA */}
      <section className="block final">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">まず、無料で試してみてください</h2>
            <p className="section-sub">3つの方法から、あなたに合った始め方をお選びいただけます。</p>
          </div>
          <div className="final-grid">
            <div className="fcard">
              <div className="fic">📄</div>
              <h3>資料ダウンロード</h3>
              <p>サービス概要・SCS対応詳細・脅威分析をまとめた11ページの公式資料（PDF）。社内検討・取引先提示にご利用ください。</p>
              <a href="/docs/Sequlia_Service_Overview.pdf" download className="btn btn-primary btn-lg" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                📄 PDF資料をダウンロード
              </a>
              <Link href="/compliance" className="btn btn-secondary" style={{ marginTop: 8, display: "inline-block" }}>SCS対応詳細を見る</Link>
            </div>
            <div className="fcard">
              <div className="fic">💬</div>
              <h3>お問い合わせ</h3>
              <p>デモ・見積もり・導入相談など、お気軽にご相談ください。担当者から1営業日以内にご連絡します。</p>
              <Link href="/pricing" className="btn btn-soft btn-lg">料金プランを見る</Link>
            </div>
            <div className="fcard feat">
              <div className="fic">🚀</div>
              <h3>今すぐ無料診断</h3>
              <p>URLを入れて、3〜8分で完了。クレジットカード登録もインストールも不要です。</p>
              <a href="#scan" className="btn btn-primary btn-lg">無料診断をはじめる →</a>
            </div>
          </div>
        </div>
      </section>

      {/* 14. Footer */}
      <footer className="lp-footer">
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <div className="logo" style={{ color: "#fff" }}>
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 2L4 6v9c0 7.5 5.1 13.6 12 15 6.9-1.4 12-7.5 12-15V6L16 2z" fill="#3b82f6" />
                  <path d="M16 6.5L8 9v6c0 5.3 3.4 9.6 8 10.6 4.6-1 8-5.3 8-10.6V9L16 6.5z" fill="#0f172a" />
                  <circle cx="16" cy="14" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="2" />
                  <line x1="18.5" y1="16.5" x2="21" y2="19" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Sequlia
              </div>
              <p>あなたのWebサイト、今すぐ無料で脆弱性診断。</p>
              <div className="copy">© 2026 Sequlia, Inc.</div>
            </div>
            <div className="foot-links">
              <Link href="/">サービス</Link>
              <a href="#pricing">料金</a>
              <Link href="/compliance">SCS対応</Link>
              <Link href="/history">診断履歴</Link>
              <Link href="/legal/privacy">プライバシーポリシー</Link>
              <Link href="/legal/terms">利用規約</Link>
              <Link href="/legal/tokushoho">特定商取引法に基づく表記</Link>
              <a href="#">運営会社</a>
              <a href="#">セキュリティ</a>
              <a href="#">採用情報</a>
            </div>
            <div className="foot-cta">
              <Link href="/dashboard" className="btn btn-lg">ダッシュボードへ</Link>
            </div>
          </div>
          <div className="foot-bottom">
            <span>Sequlia は経産省 SCS評価制度 ★3 / IPA SECURITY ACTION ★2 に対応しています。</span>
            <span>v1.0 — 2026.05</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  padding: "10px 14px",
  fontSize: 13,
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 500,
};
