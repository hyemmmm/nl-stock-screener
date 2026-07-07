import { NextResponse } from "next/server";
import { getDailyIssues } from "@/lib/issues";
import { recordPrediction } from "@/lib/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDailyIssues();
    await recordPrediction(result).catch(() => {}); // 기록 실패해도 응답은 정상
    return NextResponse.json({ since: result.since, issues: result.issues });
  } catch (err) {
    console.error("[/api/today]", err);
    return NextResponse.json({ error: "이슈를 불러오지 못했습니다" }, { status: 500 });
  }
}
