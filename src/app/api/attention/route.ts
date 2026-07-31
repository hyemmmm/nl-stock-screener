import { NextResponse } from "next/server";
import { analyzeAttention } from "@/lib/attention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 조회수 상위 20종목 × (일봉·수급·뉴스)

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams.get("pool");
    const pool = p === "value" ? "value" : p === "search" ? "search" : "theme";
    return NextResponse.json(await analyzeAttention(pool));
  } catch (err) {
    console.error("[/api/attention]", err);
    return NextResponse.json({ error: "관심 종목 분석에 실패했습니다" }, { status: 500 });
  }
}
