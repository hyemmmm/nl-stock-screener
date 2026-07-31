import { NextResponse } from "next/server";
import { analyzeAttention } from "@/lib/attention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 조회수 상위 20종목 × (일봉·수급·뉴스)

export async function GET() {
  try {
    return NextResponse.json(await analyzeAttention());
  } catch (err) {
    console.error("[/api/attention]", err);
    return NextResponse.json({ error: "관심 종목 분석에 실패했습니다" }, { status: 500 });
  }
}
