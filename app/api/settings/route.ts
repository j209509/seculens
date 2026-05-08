import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskText } from "@/lib/mask";

export const runtime = "nodejs";

// 設定値をマスクすべきキー（秘密情報を含む可能性があるもの）
const SECRET_KEYS = new Set(["OPENAI_API_KEY", "ENCRYPTION_KEY"]);

// 返す設定キー
const SETTING_KEYS = [
  "OPENAI_MODEL",
  "AI_TRIAGE_MODEL",
  "AI_BULK_MODEL",
  "AI_DAILY_BUDGET_USD",
] as const;

function maskSettingValue(key: string, value: string): string {
  if (SECRET_KEYS.has(key)) return maskText(value);
  return value;
}

// GET /api/settings — AppSetting一覧
export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
    });

    // キーが存在しない場合はデフォルト値を返す
    const settingMap = new Map(settings.map((s) => [s.key, s]));

    const result = SETTING_KEYS.map((key) => {
      const record = settingMap.get(key);
      return {
        key,
        value: record ? maskSettingValue(key, record.value) : "",
        createdAt: record?.createdAt ?? null,
        updatedAt: record?.updatedAt ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/settings GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/settings — AppSetting更新（upsert）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = body as { key?: string; value?: string };

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    if (value === undefined || value === null) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });

    return NextResponse.json({
      key: setting.key,
      value: maskSettingValue(setting.key, setting.value),
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    });
  } catch (e) {
    console.error("[api/settings POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
