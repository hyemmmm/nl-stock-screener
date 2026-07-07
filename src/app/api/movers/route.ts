import { NextResponse } from "next/server";
import { getMovers } from "@/lib/movers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 순위 4장 + 종목별 뉴스 병렬 수집

export async function GET() {
  try {
    const result = await getMovers();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/movers]", err);
    return NextResponse.json({ error: "특징주를 불러오지 못했습니다" }, { status: 500 });
  }
}
