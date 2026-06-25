import { NextResponse } from "next/server";
import { getCandles } from "@/lib/kis";
import { SNAPSHOT } from "@/data/snapshot";
import type { ChartResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "valid 6-digit code required" }, { status: 400 });
  }

  try {
    const { candles, source } = await getCandles(code);
    const name = SNAPSHOT.find((s) => s.code === code)?.name ?? code;
    const payload: ChartResponse = { code, name, candles, source };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/chart]", err);
    return NextResponse.json({ error: "Chart fetch failed" }, { status: 500 });
  }
}
