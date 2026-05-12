"use client";

import "./lp-v2.css";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useSpring, useInView } from "framer-motion";
import {
  Shield, Lock, AlertTriangle, CheckCircle, ArrowRight,
  Sparkles, Globe, Search, Cpu, Award, FileCheck, TrendingUp, Users, Star,
  ChevronDown, Rocket, Gift, Trophy, FileText, Bot,
  ShoppingCart, Factory, Heart, Building2, Cloud, Layers,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

// ─── Types & constants ───────────────────────────────────────────────
type LiveFinding = { id: string; type: string; severity: string; impact: string; target: string };
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_PILL: Record<string, string> = { critical: "crit", high: "high", medium: "med", low: "low", info: "info" };
const SEV_LABEL: Record<string, string> = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", info: "INFO" };
const MAX_RECONNECT = 5;

const FAQ_ITEMS = [
  { q: "診断は本当に無料ですか？", a: "はい、ゲスト診断（10項目）はクレジットカード登録不要で完全無料です。無料アカウントを作成いただくと、全174項目の診断を月3回まで実行可能です。有料プランへの自動切替もありません。" },
  { q: "診断中に対象サイトに影響は出ませんか？", a: "Sequliaは「受動的スキャン」を採用しており、対象サービスへの不正なリクエストや負荷試験のような攻撃的な検査は行いません。本番環境でも安全に診断可能で、平均HTTPリクエスト数は数百件程度に抑えられます。" },
  { q: "競合他社のサイトを診断できますか？", a: "利用規約により、ご自身が運営するサイト・正当な権限を持つサイトのみ診断対象とさせていただいております。第三者サイトへの無断診断は不正アクセス禁止法違反に該当する可能性があります。" },
  { q: "ログイン後のページも診断できますか？", a: "プロプラン以上で対応しています。テスト用アカウント情報を安全に登録いただくことで、認証後の管理画面・会員専用ページも診断対象に含めることが可能です。" },
  { q: "既存のセキュリティツールと併用できますか？", a: "もちろん可能です。Sequliaは外部からのブラックボックス診断ですので、WAF・EDR・SAST等とは独立して動作します。むしろ多層防御の一環として併用を推奨しています。" },
  { q: "解約はいつでもできますか？", a: "はい、契約期間の縛りはなくダッシュボードから即時解約可能です。日割り返金には対応していませんが、次回更新は停止されます。" },
];

// ─── Count-up hook ───────────────────────────────────────────────
function useCountUp(target: number, duration = 1500, inView = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, inView]);
  return val;
}

