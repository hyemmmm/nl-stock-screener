import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { buildTomorrow, type TomorrowResult } from "@/lib/tomorrow";
import { recordPicks } from "@/lib/radarLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 뉴스+공시+반복성 종합 파이프라인

const DIR = path.join(process.cwd(), "data", "tomorrow");
const p2 = (n: number) => String(n).padStart(2, "0");
const kstDate = () => {
  const d = new Date(Date.now() + 9 * 3600e3);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};

// 후보는 하루 한 번만 생성해 고정한다(새로고침마다 바뀌지 않도록 + AI 토큰 절약).
// 다시 뽑고 싶으면 ?refresh=1
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const file = path.join(DIR, `${kstDate()}.json`);

  if (!refresh) {
    try {
      const cached = JSON.parse(await fs.readFile(file, "utf8")) as TomorrowResult;
      return NextResponse.json({ ...cached, cached: true });
    } catch {
      // 캐시 없음 → 아래에서 생성
    }
  }

  try {
    const result = await buildTomorrow();
    // 저장(후보가 있을 때만 — 실패한 빈 결과로 하루치를 덮지 않도록)
    if (result.candidates.length || result.discFeed.length || result.newsFeed.length) {
      await fs.mkdir(DIR, { recursive: true }).catch(() => {});
      await fs.writeFile(file, JSON.stringify(result), "utf8").catch(() => {});
    }
    // 후보를 픽으로 저장(하루 1건) → /score에서 다음날 채점
    await recordPicks({
      since: result.since,
      catalysts: result.candidates.map((c) => ({
        title: c.title,
        type: c.type,
        stocks: c.stocks.map((s) => ({ name: s.name, code: s.code })),
      })),
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/tomorrow]", err);
    return NextResponse.json({ error: "후보 생성에 실패했습니다" }, { status: 500 });
  }
}
