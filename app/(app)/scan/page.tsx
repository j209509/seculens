"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Shield, AlertTriangle, CheckCircle, Globe, Zap, Lock, Eye, Clock,
  CheckCheck, Timer, Activity,
} from "lucide-react";
import { RiskBadge } from "@/components/risk-badge";
import { CoffeeBreak } from "@/components/scan/CoffeeBreak";
import { FindingDetailModal } from "@/components/scan/FindingDetailModal";

// ─── チェック説明マップ ────────────────────────────────────────────────────────
// scan-runner.ts の CHECKS 配列と同順・同名
// itemCount: 各モジュールに含まれる詳細チェック項目の数（合計142項目）
const CHECK_DESCRIPTIONS: Record<string, { desc: string; itemCount: number }> = {
  // Tier 1
  "ベストプラクティス基本検査": {
    desc: "HSTS/CSP/Permissions-Policy/security.txt/robots.txt/Server情報開示等のWebセキュリティ基本ベストプラクティス",
    itemCount: 10,
  },
  "セキュリティヘッダー検査": {
    desc: "HSTS / CSP / X-Frame-Options などのセキュリティヘッダー・クリックジャッキング防止の確認",
    itemCount: 10,
  },
  "サイト構造・隠しパス検出": {
    desc: ".well-known / robots.txt / sitemap.xml からのサイト構造・隠しパスの検出",
    itemCount: 8,
  },
  "古いソフトウェア・既知脆弱性検出": {
    desc: "既知脆弱性を持つ古いフレームワーク・ライブラリ・サーバーソフトウェアの検出",
    itemCount: 8,
  },
  "設定ミス・管理画面露出検査": {
    desc: "設定ミス・デフォルト認証・管理画面露出の検査（ディレクトリリスティング・管理パス 等）",
    itemCount: 15,
  },
  // Tier 2
  "情報漏洩・機密ファイル露出検査": {
    desc: "公開情報からの情報漏洩・機密ファイル露出の受動的検査（バックアップファイル・Git露出 等）",
    itemCount: 10,
  },
  "DNS・サブドメイン情報収集": {
    desc: "DNS・Whois・サブドメイン・メタデータから攻撃者が収集できる情報の洗い出し",
    itemCount: 10,
  },
  "攻撃対象面（Attack Surface）分析": {
    desc: "インターネット公開エンドポイント・ポート・サービスの攻撃対象面を分析（SCS★3 主要要件）",
    itemCount: 7,
  },
  "CORS設定確認": {
    desc: "クロスオリジンリソース共有（CORS）の誤設定検出（Originリフレクション・wildcard 等）",
    itemCount: 7,
  },
  "CSRF確認": {
    desc: "クロスサイトリクエストフォージェリ（CSRF）保護トークンの欠落を確認",
    itemCount: 6,
  },
  "匿名API露出確認": {
    desc: "認証なしでアクセス可能なAPIエンドポイント・機密データ露出の検査（OWASP API Top10）",
    itemCount: 7,
  },
  "レートリミット": {
    desc: "ブルートフォース・DoS攻撃を許容するレート制限（Rate Limit）欠落の確認",
    itemCount: 5,
  },
  // Tier 3
  "オープンリダイレクト": {
    desc: "フィッシング・認証バイパスに悪用されるオープンリダイレクト脆弱性の検出",
    itemCount: 7,
  },
  "ユーザー列挙": {
    desc: "ログイン・パスワードリセット画面でのユーザー存在確認による列挙攻撃の検出",
    itemCount: 5,
  },
  "キャッシュポイズニング": {
    desc: "Webキャッシュポイズニング脆弱性の検出（Host・X-Forwarded-Host ヘッダー操作 等）",
    itemCount: 5,
  },
  "JWT脆弱性": {
    desc: "JSON Webトークンの署名検証欠落・アルゴリズム混同（alg:none）攻撃の確認",
    itemCount: 6,
  },
  "パブリッククラウドストレージ": {
    desc: "AWS S3・GCS・Azure Blob の公開バケット・機密ファイル露出の検査",
    itemCount: 6,
  },
  "OAuthフロー欠陥": {
    desc: "OAuth 2.0 フローの state 値欠落・リダイレクトURI検証不備・トークン漏洩の確認",
    itemCount: 7,
  },
  "GraphQL脆弱性": {
    desc: "GraphQLのイントロスペクション有効化・クエリ深度制限欠落・バッチ攻撃の確認",
    itemCount: 7,
  },
  // Tier 4
  "XSS安全確認": {
    desc: "クロスサイトスクリプティング（反射型・保存型・DOM型 XSS）の安全かつ非破壊的な検査",
    itemCount: 10,
  },
  "SQLi安全確認": {
    desc: "SQLインジェクション脆弱性（エラーベース・ブラインド）の安全かつ非破壊的な検査",
    itemCount: 8,
  },
  "SSRF安全確認": {
    desc: "サーバーサイドリクエストフォージェリ（SSRF）・テンプレートインジェクション（SSTI）の安全検査",
    itemCount: 6,
  },
  "HTTPスマグリング": {
    desc: "HTTPリクエストスマグリング（CL-TE / TE-CL）脆弱性の検出",
    itemCount: 4,
  },
};

