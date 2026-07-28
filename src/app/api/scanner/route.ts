import { NextResponse } from "next/server";
import { scanGameCatalyst, scanBioCatalyst } from "@/lib/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // 구글뉴스 레이트리밋 회피 위해 순차 실행
    const game = await scanGameCatalyst();
    const bio = await scanBioCatalyst();
    return NextResponse.json({ game, bio });
  } catch (err) {
    console.error("[/api/scanner]", err);
    return NextResponse.json({ error: "스캔에 실패했습니다" }, { status: 500 });
  }
}
