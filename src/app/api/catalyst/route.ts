import { NextResponse } from "next/server";
import { analyzeCatalysts } from "@/lib/catalyst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 일봉 + 지수 + 급등일별 뉴스 병렬 수집

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code");
  const name = sp.get("name") || "";
  const minChg = sp.get("minChg") ? Number(sp.get("minChg")) : undefined;
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "종목코드가 필요합니다" }, { status: 400 });
  }
  try {
    const result = await analyzeCatalysts(code, name, { minChg });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/catalyst]", err);
    return NextResponse.json({ error: "분석에 실패했습니다" }, { status: 500 });
  }
}
