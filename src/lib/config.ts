// Quantitative windows used by the technical screener. Centralised here so the
// same numbers drive the computation (candles.ts), the screener, and the UI
// labels — no "최근" hand-waving: it's an explicit, adjustable trading-day count.

/** "최근" 거래량 윈도우 기본값 (거래일). 40 ≈ 약 2개월. 사용자가 조정 가능. */
export const RECENT_VOL_DAYS_DEFAULT = 40;
export const RECENT_VOL_DAYS_MIN = 5;
export const RECENT_VOL_DAYS_MAX = 120;

/** 신호일(폭증→급감→음봉) 탐지 스캔 윈도우 (거래일). */
export const SIGNAL_LOOKBACK_DAYS = 20;

/** 거래일 → 개월 환산(표시용 근사). 한 달 ≈ 20거래일. */
export const TRADING_DAYS_PER_MONTH = 20;

export function clampRecentDays(n: number): number {
  if (!Number.isFinite(n)) return RECENT_VOL_DAYS_DEFAULT;
  return Math.min(RECENT_VOL_DAYS_MAX, Math.max(RECENT_VOL_DAYS_MIN, Math.round(n)));
}

/** "약 2개월" / "약 2주" 같은 사람이 읽는 근사 문자열. */
export function approxMonths(days: number): string {
  if (days < TRADING_DAYS_PER_MONTH) {
    const weeks = Math.max(1, Math.round(days / 5)); // 5거래일 ≈ 1주
    return `약 ${weeks}주`;
  }
  const m = days / TRADING_DAYS_PER_MONTH;
  const rounded = Math.round(m * 2) / 2; // 0.5 단위
  return `약 ${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}개월`;
}
