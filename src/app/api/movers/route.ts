import { NextResponse } from "next/server";
import {
  getMovers,
  saveMoversSnapshot,
  listSnapshotDates,
  readMoversSnapshot,
  kstDate,
} from "@/lib/movers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 순위 4장 + 종목별 뉴스 병렬 수집

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    const today = kstDate();

    // 과거 날짜 → 저장된 스냅샷 조회(라이브 X)
    if (date && date !== today) {
      const snap = await readMoversSnapshot(date);
      const dates = await listSnapshotDates();
      if (!snap) {
        return NextResponse.json({ date, movers: [], dates, saved: true, missing: true });
      }
      return NextResponse.json({ ...snap, dates, saved: true });
    }

    // 오늘 → 라이브 수집 + 저장
    const result = await getMovers();
    // 빈 결과(네이버 일시 차단 등)로 좋은 스냅샷을 덮어쓰지 않음
    if (result.movers.length > 0) await saveMoversSnapshot(result).catch(() => {});
    const dates = await listSnapshotDates();
    if (!dates.includes(result.date)) dates.unshift(result.date); // 저장 실패 시에도 오늘은 노출
    return NextResponse.json({ ...result, dates, saved: false });
  } catch (err) {
    console.error("[/api/movers]", err);
    return NextResponse.json({ error: "특징주를 불러오지 못했습니다" }, { status: 500 });
  }
}
