import { NextResponse } from "next/server";
import { getDailyIssues } from "@/lib/issues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { since, issues } = await getDailyIssues();
    return NextResponse.json({ since, issues });
  } catch (err) {
    console.error("[/api/today]", err);
    return NextResponse.json({ error: "이슈를 불러오지 못했습니다" }, { status: 500 });
  }
}
