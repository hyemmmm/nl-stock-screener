import { NextResponse } from "next/server";
import { searchStock } from "@/lib/catalyst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await searchStock(q) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
