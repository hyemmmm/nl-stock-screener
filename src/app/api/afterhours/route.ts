import { NextResponse } from "next/server";
import { getAfterHours } from "@/lib/afterhours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 테마 구성종목 수집(첫 호출) + 전 종목 시간외 스캔

export async function GET() {
  try {
    return NextResponse.json(await getAfterHours());
  } catch (err) {
    console.error("[/api/afterhours]", err);
    return NextResponse.json({ error: "시간외 데이터를 불러오지 못했습니다" }, { status: 500 });
  }
}
