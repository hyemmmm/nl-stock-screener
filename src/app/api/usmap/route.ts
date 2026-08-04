import { NextResponse } from "next/server";
import { getUsMap } from "@/lib/usmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 미국 ETF 32개 + 국내 테마 구성종목·시세

export async function GET() {
  try {
    return NextResponse.json(await getUsMap());
  } catch (err) {
    console.error("[/api/usmap]", err);
    return NextResponse.json({ error: "미장 테마 지도를 불러오지 못했습니다" }, { status: 500 });
  }
}
