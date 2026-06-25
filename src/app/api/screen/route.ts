import { NextResponse } from "next/server";
import { parseQuery } from "@/lib/parse";
import { screen } from "@/lib/screener";
import type { ScreenResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let query = "";
  try {
    const body = (await req.json()) as { query?: string };
    query = (body.query ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const { filter, source } = await parseQuery(query);
    const results = screen(filter);
    const payload: ScreenResponse = {
      filter,
      results,
      source,
      count: results.length,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/screen]", err);
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }
}
