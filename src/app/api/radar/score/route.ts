import { NextResponse } from "next/server";
import { getRadarBoard } from "@/lib/radarLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getRadarBoard());
  } catch (err) {
    console.error("[/api/radar/score]", err);
    return NextResponse.json({ error: "성적 집계에 실패했습니다" }, { status: 500 });
  }
}
