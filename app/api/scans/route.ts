import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runFullScan } from "@/lib/scan-runner";
import { getCurrentUser } from "@/lib/auth";
import { checkScanQuota, checkDomainQuota, incrementScanUsage } from "@/lib/usage";

export const runtime = "nodejs";

// POST /api/scans — URLを受け取り、Scanを作成してバックグラウンドでスキャン開始
// - 認証ユーザー: userIdスコープ + プラン上限チェック + 使用量カウント
// - ゲスト (LPデモ): 従来通り作成可（互換性維持）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // URL形式の簡易バリデーション
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const user = await getCurrentUser();

    // 認証ユーザーの場合は事前にプラン上限をチェック
    if (user) {
      const quota = await checkScanQuota(user);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: "今月のスキャン回数上限に達しました。プランをアップグレードしてください。",
            quota,
          },
          { status: 402 }
        );
      }
      // ドメイン数上限チェック
      const domainQuota = await checkDomainQuota(user, url);
      if (!domainQuota.allowed) {
        return NextResponse.json(
          {
            error: domainQuota.reason ?? "ドメイン上限に達しました",
            domainQuota,
          },
          { status: 402 }
        );
      }
    }

    const scan = await prisma.scan.create({
      data: {
        url,
        userId: user?.id ?? null,
        status: "queued",
        progress: 0,
        currentStep: "",
        totalChecks: 0,
        doneChecks: 0,
        riskScore: 0,
        error: "",
      },
    });

    // 認証ユーザーの場合は使用量を加算（楽観的にインクリメント）
    if (user) {
      try {
        await incrementScanUsage(user.id);
      } catch (e) {
        console.error("[api/scans POST] incrementScanUsage error:", e);
      }
    }

    // TODO: ゲストモードの追加制約 (LPデモ用に最大10チェックなど) を
    // runFullScan(scanId, url, { guestMode: true }) として実装する。
    // 現状は scan-runner が options を受け取らないため通常実行。
    runFullScan(scan.id, url).catch((e) =>
      console.error("[api/scans] runFullScan error:", e)
    );

    return NextResponse.json({ scanId: scan.id }, { status: 201 });
  } catch (e) {
    console.error("[api/scans POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/scans — 現在ログイン中ユーザーのスキャン一覧（最新50件）
// 未ログインの場合は 401。
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    // ─── オーファン掃除: 5分以上更新がない running/queued は failed に ───
    // マシン再起動・デプロイ等で残ったゾンビスキャンを自動クリーンアップ
    const STALE_MS = 5 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALE_MS);
    await prisma.scan.updateMany({
      where: {
        userId: user.id,
        status: { in: ["running", "queued"] },
        updatedAt: { lt: cutoff },
      },
      data: {
        status: "failed",
        error: "サーバー再起動により中断されました",
        completedAt: new Date(),
      },
    }).catch(() => {});

    const scans = await prisma.scan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        findings: {
          select: { id: true, severity: true, type: true },
        },
        _count: {
          select: { findings: true },
        },
      },
    });

    return NextResponse.json(scans);
  } catch (e) {
    console.error("[api/scans GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
