import { NextResponse } from "next/server";
import { todayDisclosures } from "@/lib/dart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await todayDisclosures());
  } catch (err) {
    console.error("[/api/disclosures]", err);
    return NextResponse.json({ error: "공시를 불러오지 못했습니다" }, { status: 500 });
  }
}
