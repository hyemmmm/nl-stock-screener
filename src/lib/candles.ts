import type { Candle } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// Deterministic candle generation + technical-pattern injection.
//
// Both the per-stock chart (kis.ts mock fallback) and the universe screener
// (universe.ts) build candles from here, so a stock's chart and its computed
// technical metrics always agree.
//
// In production these candles would come from KIS daily history; here we
// synthesise a stable random walk and overlay recognisable patterns on a
// deterministic subset so the technical screener returns real matches in demo.
// ──────────────────────────────────────────────────────────────────────────

function hash(code: string): number {
  return Array.from(code).reduce((a, c) => a + c.charCodeAt(0), 0);
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Which demo pattern a stock exhibits in its last few bars (deterministic). */
export type PatternKind =
  | "surge-drop-bearish" // 거래량 폭증 → 급감 + 음봉 + 5일선 근접  (flagship)
  | "sustained-surge" // 거래량 지속 폭증 + 양봉 급등
  | "near-ma" // 5일선 근접 + 양봉
  | "natural"; // 패턴 없음

export function patternFor(code: string): PatternKind {
  switch (hash(code) % 4) {
    case 0:
      return "surge-drop-bearish";
    case 1:
      return "sustained-surge";
    case 2:
      return "near-ma";
    default:
      return "natural";
  }
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Mean close of the bars at [from, to) — used as the 5-day MA anchor. */
function meanClose(candles: Candle[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += candles[i].close;
  return sum / (to - from);
}

/**
 * Overlay a pattern onto the last 3 bars so the technical screener can detect it.
 * Mutates `candles` in place. `rnd` keeps the shape deterministic per stock.
 */
function injectPattern(candles: Candle[], kind: PatternKind, rnd: () => number) {
  const n = candles.length;
  if (n < 6 || kind === "natural") return;

  const d0 = candles[n - 1]; // today
  const d1 = candles[n - 2]; // yesterday (the surge day)
  const d2 = candles[n - 3]; // day before

  if (kind === "surge-drop-bearish") {
    const baseVol = 200_000 + Math.round(rnd() * 200_000);
    d2.volume = baseVol;
    d1.volume = Math.round(baseVol * (6 + rnd() * 5)); // +500~1000%
    d0.volume = Math.round(d1.volume * (0.08 + rnd() * 0.14)); // drop to 8~22%

    // close near the 5-day MA, and make today a bearish (down) candle
    const anchor = meanClose(candles, n - 5, n - 1);
    const close = Math.round(anchor * (1 + (rnd() - 0.5) * 0.02));
    d0.close = close;
    d0.open = Math.round(close * (1 + 0.015 + rnd() * 0.02)); // open > close → 음봉
    d0.high = Math.round(Math.max(d0.open, close) * (1 + rnd() * 0.01));
    d0.low = Math.round(Math.min(d0.open, close) * (1 - rnd() * 0.01));
  } else if (kind === "sustained-surge") {
    const baseVol = 300_000 + Math.round(rnd() * 300_000);
    d2.volume = baseVol;
    d1.volume = Math.round(baseVol * (5 + rnd() * 4));
    d0.volume = Math.round(d1.volume * (1 + rnd() * 0.3)); // stays high
    const open = d0.open;
    d0.close = Math.round(open * (1.04 + rnd() * 0.05)); // bullish 급등 +4~9%
    d0.high = Math.round(d0.close * (1 + rnd() * 0.01));
    d0.low = Math.round(open * (1 - rnd() * 0.01));
  } else if (kind === "near-ma") {
    const anchor = meanClose(candles, n - 5, n - 1);
    const close = Math.round(anchor * (1 + (rnd() - 0.5) * 0.015));
    d0.close = close;
    d0.open = Math.round(close * (1 - rnd() * 0.01)); // mild 양봉
    d0.high = Math.round(close * (1 + rnd() * 0.01));
    d0.low = Math.round(d0.open * (1 - rnd() * 0.01));
  }
}

/**
 * Build ~120 calendar days (weekdays only) of deterministic candles for a code,
 * anchored so the last close ≈ basePrice, with its pattern overlaid.
 */
export function generateCandles(code: string, basePrice: number): Candle[] {
  const rnd = seededRandom(hash(code) + basePrice);
  const days = 120;

  // backward random walk so the most recent bar ≈ basePrice
  let price = basePrice;
  const series: number[] = [];
  for (let i = 0; i < days; i++) {
    series.push(price);
    const drift = (rnd() - 0.48) * 0.03;
    price = price / (1 + drift);
  }
  series.reverse();

  const today = new Date();
  const candles: Candle[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const close = Math.round(series[i]);
    const open = Math.round(close * (1 + (rnd() - 0.5) * 0.02));
    const high = Math.round(Math.max(open, close) * (1 + rnd() * 0.015));
    const low = Math.round(Math.min(open, close) * (1 - rnd() * 0.015));
    const volume = Math.round(100_000 + rnd() * 2_000_000);
    candles.push({ time: fmtDate(d), open, high, low, close, volume });
  }

  injectPattern(candles, patternFor(code), rnd);
  return candles;
}

// ── Technical metrics derived from a candle series ─────────────────────────

export interface TechMetrics {
  ma5: number; // 5일 이동평균 (종가)
  gap5MA: number; // 5일선 이격도 % (부호)
  gap5MAAbs: number; // |이격도| %
  volSurgeRatio: number; // 전일 거래량 / 전전일 거래량 × 100
  volDropRatio: number; // 당일 거래량 / 전일 거래량 × 100
  bearish: boolean; // 당일 음봉 여부
  lastClose: number;
  lastChangePct: number; // 당일 종가 등락률 %
  lastVolume: number;
  tradingValue: number; // 거래대금 (억) = 종가 × 거래량 / 1e8
}

export function computeTech(candles: Candle[]): TechMetrics {
  const n = candles.length;
  const d0 = candles[n - 1];
  const d1 = candles[n - 2];
  const d2 = candles[n - 3];

  const ma5 = meanClose(candles, n - 5, n);
  const gap5MA = ((d0.close - ma5) / ma5) * 100;
  const volSurgeRatio = d2.volume > 0 ? (d1.volume / d2.volume) * 100 : 0;
  const volDropRatio = d1.volume > 0 ? (d0.volume / d1.volume) * 100 : 0;
  const lastChangePct = d1.close > 0 ? ((d0.close - d1.close) / d1.close) * 100 : 0;

  return {
    ma5: Math.round(ma5),
    gap5MA,
    gap5MAAbs: Math.abs(gap5MA),
    volSurgeRatio,
    volDropRatio,
    bearish: d0.close < d0.open,
    lastClose: d0.close,
    lastChangePct,
    lastVolume: d0.volume,
    tradingValue: (d0.close * d0.volume) / 1e8,
  };
}
