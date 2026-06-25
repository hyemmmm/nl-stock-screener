import type { Candle } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// 지지/저항(S/R) 자동 탐지.
//
// 1) 스윙 고점·저점(pivot)을 찾고  2) 가까운 가격끼리 한 레벨로 묶고
// 3) 묶인 횟수(=터치 수)로 강도를 매긴 뒤  4) 현재가 기준 위는 저항,
//    아래는 지지로 분류해 가까운 순으로 1차·2차…를 매긴다.
// ──────────────────────────────────────────────────────────────────────────

export interface Level {
  price: number;
  touches: number; // 그 가격대에 닿은 횟수(강도)
  kind: "support" | "resistance";
  rank: number; // 1 = 현재가에서 가장 가까운(1차)
}

interface Opts {
  lookback?: number; // 최근 몇 봉을 볼지
  pivotL?: number; // 스윙 판정 좌우 폭
  tolPct?: number; // 같은 레벨로 묶는 가격 허용오차 %
  minTouch?: number; // 유의미한 레벨 최소 터치 수
  maxEach?: number; // 지지/저항 각 최대 개수
}

export function detectLevels(candles: Candle[], opts: Opts = {}): Level[] {
  const { lookback = 140, pivotL = 4, tolPct = 1.5, minTouch = 2, maxEach = 3 } = opts;
  if (candles.length < pivotL * 2 + 2) return [];

  const data = candles.slice(-lookback);
  const n = data.length;

  // 1) 스윙 고점/저점 수집
  const pivots: number[] = [];
  for (let i = pivotL; i < n - pivotL; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = i - pivotL; k <= i + pivotL; k++) {
      if (data[k].high > data[i].high) isHigh = false;
      if (data[k].low < data[i].low) isLow = false;
    }
    if (isHigh) pivots.push(data[i].high);
    if (isLow) pivots.push(data[i].low);
  }
  if (pivots.length === 0) return [];

  // 2) 가까운 가격끼리 클러스터링
  pivots.sort((a, b) => a - b);
  const clusters: { price: number; sum: number; count: number }[] = [];
  for (const p of pivots) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.price) / last.price <= tolPct / 100) {
      last.sum += p;
      last.count++;
      last.price = last.sum / last.count;
    } else {
      clusters.push({ price: p, sum: p, count: 1 });
    }
  }

  // 3) 현재가 기준 분류 + 가까운 순 랭킹
  const current = candles[candles.length - 1].close;
  const sig = clusters.filter((c) => c.count >= minTouch);

  const supports = sig
    .filter((c) => c.price < current * 0.999)
    .sort((a, b) => b.price - a.price) // 현재가에 가까운(높은) 지지부터
    .slice(0, maxEach);
  const resistances = sig
    .filter((c) => c.price > current * 1.001)
    .sort((a, b) => a.price - b.price) // 현재가에 가까운(낮은) 저항부터
    .slice(0, maxEach);

  const out: Level[] = [];
  supports.forEach((c, i) =>
    out.push({ price: Math.round(c.price), touches: c.count, kind: "support", rank: i + 1 }),
  );
  resistances.forEach((c, i) =>
    out.push({ price: Math.round(c.price), touches: c.count, kind: "resistance", rank: i + 1 }),
  );
  return out;
}
