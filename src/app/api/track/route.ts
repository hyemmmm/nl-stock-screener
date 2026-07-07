import { NextResponse } from "next/server";
import { getScoreboard } from "@/lib/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await getScoreboard();
    return NextResponse.json(board);
  } catch (err) {
    console.error("[/api/track]", err);
    return NextResponse.json({ error: "성적표를 불러오지 못했습니다" }, { status: 500 });
  }
}
