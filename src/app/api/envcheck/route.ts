import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 진단 전용: 환경변수가 배포에 들어갔는지만 확인 (값은 노출하지 않음)
export async function GET() {
  const keys = ["GROQ_API_KEY", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "DART_API_KEY"];
  const status: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    status[k] = !v
      ? "❌ 없음"
      : /^["']|["']$/.test(v)
        ? `⚠️ 따옴표 포함 (len ${v.length})`
        : v !== v.trim()
          ? `⚠️ 공백 포함 (len ${v.length})`
          : `✅ 있음 (len ${v.length})`;
  }
  // 실제 호출도 한 번 해봐서 키가 유효한지 확인
  let naver = "미확인";
  try {
    const r = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent("테스트")}&display=1`,
      {
        headers: {
          "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID || "",
          "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET || "",
        },
        cache: "no-store",
      },
    );
    const j = await r.json();
    naver = j.items ? `✅ 정상 (${j.items.length}건)` : `❌ ${r.status} ${j.errorCode ?? ""} ${j.errorMessage ?? ""}`;
  } catch (e) {
    naver = `❌ ${e instanceof Error ? e.message : String(e)}`;
  }
  let dart = "미확인";
  try {
    const r = await fetch(
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${process.env.DART_API_KEY || ""}&bgn_de=20260730&end_de=20260730&page_count=1`,
      { cache: "no-store" },
    );
    const j = await r.json();
    dart = j.status === "000" ? `✅ 정상 (${j.total_count}건)` : `❌ ${j.status} ${j.message ?? ""}`;
  } catch (e) {
    dart = `❌ ${e instanceof Error ? e.message : String(e)}`;
  }
  return NextResponse.json({ env: status, naverApi: naver, dartApi: dart });
}