const CHECK_KEYS = Object.keys(CHECK_DESCRIPTIONS);
const TOTAL_CHECKS = CHECK_KEYS.length; // 22 modules
const TOTAL_ITEMS = CHECK_KEYS.reduce((sum, k) => sum + CHECK_DESCRIPTIONS[k].itemCount, 0); // 164

/** 完了したモジュール数から実行済み項目数を算出 */
function itemsCompleted(doneChecksCount: number): number {
  return CHECK_KEYS.slice(0, Math.min(doneChecksCount, CHECK_KEYS.length))
    .reduce((sum, k) => sum + CHECK_DESCRIPTIONS[k].itemCount, 0);
}

const SCAN_FEATURES = [
  { icon: Shield, label: "OWASP Top10検査", desc: "最新の脅威リストに基づく網羅的な検査" },
  { icon: Zap, label: "174項目を網羅検査", desc: "平均3〜8分で詳細診断完了" },
  { icon: Lock, label: "安全な非侵襲検査", desc: "対象サービスに影響を与えない受動的スキャン" },
  { icon: Eye, label: "AI解析レポート", desc: "検出結果を日本語で分かりやすく解説" },
];

type ScanState = "idle" | "scanning" | "done" | "error";

interface Finding {
  id: string;
  type: string;
  severity: string;
  impact: string;
  target: string;
}

const MAX_RECONNECT = 5;

