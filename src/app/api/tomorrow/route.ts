import { NextResponse } from "next/server";
import { buildTomorrow } from "@/lib/tomorrow";
import { recordPicks } from "@/lib/radarLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 뉴스+공시+반복성 종합 파이프라인

export async function GET() {
  try {
    const result = await buildTomorrow();
    // 후보를 픽으로 저장(하루 1건) → /radar/score에서 다음날 채점
    await recordPicks({
      since: result.since,
      catalysts: result.candidates.map((c) => ({
        title: c.title,
        type: c.type,
        why: c.why,
        sector: "",
        stocks: c.stocks.map((s) => ({ name: s.name, code: s.code })),
        link: "",
      })),
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/tomorrow]", err);
    return NextResponse.json({ error: "후보 생성에 실패했습니다" }, { status: 500 });
  }
}
