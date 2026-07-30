import { NextResponse } from "next/server";
import { disclosureBacktest } from "@/lib/dart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date"); // YYYYMMDD — 특정 공시일만
  const days = Number(sp.get("days") || 6);
  try {
    return NextResponse.json(await disclosureBacktest(days, date));
  } catch (err) {
    console.error("[/api/backtest]", err);
    return NextResponse.json({ error: "백테스트에 실패했습니다" }, { status: 500 });
  }
}