export default function ScanPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [currentSubStep, setCurrentSubStep] = useState("");
  const [doneChecks, setDoneChecks] = useState(0);
  const [totalChecks, setTotalChecks] = useState(TOTAL_CHECKS);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [estRemainSec, setEstRemainSec] = useState<number | null>(25 * 60); // 初期値25分（楽観的な推定値が安定するまでの間表示）
  // 残り時間は「減るだけ」にする（伸びると体験最悪）
  const lastRemainRef = useRef<number>(25 * 60);
  const lastTickAtRef = useRef<number>(Date.now());
  // 経過時間の起点（クライアント側のtickでカウントアップ）
  const scanStartedAtRef = useRef<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // refs for reconnect logic
  const esRef = useRef<EventSource | null>(null);
  const reconnectCount = useRef(0);
  const scanIdRef = useRef<string | null>(null);
  const scanStateRef = useRef<ScanState>("idle");

  /** URLにscanIdを保存（リロード時に続きから再開できるように） */
  function persistScanIdToUrl(id: string | null) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
  }

  function isValidUrl(s: string) {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function formatTime(sec: number): string {
    if (sec < 60) return `${sec}秒`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}分${s}秒` : `${m}分`;
  }

  const connectStream = useCallback((id: string) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/scans/${id}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // サーバーから再接続要求が来た場合（12分タイムアウト）
        if (data.status === "reconnect") {
          es.close();
          if (reconnectCount.current < MAX_RECONNECT && scanStateRef.current === "scanning") {
            reconnectCount.current++;
            setTimeout(() => connectStream(id), 2000);
          }
          return;
        }

        setProgress(data.progress ?? 0);
        const step = data.currentStep ?? "";
        setCurrentStep(step);
        if (typeof data.currentSubStep === "string") setCurrentSubStep(data.currentSubStep);
        setDoneChecks(data.doneChecks ?? 0);
        setTotalChecks(data.totalChecks ?? TOTAL_CHECKS);
        // サーバ報告の経過時間を「最大値」として採用（クライアントtickの方が進んでる場合は無視）
        const serverElapsed = data.elapsedSec ?? 0;
        if (scanStartedAtRef.current === null) {
          scanStartedAtRef.current = Date.now() - serverElapsed * 1000;
        }
        setElapsedSec((cur) => Math.max(cur, serverElapsed));
        // 残り時間: 単純な「最大25分のカウントダウン」（サーバ推定は無視・伸びると体験最悪）
        const TOTAL_SCAN_BUDGET_SEC = 25 * 60;
        const remain = Math.max(0, TOTAL_SCAN_BUDGET_SEC - serverElapsed);
        setEstRemainSec(remain);
        if (Array.isArray(data.findings)) setFindings(data.findings);

        // 完了済みチェックリストを更新
        if (step && step !== "完了" && step !== "接続中...") {
          setCompletedSteps((prev) => {
            const idx = prev.indexOf(step);
            if (idx === -1) {
              // まだ入ってない = 前のステップが完了したので追加
              const prevStep = prev[prev.length - 1];
              if (prevStep && prevStep !== step) return prev;
              return prev;
            }
            return prev;
          });
        }

        // doneChecks が増えたら前のステップを完了リストに追加
        const done = data.doneChecks ?? 0;
        const allKeys = Object.keys(CHECK_DESCRIPTIONS);
        if (done > 0 && done <= allKeys.length) {
          const finishedStep = allKeys[done - 1];
          if (finishedStep) {
            setCompletedSteps((prev) => {
              if (!prev.includes(finishedStep)) return [...prev, finishedStep];
              return prev;
            });
          }
        }

        if (data.status === "completed" || data.status === "failed") {
          es.close();
          esRef.current = null;
          if (data.status === "completed") {
            setScanState("done");
            scanStateRef.current = "done";
          } else {
            setError("スキャンが失敗しました");
            setScanState("error");
            scanStateRef.current = "error";
          }
        }
      } catch {
        // parse error - ignore
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (scanStateRef.current === "scanning" && reconnectCount.current < MAX_RECONNECT) {
        reconnectCount.current++;
        // 2秒後に再接続（最大5回）
        setTimeout(() => {
          if (scanStateRef.current === "scanning" && scanIdRef.current) {
            connectStream(scanIdRef.current);
          }
        }, 2000);
      } else if (scanStateRef.current === "scanning") {
        setError("接続が切断されました。ページを再読み込みしてください。");
        setScanState("error");
        scanStateRef.current = "error";
      }
    };
  }, []);

  async function startScan() {
    if (!url) { setError("URLを入力してください"); return; }
    if (!isValidUrl(url)) { setError("有効なURLを入力してください（例：https://example.com）"); return; }
    setError("");
    setScanState("scanning");
    scanStateRef.current = "scanning";
    setProgress(0);
    setCurrentStep("接続中...");
    setCurrentSubStep("");
    setDoneChecks(0);
    setTotalChecks(TOTAL_CHECKS);
    setElapsedSec(0);
    scanStartedAtRef.current = Date.now();
    setEstRemainSec(25 * 60);
    lastRemainRef.current = 25 * 60;
    lastTickAtRef.current = Date.now();
    setCompletedSteps([]);
    setFindings([]);
    setScanId(null);
    scanIdRef.current = null;
    reconnectCount.current = 0;

    let id: string;
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(`スキャン開始に失敗しました (${res.status})`);
      const data = await res.json();
      id = data.scanId ?? data.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "スキャン開始に失敗しました");
      setScanState("error");
      scanStateRef.current = "error";
      return;
    }

    setScanId(id);
    scanIdRef.current = id;
    persistScanIdToUrl(id);
    connectStream(id);
  }

  function resetScan() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setScanState("idle");
    scanStateRef.current = "idle";
    setProgress(0);
    setCurrentStep("");
    setCurrentSubStep("");
    setDoneChecks(0);
    setTotalChecks(TOTAL_CHECKS);
    setElapsedSec(0);
    scanStartedAtRef.current = Date.now();
    setEstRemainSec(25 * 60);
    lastRemainRef.current = 25 * 60;
    lastTickAtRef.current = Date.now();
    setCompletedSteps([]);
    setFindings([]);
    setScanId(null);
    scanIdRef.current = null;
    setUrl("");
    setError("");
    reconnectCount.current = 0;
    persistScanIdToUrl(null);
  }

  // ─── 経過時間の自動カウントアップ（SSE切れても止まらない） ───────────
  useEffect(() => {
    if (scanState !== "scanning") return;
    if (scanStartedAtRef.current === null) {
      // SSE初回が来てない場合は now を起点に
      scanStartedAtRef.current = Date.now() - (elapsedSec * 1000);
    }
    const intv = setInterval(() => {
      if (scanStartedAtRef.current === null) return;
      const sec = Math.floor((Date.now() - scanStartedAtRef.current) / 1000);
      setElapsedSec((cur) => Math.max(cur, sec));
      // 残り時間も同期して減らす（25分カウントダウン）
      const remain = Math.max(0, 25 * 60 - sec);
      setEstRemainSec(remain);
    }, 1000);
    return () => clearInterval(intv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState]);

  // ─── リロード復元: URLに?id=xxxがあれば再接続 ─────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("id");
    if (!resumeId) return;
    // スキャン情報を取得して状態を復元
    fetch(`/api/scans/${resumeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          // Not found / forbidden — URLからクリア
          persistScanIdToUrl(null);
          return;
        }
        setUrl(data.url ?? "");
        setScanId(resumeId);
        scanIdRef.current = resumeId;

        if (data.status === "completed") {
          // 完了済み: findings 表示
          setScanState("done");
          scanStateRef.current = "done";
          setProgress(100);
          setDoneChecks(data.totalChecks ?? TOTAL_CHECKS);
          setTotalChecks(data.totalChecks ?? TOTAL_CHECKS);
          if (Array.isArray(data.findings)) setFindings(data.findings);
        } else if (data.status === "failed") {
          setScanState("error");
          scanStateRef.current = "error";
          setError(data.error || "スキャンが失敗しました");
        } else {
          // running / queued: SSEで再接続
          setScanState("scanning");
          scanStateRef.current = "scanning";
          setProgress(data.progress ?? 0);
          setCurrentStep(data.currentStep ?? "再接続中...");
          setDoneChecks(data.doneChecks ?? 0);
          setTotalChecks(data.totalChecks ?? TOTAL_CHECKS);
          // 経過時間の起点をDBの startedAt から推定
          if (data.startedAt) {
            const t0 = new Date(data.startedAt).getTime();
            scanStartedAtRef.current = t0;
            setElapsedSec(Math.floor((Date.now() - t0) / 1000));
          } else {
            scanStartedAtRef.current = Date.now();
          }
          if (Array.isArray(data.findings)) setFindings(data.findings);
          // SSE接続を開始
          connectStream(resumeId);
        }
      })
      .catch(() => persistScanIdToUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function viewDetails() {
    if (scanId) router.push(`/results/${scanId}`);
  }

  const severityOrder = ["critical", "high", "medium", "low", "info"];
  const riskCounts = findings.reduce(
    (acc, f) => {
      const sev = f.severity?.toLowerCase() ?? "info";
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const currentCheckInfo = CHECK_DESCRIPTIONS[currentStep];


  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">脆弱性スキャン</h1>
        <p className="text-sm text-slate-500 mt-1">URLを入力してWebアプリケーションのセキュリティ診断を開始します</p>
      </div>

      {/* ─── URL入力 ─────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            診断対象URLの入力
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                disabled={scanState === "scanning"}
                className="h-11 text-sm"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
            {scanState === "idle" || scanState === "error" ? (
              <Button onClick={startScan} className="h-11 px-6 bg-blue-600 hover:bg-blue-700">
                <Search className="w-4 h-4 mr-2" />
                スキャン開始
              </Button>
            ) : scanState === "done" ? (
              <Button onClick={resetScan} variant="outline" className="h-11 px-6">
                再スキャン
              </Button>
            ) : (
              <Button disabled className="h-11 px-6">
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                診断中...
              </Button>
            )}
          </div>

          {/* ─── 完了バナー ─── */}
          {scanState === "done" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">スキャン完了</p>
                <p className="text-xs text-emerald-600 mt-0.5">{url} の診断が完了しました</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── スキャン進捗UI ───────────────────────────────────────── */}
      {scanState === "scanning" && (
        <div className="space-y-4">
          {/* メインプログレスカード */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-950 to-slate-900 text-white overflow-hidden">
            <CardContent className="pt-5 pb-5">
              {/* ヘッダー行 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse inline-block" />
                  <span className="text-sm font-semibold text-blue-200">診断実行中</span>
                  {reconnectCount.current > 0 && (
                    <span className="text-xs text-amber-300 bg-amber-900/40 rounded px-1.5 py-0.5">
                      再接続中 ({reconnectCount.current}/{MAX_RECONNECT})
                    </span>
                  )}
                </div>
                <span className="text-2xl font-bold text-white tabular-nums">{progress}%</span>
              </div>

              {/* プログレスバー */}
              <div className="w-full bg-slate-700 rounded-full h-2.5 mb-4">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* ステータス行（カード化して視認性UP） */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/80 uppercase tracking-wide mb-1">
                    <CheckCheck className="w-3.5 h-3.5" />
                    確認済み項目
                  </div>
                  <div className="text-lg font-bold text-white tabular-nums leading-none">
                    {itemsCompleted(doneChecks)}
                    <span className="text-sm font-medium text-slate-400 ml-1">/ {TOTAL_ITEMS}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-500/10 border border-blue-400/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-300/80 uppercase tracking-wide mb-1">
                    <Activity className="w-3.5 h-3.5" />
                    カテゴリ
                  </div>
                  <div className="text-lg font-bold text-white tabular-nums leading-none">
                    {doneChecks}
                    <span className="text-sm font-medium text-slate-400 ml-1">/ {totalChecks}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300/80 uppercase tracking-wide mb-1">
                    <Timer className="w-3.5 h-3.5" />
                    経過時間
                  </div>
                  <div className="text-lg font-bold text-white tabular-nums leading-none">
                    {formatTime(elapsedSec)}
                  </div>
                </div>

                <div className="rounded-lg bg-purple-500/10 border border-purple-400/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-purple-300/80 uppercase tracking-wide mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    残り目安
                  </div>
                  <div className="text-lg font-bold text-white tabular-nums leading-none">
                    {estRemainSec !== null ? formatTime(estRemainSec) : "計算中..."}
                  </div>
                </div>
              </div>

              {/* 現在実行中チェック */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">現在のチェック</p>
                <p className="text-base font-bold text-white mb-1">
                  {currentStep || "初期化中..."}
                </p>
                {currentCheckInfo ? (
                  <>
                    <p className="text-sm text-slate-300 leading-relaxed">{currentCheckInfo.desc}</p>
                    {currentSubStep && (
                      <p className="text-xs text-blue-300/70 mt-1 font-mono truncate">
                        ▸ {currentSubStep}
                      </p>
                    )}
                    <span className="inline-block mt-2 text-xs bg-blue-900/60 text-blue-300 rounded px-2 py-0.5">
                      {currentCheckInfo.itemCount}項目を確認中
                    </span>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">診断を準備しています...</p>
                    {currentSubStep && (
                      <p className="text-xs text-blue-300/70 mt-1 font-mono truncate">
                        ▸ {currentSubStep}
                      </p>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* コーヒーブレイク（30秒以上経過したら表示） */}
          <CoffeeBreak elapsedSec={elapsedSec} />

          {/* 🔍 リアルタイム検出 */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-500" />
                🔍 リアルタイム検出 ({findings.length}件)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <p className="text-xs text-slate-400">まだ検出されていません — 順次表示されます</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {[...findings].reverse().map((finding) => {
                    const sev = (finding.severity?.toLowerCase() ?? "info") as "critical" | "high" | "medium" | "low" | "info";
                    const barColor =
                      sev === "critical" ? "bg-red-500" :
                      sev === "high" ? "bg-orange-500" :
                      sev === "medium" ? "bg-amber-500" :
                      sev === "low" ? "bg-green-500" : "bg-blue-500";
                    return (
                      <button
                        key={finding.id}
                        type="button"
                        onClick={() => setSelectedFinding(finding)}
                        className="w-full text-left flex items-start gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className={`rounded-full flex-shrink-0 ${barColor}`} style={{ width: 3, minHeight: 36 }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <RiskBadge level={sev} />
                            <span className="text-sm font-semibold text-slate-900 truncate">{finding.type}</span>
                            <span className="text-[10px] text-blue-600 font-medium ml-auto flex-shrink-0">▸ 詳細</span>
                          </div>
                          {finding.target && (
                            <p className="text-xs text-slate-500 truncate">対象: {finding.target}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 完了済みチェックリスト */}
          {completedSteps.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  完了したカテゴリ ({completedSteps.length} / {totalChecks})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {[...completedSteps].reverse().map((step, i) => {
                    const info = CHECK_DESCRIPTIONS[step];
                    return (
                      <div
                        key={`${step}-${i}`}
                        className="flex items-start gap-2.5 py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-100"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{step}</p>
                          {info && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{info.desc.split("（")[0]}</p>
                          )}
                        </div>
                        {info && (
                          <span className="ml-auto text-xs text-emerald-600 flex-shrink-0">{info.itemCount}項目</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 残りチェック予告 */}
          {doneChecks < totalChecks && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-500 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  残りのカテゴリ（{totalChecks - doneChecks}件 / 約{TOTAL_ITEMS - itemsCompleted(doneChecks)}項目）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(CHECK_DESCRIPTIONS)
                    .filter((k) => !completedSteps.includes(k) && k !== currentStep)
                    .map((k) => (
                      <span
                        key={k}
                        className="text-xs bg-slate-100 text-slate-500 rounded px-2 py-0.5"
                      >
                        {k}
                      </span>
                    ))}
                  {currentStep && CHECK_DESCRIPTIONS[currentStep] && (
                    <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 animate-pulse font-medium">
                      ▶ {currentStep}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 安心メッセージ */}
          <p className="text-center text-xs text-slate-400 pb-2">
            🔒 スキャンはバックグラウンドで継続されます。このページを開いたままにしてください。<br />
            接続が切れた場合も自動で再接続します（最大{MAX_RECONNECT}回）。
          </p>
        </div>
      )}

      {/* ─── アイドル時のフィーチャーカード ────────────────────────── */}
      {(scanState === "idle" || scanState === "error") && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SCAN_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.label} className="border-0 shadow-sm">
                <CardContent className="pt-5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{f.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── 完了後の結果表示 ────────────────────────────────────────── */}
      {scanState === "done" && (
        <div className="space-y-4">
          {/* サマリ行 */}
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex flex-wrap gap-6 items-center">
                <div>
                  <p className="text-xs text-slate-500">検出した脆弱性</p>
                  <p className="text-2xl font-bold text-slate-900">{findings.length}件</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {severityOrder.map((lvl) =>
                    riskCounts[lvl] ? (
                      <div key={lvl} className="flex items-center gap-1.5">
                        <RiskBadge level={lvl as "critical" | "high" | "medium" | "low" | "info"} />
                        <span className="text-sm font-semibold text-slate-700">{riskCounts[lvl]}件</span>
                      </div>
                    ) : null
                  )}
                </div>
                <div className="ml-auto">
                  <Button onClick={viewDetails} className="bg-blue-600 hover:bg-blue-700">
                    詳細レポートを見る
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Finding カード */}
          {findings.length > 0 && (
            <div className="space-y-3">
              {findings.map((finding) => {
                const sev = (finding.severity?.toLowerCase() ?? "info") as "critical" | "high" | "medium" | "low" | "info";
                const barColor =
                  sev === "critical" ? "bg-red-500" :
                  sev === "high" ? "bg-orange-500" :
                  sev === "medium" ? "bg-amber-500" :
                  sev === "low" ? "bg-green-500" : "bg-blue-500";
                return (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => setSelectedFinding(finding)}
                    className="w-full text-left bg-white rounded-lg border-0 shadow-sm hover:shadow-md hover:ring-2 hover:ring-blue-200 transition-all cursor-pointer"
                  >
                    <div className="pt-5 pb-5 px-6">
                      <div className="flex items-start gap-4">
                        <div className={`rounded-full flex-shrink-0 ${barColor}`} style={{ width: 3, minHeight: 60 }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <RiskBadge level={sev} />
                            <span className="text-sm font-semibold text-slate-900">{finding.type}</span>
                            <span className="text-xs text-blue-600 font-medium ml-auto">▸ クリックで詳細</span>
                          </div>
                          {finding.impact && (
                            <p className="text-sm text-slate-600 leading-relaxed">{finding.impact}</p>
                          )}
                          {finding.target && (
                            <div className="mt-3">
                              <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">
                                対象: {finding.target}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {findings.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 flex flex-col items-center text-slate-400">
                <Shield className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">脆弱性は検出されませんでした</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── OWASP情報（アイドル時のみ）────────────────────────────── */}
      {(scanState === "idle" || scanState === "error") && (
        <Card className="border-0 shadow-sm bg-slate-800 text-slate-100">
          <CardContent className="pt-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">OWASP Top 10 準拠の包括的診断（{TOTAL_ITEMS}項目）</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  A01: アクセス制御の破損 / A02: 暗号化の失敗 / A03: インジェクション / A04: 安全でない設計 /
                  A05: セキュリティの設定ミス / A06: 脆弱で古くなったコンポーネント / A07: 識別と認証の失敗 /
                  A08: ソフトウェアとデータの整合性の失敗 / A09: セキュリティログの失敗 / A10: SSRF
                </p>
                <p className="text-xs text-blue-400 mt-2">
                  ⭐ 経産省 SCS評価制度 ★3「インターネット公開機器の脆弱性診断」要件に対応
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Finding詳細モーダル */}
      <FindingDetailModal finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
    </div>
  );
}
