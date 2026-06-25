import { NextResponse } from "next/server";
import { parseQuery } from "@/lib/parse";
import { screen } from "@/lib/screener";
import { RECENT_VOL_DAYS_DEFAULT, clampRecentDays } from "@/lib/config";
import type { ScreenResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let query = "";
  let recentDays = RECENT_VOL_DAYS_DEFAULT;
  try {
    const body = (await req.json()) as { query?: string; recentDays?: number };
    query = (body.query ?? "").trim();
    if (body.recentDays != null) recentDays = clampRecentDays(Number(body.recentDays));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const { filter, source } = await parseQuery(query);
    const results = screen(filter, recentDays);
    const payload: ScreenResponse = {
      filter,
      results,
      source,
      count: results.length,
      recentDays,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/screen]", err);
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }
}
