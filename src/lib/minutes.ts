// ──────────────────────────────────────────────────────────────────────────
// 분봉 조회 (네이버) — +3% 익절과 -5% 손절 중 무엇이 먼저 왔는지 판정용.
//   네이버는 최근 약 5거래일치 분봉만 제공한다. 그보다 오래된 날은 판정
//   불가이며, 이 경우 전략 시뮬레이터가 '익절 먼저'로 가정하고 표시한다.
// ──────────────────────────────────────────────────────────────────────────

const H = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

export interface Minute {
  t: string; // YYYYMMDDHHmm
  p: number; // 체결가(분봉 종가)
}

// 종목의 최근 분봉을 날짜별로. { "20260730": [{t,p}, ...(오름차순)] }
export async function fetchMinutesByDate(code: string): Promise<Record<string, Minute[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 864e5);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=minute`,
      H,
    );
    const rows = JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]")).slice(1);
    const out: Record<string, Minute[]> = {};
    for (const x of rows as unknown[][]) {
      const t = String(x[0]);
      const p = +(x[4] as number);
      if (!t || !(p > 0)) continue;
      const d = t.slice(0, 8);
      (out[d] = out[d] || []).push({ t, p });
    }
    for (const d of Object.keys(out)) out[d].sort((a, b) => a.t.localeCompare(b.t));
    return out;
  } catch {
    return {};
  }
}
