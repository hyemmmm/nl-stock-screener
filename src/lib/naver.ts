import type { Candle } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// 네이버 금융의 공개 일봉 엔드포인트 (무료, 키 불필요) — 서버에서만 호출.
// KIS 키가 없어도 "진짜 차트"를 보여주기 위한 데이터 소스.
// ──────────────────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export async function fetchNaverDaily(code: string): Promise<Candle[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400); // ≈ 최근 250 거래일

  const url =
    `https://api.finance.naver.com/siseJson.naver?symbol=${code}` +
    `&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;

  const res = await fetch(url, {
    headers: { referer: "https://finance.naver.com/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Naver ${res.status}`);

  const text = await res.text();
  // 응답이 작은따옴표 섞인 유사 JSON → 정규화 후 파싱
  const rows = JSON.parse(text.replace(/'/g, '"').replace(/,\s*\]/g, "]")) as unknown[][];

  return rows
    .slice(1) // 헤더 제거
    .map((r) => {
      const d = String(r[0]);
      return {
        time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      };
    })
    .filter((d) => Number.isFinite(d.close) && d.close > 0);
}
