import { NextResponse } from "next/server";
import { validateYesterday } from "@/lib/radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await validateYesterday());
  } catch (err) {
    console.error("[/api/radar/check]", err);
    return NextResponse.json({ error: "검증에 실패했습니다" }, { status: 500 });
  }
}
