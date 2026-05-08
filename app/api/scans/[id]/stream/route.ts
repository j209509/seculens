import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getSubStep } from "@/lib/scan-progress-bus";

export const runtime = "nodejs";

// GET /api/scans/[id]/stream — SSEでスキャン進捗をリアルタイム配信
// タイムアウト: 720秒（12分）。20秒ごとにkeep-aliveピングを送信。
// 認可: scan.userId が設定されている場合、所有者または admin のみ。
//       ゲストスキャン (userId == null) は誰でも閲覧可（LPデモ互換）。
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const scanId = params.id;

  // ─── 開始前に認可チェック ───────────────────────────────────
  const existing = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { id: true, userId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  if (existing.userId) {
    const user = await getCurrentUser();
    const isOwner = user?.id === existing.userId;
    const isAdmin = user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const MAX_DURATION_MS  = 720_000; // 12分（重いサイトでも完走できる余裕）
  const POLL_INTERVAL_MS = 1_500;   // 1.5秒ごとにポーリング
  const PING_INTERVAL_MS = 20_000;  // 20秒ごとにkeep-alive（プロキシ・LBのタイムアウト対策）

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime   = Date.now();
      let   lastPingAt  = Date.now();
      let   closed      = false;

      function safeClose() {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }

      function sendEvent(data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // クライアント切断
        }
      }

      function sendPing() {
        if (closed) return;
        try {
          // SSEコメント行はデータとして処理されないが接続を維持する
          controller.enqueue(encoder.encode(`: ping\n\n`));
          lastPingAt = Date.now();
        } catch {
          closed = true;
        }
      }

      async function poll(): Promise<void> {
        if (closed) return;

        // ─── タイムアウトチェック ───────────────────────────────
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_DURATION_MS) {
          // タイムアウトしても「失敗」にはしない。
          // スキャン自体はバックグラウンドで継続中なので、
          // クライアントに「自動リコネクトしてください」を通知する。
          sendEvent({
            status: "reconnect",
            message: "接続を維持するため再接続してください",
            elapsed,
          });
          safeClose();
          return;
        }

        // ─── keep-alive ping ───────────────────────────────────
        if (Date.now() - lastPingAt >= PING_INTERVAL_MS) {
          sendPing();
        }

        // ─── DBポーリング ──────────────────────────────────────
        try {
          const scan = await prisma.scan.findUnique({
            where: { id: scanId },
            select: {
              id:           true,
              status:       true,
              progress:     true,
              currentStep:  true,
              totalChecks:  true,
              doneChecks:   true,
              riskScore:    true,
              error:        true,
              startedAt:    true,
              completedAt:  true,
              url:          true,
              _count: { select: { findings: true } },
            },
          });

          if (!scan) {
            sendEvent({ status: "error", error: "Scan not found" });
            safeClose();
            return;
          }

          // ライブ findings (発見順に最大200件)
          const liveFindings = await prisma.scanFinding.findMany({
            where: { scanId },
            select: { id: true, type: true, severity: true, target: true, impact: true, createdAt: true },
            orderBy: { createdAt: "asc" },
            take: 200,
          });

          // 経過時間・推定残り時間をサーバー側で付加
          const progressPct = scan.progress ?? 0;
          const elapsedSec  = Math.floor(elapsed / 1000);
          const estTotalSec = progressPct > 5
            ? Math.round((elapsedSec / progressPct) * 100)
            : null;
          const estRemainSec = estTotalSec !== null
            ? Math.max(0, estTotalSec - elapsedSec)
            : null;

          sendEvent({
            ...scan,
            findingsCount: scan._count.findings,
            findings: liveFindings,
            currentSubStep: getSubStep(scanId) ?? "",
            elapsedSec,
            estRemainSec,
          });

          if (scan.status === "completed" || scan.status === "failed") {
            safeClose();
            return;
          }
        } catch (e) {
          console.error("[stream] poll error:", e);
          // DBエラーは致命的でないのでクライアントに通知せず次のポーリングへ
        }

        // ─── 次ポーリングをスケジュール ────────────────────────
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        await poll();
      }

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",         // nginx のバッファリング無効化
    },
  });
}
