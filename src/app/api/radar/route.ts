import { NextResponse } from "next/server";
import { detectCatalysts } from "@/lib/radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await detectCatalysts());
  } catch (err) {
    console.error("[/api/radar]", err);
    return NextResponse.json({ error: "감지에 실패했습니다" }, { status: 500 });
  }
}