function CountNumber({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const v = useCountUp(to, 1500, inView);
  return <span ref={ref}>{v.toLocaleString()}{suffix}</span>;
}

// ─── Section reveal ───────────────────────────────────────────────
const reveal = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};
const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  // ─── Scan demo state ───────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [realFindings, setRealFindings] = useState<LiveFinding[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [me, setMe] = useState<{ email: string; name: string | null; plan: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setMe({ email: d.user.email, name: d.user.name ?? null, plan: d.user.plan ?? "free" });
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
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
    } catch { setScanPhase("error"); }
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
          } else setScanPhase("error");
          return;
        }
        setScanProgress(data.progress ?? 0);
        setCurrentStep(data.currentStep ?? "");
        if (Array.isArray(data.findings) && data.findings.length > 0) {
          const sorted: LiveFinding[] = [...data.findings].sort(
            (a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5)
          );
          setRealFindings(sorted);
        }
        if (data.status === "completed") { es.close(); fetchFindings(id); }
        else if (data.status === "failed") { es.close(); setScanPhase("error"); }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      if (reconnectRef.current < MAX_RECONNECT && scanIdRef.current) {
        reconnectRef.current++;
        setTimeout(() => connectStream(scanIdRef.current!), 2000);
      } else setScanPhase("error");
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
      setTimeout(() => {
        if (scanIdRef.current !== scanId) return;
        if (esRef.current) { esRef.current.close(); esRef.current = null; }
        fetchFindings(scanId);
      }, 30_000);
    } catch { setScanPhase("error"); }
  }

  const visible = realFindings.slice(0, 10);
  const locked = realFindings.slice(10);

  return (
    <div className="v2">
      {/* Scroll progress */}
      <motion.div className="v2-progress" style={{ scaleX }} />

      {/* 1. Announcement */}
      <div className="v2-announce">
        <div className="v2-container">
          <div className="msg">
            <Sparkles size={14} />
            経産省 SCS評価制度 ★3 対応完了！
            <span className="sep">|</span>
            <span>IPA SECURITY ACTION ★2 対応</span>
          </div>
          <a href="#scs">詳しく見る →</a>
        </div>
      </div>

      {/* 2. Nav */}
      <nav className="v2-nav">
        <div className="v2-container">
          <Link href="/" className="v2-logo">
            <img src="/sequlia-icon.png" alt="Sequlia" className="v2-logo-icon" />
            Sequlia
          </Link>
          <div className="v2-nav-links">
            <a href="#features">機能</a>
            <a href="#pricing">料金</a>
            <a href="#scs">SCS対応</a>
            <a href="#incidents">被害事例</a>
          </div>
          <div className="v2-nav-cta">
            {me ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <Link href="/dashboard" className="v2-btn v2-btn-ghost">ダッシュボード</Link>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="v2-btn v2-btn-primary"
                  aria-label="ユーザーメニュー"
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    color: "#2563eb", fontSize: 12, fontWeight: 800,
                  }}>{(me.name?.trim() || me.email.split("@")[0]).charAt(0).toUpperCase()}</span>
                  <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name?.trim() || me.email.split("@")[0]}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      className="v2-user-menu"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                    >
                      <div className="head">
                        <div className="em">{me.email}</div>
                        <div className="plan">{me.plan}</div>
                      </div>
                      <Link href="/dashboard">ダッシュボード</Link>
                      <Link href="/history">スキャン履歴</Link>
                      <Link href="/billing">プラン・お支払い</Link>
                      <Link href="/settings">設定</Link>
                      {me.plan === "admin" && <Link href="/admin">管理画面</Link>}
                      <div className="sep" />
                      <button type="button" className="item logout" onClick={handleLogout}>ログアウト</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link href="/login" className="v2-btn v2-btn-ghost">ログイン</Link>
                <Link href="/signup" className="v2-btn v2-btn-primary">無料登録</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* 3. Hero */}
      <section className="v2-hero" id="scan">
        <div className="v2-hero-grid" />
        <motion.div className="v2-hero-orb o1" animate={{ x: [0, 30, 0], y: [0, 20, 0] }} transition={{ duration: 12, repeat: Infinity }} />
        <motion.div className="v2-hero-orb o2" animate={{ x: [0, -25, 0], y: [0, -15, 0] }} transition={{ duration: 14, repeat: Infinity }} />
        <motion.div className="v2-hero-orb o3" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 10, repeat: Infinity }} />

        <div className="v2-container v2-hero-inner">
          <motion.div initial="hidden" animate="show" variants={staggerParent}>
            <motion.div variants={reveal} className="v2-hero-pill">
              <Shield size={14} /> AI × OWASP Top10 完全準拠
            </motion.div>
            <motion.h1 variants={reveal} className="v2-hero-title">
              見つける、守れる、<br />
              <span className="grad">Webのリスクを可視化。</span>
            </motion.h1>
            <motion.p variants={reveal} className="v2-hero-sub">
              URLを入れるだけ。サブページ・サブドメインも全自動で診断。<br />
              AIが脆弱性を解析し、最短3分で結果が出ます。
            </motion.p>

            <motion.form variants={reveal} className="v2-hero-form" onSubmit={handleScan}>
              <input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={scanPhase === "scanning"}
                required
              />
              <button type="submit" className="v2-btn v2-btn-cta" disabled={scanPhase === "scanning"}>
                {scanPhase === "scanning" ? "診断中…" : <>🚀 無料で診断する <ArrowRight size={16} /></>}
              </button>
            </motion.form>

            <motion.div variants={reveal} className="v2-trust">
              <span><CheckCircle size={14} color="#16a34a" /> クレカ不要</span>
              <span><CheckCircle size={14} color="#16a34a" /> 30秒登録</span>
              <span><CheckCircle size={14} color="#16a34a" /> 月3回完全無料</span>
            </motion.div>

            {/* Scan demo card */}
            <AnimatePresence>
              {scanPhase !== "idle" && (
                <motion.div
                  className="v2-scan-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="head">
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      <span className="dot" />
                      {scanPhase === "scanning" && "ライブ診断中"}
                      {scanPhase === "done" && "診断完了"}
                      {scanPhase === "error" && "エラー"}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{scanProgress}%</div>
                  </div>
                  <div className="progress"><div style={{ width: `${scanProgress}%` }} /></div>
                  <div className="status">{currentStep || "..."}</div>

                  {visible.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      {visible.map((f) => (
                        <div className="v2-find-row" key={f.id}>
                          <span className={`sev-pill ${SEV_PILL[f.severity] || "info"}`}>{SEV_LABEL[f.severity] || f.severity.toUpperCase()}</span>
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>{f.type}</span>
                          <span className="target">{f.target}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {scanPhase === "done" && locked.length > 0 && (
                    <div className="v2-scan-locked">
                      <Lock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      残り <strong>{locked.length}</strong> 件の検出結果は<Link href="/signup">無料登録</Link>で閲覧できます
                    </div>
                  )}
                  {scanPhase === "done" && realFindings.length === 0 && (
                    <div className="v2-scan-locked" style={{ color: "#86efac" }}>
                      <CheckCircle size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      検出された脆弱性はありません。安全なサイトです。
                    </div>
                  )}
                  {scanPhase === "error" && (
                    <div className="v2-scan-locked" style={{ color: "#fca5a5" }}>
                      診断に失敗しました。URLをご確認ください。
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="v2-hero-visual"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <img src="/hero-woman.png" alt="" className="main" />
            <motion.div
              className="v2-seal s1"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Trophy size={20} color="#2563eb" />
              <div>
                <div className="num">★3</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>SCS対応</div>
              </div>
            </motion.div>
            <motion.div
              className="v2-seal s2 gold"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Award size={20} color="#d97706" />
              <div>
                <div className="num">★2</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>IPA認定</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* 4. Numbers strip */}
      <section className="v2-numbers">
        <div className="v2-container v2-numbers-grid">
          {[
            { n: 174, l: "検査項目" },
            { n: 23, l: "カテゴリ" },
            { n: 3, l: "分〜診断時間", suffix: "" },
            { n: 10, l: "OWASP Top10完全準拠" },
          ].map((it, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="num"><CountNumber to={it.n} /></div>
              <div className="label">{it.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 5. Strengths */}
      <section className="v2-section" id="features">
        <motion.div
          className="v2-container v2-center"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={reveal}
        >
          <div className="v2-eyebrow"><Sparkles size={12} /> WHY SEQULIA</div>
          <h2 className="v2-h2">Sequliaが選ばれる<span className="grad">3つの理由</span></h2>
          <p className="v2-lead">中小企業のセキュリティ対応を、最速・最低コストで支援します。</p>
        </motion.div>

        <motion.div
          className="v2-container v2-strengths"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerParent}
        >
          {[
            { ico: <Rocket size={28} />, title: "インストール不要", text: "ブラウザだけで完結。URLを入れるだけで、エージェント導入・SSL証明書設定など一切不要です。" },
            { ico: <Gift size={28} />, title: "無料で試せる", text: "クレジットカード不要・月3回まで完全無料。174項目の本格診断を体験してから判断できます。" },
            { ico: <Trophy size={28} />, title: "★4まで証明書発行", text: "IPA ★2 / Sequlia独自認定 ★3・★4 まで対応。取引先・入札先への提示資料として活用できます。" },
          ].map((c, i) => (
            <motion.div key={i} className="v2-strength-card" variants={reveal} whileHover={{ y: -6 }}>
              <div className="v2-strength-icon">{c.ico}</div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* 6. Crisis - 2027 */}
      <section className="v2-section v2-crisis" id="scs">
        <img src="/crisis-city.png" alt="" className="v2-crisis-deco left" />
        <img src="/crisis-woman.png" alt="" className="v2-crisis-deco right" />
        <motion.div
          className="v2-container v2-center"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={reveal}
        >
          <div className="v2-crisis-badge">🔔 2027年問題</div>
          <h2 className="v2-h2" style={{ marginTop: 18 }}>
            知ってますか？来年、<br />
            <span className="red">インボイス制度並みの大混乱</span>が来ることを
          </h2>
          <p className="v2-lead">
            経産省 SCS（Software Cybersecurity）評価制度が <strong>2027年に運用開始</strong>。<br />
            対応していない企業は取引・入札から除外される可能性があります。
          </p>
        </motion.div>

        <motion.div
          className="v2-container v2-crisis-cards"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerParent}
        >
          {[
            { icon: "💔", title: "取引先から切られる", text: "大手企業のサプライチェーン要件にSCS対応が組み込まれ、未対応企業は契約打ち切りに。" },
            { icon: "🚫", title: "新規契約断られる", text: "新規取引の入口で「セキュリティ証明書はありますか？」と聞かれる時代に。" },
            { icon: "📉", title: "入札で減点される", text: "公共調達・自治体案件では、SCS対応有無が加点項目として明文化される予定。" },
          ].map((c, i) => (
            <motion.div key={i} className="v2-crisis-card" variants={reveal}>
              <div className="v2-crisis-card-icon">{c.icon}</div>
              <h4><AlertTriangle size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />{c.title}</h4>
              <p>{c.text}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="v2-container"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="v2-crisis-conclude">
            <h3>
              つまりは…<br />
              「我が社はセキュリティ対策をしている」<br />
              という<span className="accent">&ldquo;証明&rdquo;</span>が必須になる。
            </h3>
          </div>
        </motion.div>
      </section>

      {/* 7. Options - どれもキツい */}
      <section className="v2-section">
        <motion.div
          className="v2-container v2-center"
          initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}
        >
          <div className="v2-eyebrow"><AlertTriangle size={12} /> 従来の選択肢</div>
          <h2 className="v2-h2">対応する選択肢、<span className="grad">どれもキツくない？</span></h2>
        </motion.div>

        <motion.div className="v2-container v2-options" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={staggerParent}>
          {[
            { emoji: "🏢", title: "専門業者に依頼", pricing: "¥30〜100万円 / 結果まで2〜4週間", verdict: "💰 高すぎる" },
            { emoji: "💻", title: "社内で対応", pricing: "何をすればいいかわからない / 専門人材不在", verdict: "🤯 困る" },
            { emoji: "🙈", title: "何もしない", pricing: "取引先から切られる / 入札で減点", verdict: "💀 最悪" },
          ].map((o, i) => (
            <motion.div key={i} className="v2-option" variants={reveal}>
              <div className="emoji">{o.emoji}</div>
              <h4>{o.title}</h4>
              <div className="pricing">{o.pricing}</div>
              <span className="verdict">{o.verdict}</span>
            </motion.div>
          ))}
        </motion.div>

        <div className="v2-container v2-center">
          <div className="v2-arrow">↓</div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            <div className="v2-eyebrow" style={{ background: "linear-gradient(135deg,#2563eb,#06b6d4)", color: "#fff" }}>
              <Sparkles size={12} /> そこで Sequlia
            </div>
            <h2 className="v2-h2"><span className="grad">3分・無料・自動</span>で全部解決</h2>
          </motion.div>
        </div>

        {/* 8. 5 steps */}
        <motion.div className="v2-container v2-steps" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            { ico: <Globe size={22} />, title: "URLを入力", time: "3秒", text: "対象サイトのURLを貼り付けるだけ。" },
            { ico: <Search size={22} />, title: "全自動クローリング", time: "30秒", text: "サブページ・サブドメインを自動探索。" },
            { ico: <Cpu size={22} />, title: "174項目を自動検査", time: "3分", text: "OWASP Top10を含む包括的診断。" },
            { ico: <Bot size={22} />, title: "AI解析レポート", time: "即時", text: "AIが優先度・対策方法を自動生成。" },
            { ico: <FileCheck size={22} />, title: "公式証明書発行", time: "即時", text: "★2〜★4の認定書をPDFで取得。" },
          ].map((s, i) => (
            <motion.div key={i} className="v2-step" variants={reveal}>
              <div className="stepnum">{i + 1}</div>
              <div className="ico">{s.ico}</div>
              <span className="time">{s.time}</span>
              <h4>{s.title}</h4>
              <p>{s.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* 9. 174 tier grid */}
      <section className="v2-section" style={{ background: "#f8fafc" }}>
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><Layers size={12} /> CHECK ITEMS</div>
          <h2 className="v2-h2"><span className="grad">174項目</span>の包括診断</h2>
          <p className="v2-lead">基本診断から高度な攻撃シミュレーションまで、4階層で網羅。</p>
        </motion.div>

        <motion.div className="v2-container v2-tiers" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            {
              tier: "Tier 1", note: "5モジュール / 51項目", color: "#16a34a",
              items: ["セキュリティヘッダー", "サイト構造", "古いソフトウェア", "設定ミス", "ベストプラクティス"],
            },
            {
              tier: "Tier 2", note: "7モジュール / 52項目", color: "#2563eb",
              items: ["情報漏洩", "DNS", "攻撃面", "CORS", "CSRF", "匿名API", "レートリミット"],
            },
            {
              tier: "Tier 3", note: "7モジュール / 43項目", color: "#8b5cf6",
              items: ["オープンリダイレクト", "列挙", "キャッシュポイズニング", "JWT", "クラウドストレージ", "OAuth", "GraphQL"],
            },
            {
              tier: "Tier 4", note: "4モジュール / 28項目", color: "#dc2626",
              items: ["XSS", "SQLi", "SSRF", "HTTPスマグリング"],
            },
          ].map((t, i) => (
            <motion.div key={i} className="v2-tier" variants={reveal}>
              <div className="v2-tier-head">
                <h3>{t.tier}</h3>
                <span className="badge" style={{ background: t.color }}>{t.note}</span>
              </div>
              <div className="v2-tier-items">
                {t.items.map((it) => (
                  <div className="v2-tier-item" key={it}>
                    <CheckCircle size={14} color={t.color} /> {it}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* 10. Certificates */}
      <section className="v2-section">
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><Award size={12} /> CERTIFICATES</div>
          <h2 className="v2-h2">取引先に提示できる<span className="grad">公式証明書</span></h2>
          <p className="v2-lead">国の制度に完全準拠した認定書を、診断完了と同時にPDFで発行します。</p>
        </motion.div>

        <motion.div className="v2-container v2-certs" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          <motion.div className="v2-cert" variants={reveal}>
            <div className="stars">★★</div>
            <div className="vis">
              <img src="/ipa-security-action-2.svg" alt="IPA SECURITY ACTION ★2" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <h3>IPA SECURITY ACTION 実施宣言証</h3>
            <div className="meta">1回スキャンで取得 / 全プラン対応</div>
          </motion.div>

          <motion.div className="v2-cert popular" variants={reveal}>
            <span className="badge">MOST POPULAR</span>
            <div className="stars">★★★</div>
            <div className="vis">
              <ShieldBadge level={3} />
            </div>
            <h3>SCS★3 対応認定証</h3>
            <div className="meta">1回スキャンで取得 / Standard以上</div>
          </motion.div>

          <motion.div className="v2-cert premium" variants={reveal}>
            <span className="badge">PREMIUM</span>
            <div className="stars">★★★★</div>
            <div className="vis">
              <ShieldBadge level={4} />
            </div>
            <h3>高度継続認定証</h3>
            <div className="meta">31日間 + 2回スキャンで取得 / Pro限定</div>
          </motion.div>
        </motion.div>
        <p style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "#64748b" }}>
          ※★3・★4はSequlia独自の認定書です。経産省SCS評価制度・IPA SECURITY ACTIONの規定に準拠した内容で発行します。
        </p>
      </section>

      {/* 11. Incidents */}
      <section className="v2-section" style={{ background: "linear-gradient(180deg,#fff1f2,#fff)" }} id="incidents">
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow" style={{ background: "rgba(220,38,38,.1)", color: "#dc2626" }}><AlertTriangle size={12} /> REAL CASES</div>
          <h2 className="v2-h2">実際の<span className="red">被害事例</span></h2>
          <p className="v2-lead">これらは全て、Sequliaなら事前検出可能だった事例です。</p>
        </motion.div>

        <motion.div className="v2-container v2-incidents" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            { period: "2023年", type: "ランサムウェア", title: "大手飲料メーカー", damage: "国内工場6拠点が稼働停止、出荷遅延・億単位の損失" },
            { period: "2024年", type: "不正アクセス", title: "自動車部品サプライヤー", damage: "完成車メーカー1社が国内全14工場で生産停止" },
            { period: "2024年", type: "情報漏洩", title: "大規模病院グループ", damage: "電子カルテシステム停止・診療中止・約4万人の患者情報流出" },
            { period: "2023年", type: "クレカ情報漏洩", title: "中堅EC事業者", damage: "顧客クレジット情報数万件流出、ブランド毀損" },
          ].map((c, i) => (
            <motion.div key={i} className="v2-incident" variants={reveal}>
              <div className="head">
                <span className="period">{c.period}</span>
                <span className="type">{c.type}</span>
              </div>
              <h4>{c.title}</h4>
              <div className="damage"><AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 4 }} color="#dc2626" />{c.damage}</div>
              <span className="detect"><CheckCircle size={14} /> Sequliaなら事前検出可能だった事例</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* 12. Pricing */}
      <section className="v2-section" id="pricing">
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><TrendingUp size={12} /> PRICING</div>
          <h2 className="v2-h2">シンプルで<span className="grad">明朗な料金</span></h2>
          <p className="v2-lead">月¥4,980から、専門業者の100分の1のコストで本格診断。</p>
        </motion.div>

        <motion.div className="v2-container v2-pricing" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            { name: "Free", price: "¥0", per: "/月", feats: ["1ドメイン", "月3回診断", "基本レポート", "★2 IPA証明書"], cta: { href: "/signup", label: "無料で始める" }, cls: "" },
            { name: "Standard", price: "¥4,980", per: "/月", feats: ["5ドメイン", "月15回診断", "AI解析レポート", "★2・★3 証明書"], cta: { href: "/signup?plan=standard", label: "Standardを選ぶ" }, cls: "featured", ribbon: "人気" },
            { name: "Pro", price: "¥19,800", per: "/月", feats: ["20ドメイン", "月60回診断", "認証後ページ対応", "★2・★3・★4 証明書"], cta: { href: "/signup?plan=pro", label: "Proを選ぶ" }, cls: "pro", ribbon: "PREMIUM" },
            { name: "Enterprise", price: "個別見積", per: "", feats: ["無制限ドメイン", "無制限診断", "専任担当・SLA", "全証明書 + カスタム"], cta: { href: "/pricing", label: "問い合わせる" }, cls: "" },
          ].map((p, i) => (
            <motion.div key={i} className={`v2-price-card ${p.cls}`} variants={reveal}>
              {p.ribbon && <span className="ribbon">{p.ribbon}</span>}
              <h3>{p.name}</h3>
              <div className="price">{p.price}<small>{p.per}</small></div>
              <ul>
                {p.feats.map((f) => <li key={f}><CheckCircle size={14} color="#16a34a" />{f}</li>)}
              </ul>
              <Link href={p.cta.href} className="v2-btn v2-btn-primary" style={{ justifyContent: "center" }}>{p.cta.label}</Link>
            </motion.div>
          ))}
        </motion.div>

        {/* 13. Comparison */}
        <motion.div className="v2-container v2-compare" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th className="sequlia">Sequlia</th>
                <th>専門業者</th>
                <th>何もしない</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>初回費用</td><td className="good">¥0</td><td className="bad">¥30〜100万円</td><td>¥0</td></tr>
              <tr><td>月額</td><td className="good">¥0〜19,800</td><td className="bad">¥10〜30万円</td><td>¥0</td></tr>
              <tr><td>診断頻度</td><td className="good">月3〜60回</td><td>年1〜2回</td><td className="bad">なし</td></tr>
              <tr><td>結果取得まで</td><td className="good">3〜8分</td><td className="bad">2〜4週間</td><td>—</td></tr>
              <tr><td>診断項目数</td><td className="good">174項目</td><td>100〜200項目</td><td className="bad">0</td></tr>
              <tr><td>証明書発行</td><td className="good">★2〜★4</td><td>カスタム</td><td className="bad">なし</td></tr>
            </tbody>
          </table>
        </motion.div>
      </section>

      {/* 14. Usecases */}
      <section className="v2-section" style={{ background: "#f8fafc" }}>
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><Users size={12} /> USE CASES</div>
          <h2 className="v2-h2"><span className="grad">業種別</span>ユースケース</h2>
        </motion.div>
        <motion.div className="v2-container v2-usecases" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            { ico: <Cloud size={22} />, title: "SaaS / Web系", text: "顧客への信頼性証明・SOC2準備" },
            { ico: <ShoppingCart size={22} />, title: "EC事業", text: "決済情報保護・PCI DSS準拠補助" },
            { ico: <Factory size={22} />, title: "製造業", text: "サプライチェーン要件・SCS対応" },
            { ico: <Heart size={22} />, title: "医療・教育", text: "個人情報保護・継続的監視" },
            { ico: <Building2 size={22} />, title: "自治体・公共", text: "入札加点・住民データ保護" },
          ].map((u, i) => (
            <motion.div key={i} className="v2-usecase" variants={reveal}>
              <div className="ico">{u.ico}</div>
              <h4>{u.title}</h4>
              <p>{u.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* 15. Testimonials */}
      <section className="v2-section">
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><Star size={12} /> TESTIMONIALS</div>
          <h2 className="v2-h2">お客様の<span className="grad">声</span></h2>
        </motion.div>
        <motion.div className="v2-container v2-testimonials" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={staggerParent}>
          {[
            { stars: "★★★★★", text: "「セキュリティ診断業者の見積もりが60万円。Sequliaなら月額5,000円弱で同等以上の項目を毎月チェックできる。即決でした。」", name: "田中健二 様", role: "テックソリューション 情報システム部" },
            { stars: "★★★★★", text: "「2027年問題が話題になり始め、取引先からSCS対応を聞かれる場面が増えました。Sequliaの★3証明書のおかげで即答できるように。」", name: "佐藤美咲 様", role: "中堅製造業 経営企画" },
            { stars: "★★★★★", text: "「新機能リリースの度に自動でセキュリティ診断が走る運用にしました。CI/CDに組み込めるのが他社にない決め手でした。」", name: "山田隆 様", role: "EC事業者 CTO" },
          ].map((t, i) => (
            <motion.div key={i} className="v2-testimonial" variants={reveal}>
              <div className="stars">{t.stars}</div>
              <blockquote>{t.text}</blockquote>
              <div className="person">
                <div className="avatar">{t.name.charAt(0)}</div>
                <div>
                  <div className="name">{t.name}</div>
                  <div className="role">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* 16. Resource CTA */}
        <motion.div className="v2-container" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="v2-resource">
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div className="ico"><FileText size={36} /></div>
              <div>
                <h3>サービス資料PDFをダウンロード</h3>
                <p>料金・機能・導入事例をまとめた1枚資料。社内検討にお使いください。</p>
              </div>
            </div>
            <a href="/docs/Sequlia_Service_Overview.pdf" target="_blank" rel="noopener noreferrer" className="v2-btn v2-btn-primary">
              <FileText size={16} /> 資料をダウンロード
            </a>
          </div>
        </motion.div>
      </section>

      {/* 17. FAQ */}
      <section className="v2-section" style={{ background: "#f8fafc" }}>
        <motion.div className="v2-container v2-center" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={reveal}>
          <div className="v2-eyebrow"><Search size={12} /> FAQ</div>
          <h2 className="v2-h2">よくある<span className="grad">ご質問</span></h2>
        </motion.div>
        <div className="v2-container v2-faqs">
          {FAQ_ITEMS.map((f, i) => (
            <motion.div
              key={i}
              className="v2-faq"
              data-open={openFaq === i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{f.q}</span>
                <ChevronDown size={20} />
              </button>
              <AnimatePresence initial={false}>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="answer">{f.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 18. Final CTA */}
      <section className="v2-final-cta">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2>今すぐ、無料で診断を始めよう</h2>
          <p>クレジットカード不要・30秒登録・月3回まで完全無料。<br />まずは1サイトから、リスクの可視化を体験してください。</p>
          <div className="btns">
            <Link href="/signup" className="v2-btn v2-btn-white">
              <Sparkles size={16} /> 無料で始める <ArrowRight size={16} />
            </Link>
            <a href="/docs/Sequlia_Service_Overview.pdf" target="_blank" rel="noopener noreferrer" className="v2-btn v2-btn-outline" style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff" }}>
              <FileText size={16} /> 資料ダウンロード
            </a>
          </div>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}

// ─── Shield Badge SVG component ───────────────────────────────────────
function ShieldBadge({ level }: { level: 3 | 4 }) {
  const grad = level === 3
    ? ["#2563eb", "#06b6d4"]
    : ["#8b5cf6", "#06b6d4"];
  return (
    <svg viewBox="0 0 110 130" className="shield-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`grad-${level}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={grad[0]} />
          <stop offset="100%" stopColor={grad[1]} />
        </linearGradient>
      </defs>
      <path
        d="M55 4 L100 22 L100 70 Q100 100 55 124 Q10 100 10 70 L10 22 Z"
        fill={`url(#grad-${level})`}
        stroke="#fff"
        strokeWidth="2"
      />
      <path
        d="M55 12 L92 28 L92 70 Q92 96 55 116 Q18 96 18 70 L18 28 Z"
        fill="none"
        stroke="rgba(255,255,255,.4)"
        strokeWidth="1"
      />
      <text x="55" y="58" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="system-ui">SCS</text>
      <text x="55" y="86" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="900" fontFamily="system-ui">★{level}</text>
    </svg>
  );
}
