import { NextResponse } from "next/server";
import { scanGameCatalyst, scanBioCatalyst } from "@/lib/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const rule = new URL(req.url).searchParams.get("rule");
  try {
    if (rule === "game") return NextResponse.json(await scanGameCatalyst());
    if (rule === "bio") return NextResponse.json(await scanBioCatalyst());
    return NextResponse.json({ error: "rule 파라미터가 필요합니다 (game|bio)" }, { status: 400 });
  } catch (err) {
    console.error("[/api/scanner]", err);
    return NextResponse.json({ error: "스캔에 실패했습니다" }, { status: 500 });
  }
}
