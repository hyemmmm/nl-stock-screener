import { NextResponse } from "next/server";
import { disclosureBacktest } from "@/lib/dart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await disclosureBacktest(6));
  } catch (err) {
    console.error("[/api/disclosures/backtest]", err);
    return NextResponse.json({ error: "백테스트에 실패했습니다" }, { status: 500 });
  }
}
