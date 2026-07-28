import { NextResponse } from "next/server";
import { scanGameCatalyst } from "@/lib/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 6종목 × (가격 + 뉴스 여러 창) 병렬

export async function GET() {
  try {
    return NextResponse.json(await scanGameCatalyst());
  } catch (err) {
    console.error("[/api/scanner]", err);
    return NextResponse.json({ error: "스캔에 실패했습니다" }, { status: 500 });
  }
}
