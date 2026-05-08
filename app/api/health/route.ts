import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 軽量ヘルスチェック - DBクエリなし、即応答
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
