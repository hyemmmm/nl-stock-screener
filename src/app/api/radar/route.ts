import { NextResponse } from "next/server";
import { detectCatalysts } from "@/lib/radar";
import { recordPicks } from "@/lib/radarLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await detectCatalysts();
    await recordPicks(result).catch(() => {}); // 오늘 픽 저장(하루 1건)
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/radar]", err);
    return NextResponse.json({ error: "감지에 실패했습니다" }, { status: 500 });
  }
}
