import { NextResponse } from "next/server";
import { getUsMap, getUsMapAt } from "@/lib/usmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 미국 심볼 90개 + 국내 테마 구성종목·시세(과거 모드는 일봉)

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    // date=YYYY-MM-DD → 그 미국 거래일 기준으로 재현
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(await getUsMapAt(date));
    }
    return NextResponse.json(await getUsMap());
  } catch (err) {
    console.error("[/api/usmap]", err);
    return NextResponse.json({ error: "미장 테마 지도를 불러오지 못했습니다" }, { status: 500 });
  }
}
