// ──────────────────────────────────────────────────────────────────────────
// 예측 기록 + 성과 채점 (자기개선 루프의 데이터 계층).
//   1) recordPrediction: 매일 이슈+관련주 예측을 data/predictions.jsonl에 1건 기록
//   2) getScoreboard: 며칠 지난 예측을 네이버 실제 종가로 채점(T+1~T+5 수익률·적중률)
// 데이터는 로컬에 forward-accumulate. 채점 결과는 data/scored.json에 캐시.
// ──────────────────────────────────────────────────────────────────────────
import { promises as fs } from "fs";
import path from "path";
import type { DailyIssuesResult } from "./issues";

const DATA_DIR = path.join(process.cwd(), "data");
const PRED_FILE = path.join(DATA_DIR, "predictions.jsonl");
const SCORE_FILE = path.join(DATA_DIR, "scored.json");

export const HORIZONS = [1, 2, 3, 5] as const; // 거래일

export interface PredStock {
  code: string;
  name: string;
}
export interface PredIssue {
  title: string;
  why: string;
  themeName: string;
  themeChg: number | null;
  stocks: PredStock[];
}
export interface PredRecord {
  date: string; // 예측 생성일(KST) YYYYMMDD
  baselineDate: string; // 수익률 기준일(직전 마감) YYYYMMDD
  predAt: string; // ISO timestamp
  issues: PredIssue[];
}

async function readPredictions(): Promise<PredRecord[]> {
  try {
    const txt = await fs.readFile(PRED_FILE, "utf8");
    return txt
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as PredRecord);
  } catch {
    return [];
  }
}

// 하루 1건만 기록 — 같은 date가 이미 있으면 skip(웹 새로고침 중복 방지).
// 새로 기록했으면 true, 이미 오늘 것이 있어 skip했으면 false.
export async function recordPrediction(res: DailyIssuesResult): Promise<boolean> {
  const preds = await readPredictions();
  if (preds.some((p) => p.date === res.date)) return false;
  const rec: PredRecord = {
    date: res.date,
    baselineDate: res.baselineDate,
    predAt: new Date().toISOString(),
    issues: res.issues.map((i) => ({
      title: i.title,
      why: i.why,
      themeName: i.themeName,
      themeChg: i.themeChg,
      stocks: i.stocks.map((s) => ({ code: s.code, name: s.name })),
    })),
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(PRED_FILE, JSON.stringify(rec) + "\n", "utf8");
  return true;
}

// ── 채점 ──────────────────────────────────────────────────────────────────

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;

// 네이버 일봉 종가 (오래된→최신 정렬).
async function fetchDaily(code: string): Promise<{ date: string; close: number }[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 400 * 864e5);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" },
    );
    const rows = JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"));
    return rows
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), close: +(x[4] as number) }))
      .filter((x: { close: number }) => x.close > 0)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// 기준일 종가 → +h거래일 종가 수익률. 아직 거래일이 안 지났으면 null.
function returnsFrom(
  candles: { date: string; close: number }[],
  baselineDate: string,
): Record<number, number | null> {
  let bi = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].date <= baselineDate) bi = i;
    else break;
  }
  const out: Record<number, number | null> = {};
  if (bi < 0) {
    for (const h of HORIZONS) out[h] = null;
    return out;
  }
  const base = candles[bi].close;
  for (const h of HORIZONS) {
    const j = bi + h;
    out[h] = j < candles.length ? candles[j].close / base - 1 : null;
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface ScoredIssue {
  date: string;
  title: string;
  themeName: string;
  nStocks: number;
  ret: Record<number, number | null>; // 관련주 평균 수익률(거래일별)
  hit: boolean | null; // T+1 평균 > 0
}

interface ScoreCache {
  [date: string]: { scoredAt: string; issues: ScoredIssue[] };
}

async function readScoreCache(): Promise<ScoreCache> {
  try {
    return JSON.parse(await fs.readFile(SCORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export interface Scoreboard {
  totalPredictions: number;
  scoredPredictions: number;
  pendingPredictions: number; // 아직 T+1 안 지나 채점 대기
  scoredIssues: number;
  hitRate: number | null; // 적중(T+1>0) 이슈 비율
  avgRet: Record<number, number | null>; // 전체 평균 수익률(거래일별)
  byTheme: { theme: string; n: number; avgRet1: number; hitRate: number }[];
  best: ScoredIssue[];
  worst: ScoredIssue[];
  rows: ScoredIssue[]; // 최신순 전체
}

export async function getScoreboard(): Promise<Scoreboard> {
  const preds = await readPredictions();
  const cache = await readScoreCache();
  let pending = 0;

  // 미채점 예측을 채점 시도 → T+1이 잡히면 캐시.
  for (const p of preds) {
    if (cache[p.date]) continue;
    const scored: ScoredIssue[] = [];
    let ready = true;
    for (const iss of p.issues) {
      const perStock: Record<number, number[]> = {};
      for (const h of HORIZONS) perStock[h] = [];
      for (const s of iss.stocks) {
        const rets = returnsFrom(await fetchDaily(s.code), p.baselineDate);
        for (const h of HORIZONS) if (rets[h] != null) perStock[h].push(rets[h] as number);
      }
      const ret: Record<number, number | null> = {};
      for (const h of HORIZONS) ret[h] = perStock[h].length ? avg(perStock[h]) : null;
      if (ret[1] == null) ready = false; // T+1 미도래
      scored.push({
        date: p.date,
        title: iss.title,
        themeName: iss.themeName,
        nStocks: iss.stocks.length,
        ret,
        hit: ret[1] == null ? null : (ret[1] as number) > 0,
      });
    }
    if (ready) cache[p.date] = { scoredAt: new Date().toISOString(), issues: scored };
    else pending++;
  }
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(SCORE_FILE, JSON.stringify(cache, null, 2), "utf8").catch(() => {});

  // 집계
  const allIssues: ScoredIssue[] = Object.values(cache)
    .flatMap((c) => c.issues)
    .sort((a, b) => b.date.localeCompare(a.date));
  const hits = allIssues.filter((i) => i.hit != null);
  const avgRet: Record<number, number | null> = {};
  for (const h of HORIZONS) {
    const xs = allIssues.map((i) => i.ret[h]).filter((x): x is number => x != null);
    avgRet[h] = xs.length ? avg(xs) : null;
  }

  const themeMap = new Map<string, ScoredIssue[]>();
  for (const i of hits) {
    if (!themeMap.has(i.themeName)) themeMap.set(i.themeName, []);
    themeMap.get(i.themeName)!.push(i);
  }
  const byTheme = [...themeMap.entries()]
    .map(([theme, xs]) => ({
      theme,
      n: xs.length,
      avgRet1: avg(xs.map((i) => i.ret[1] as number)),
      hitRate: xs.filter((i) => i.hit).length / xs.length,
    }))
    .sort((a, b) => b.avgRet1 - a.avgRet1);

  const ranked = [...hits].sort((a, b) => (b.ret[1] as number) - (a.ret[1] as number));

  return {
    totalPredictions: preds.length,
    scoredPredictions: Object.keys(cache).length,
    pendingPredictions: pending,
    scoredIssues: hits.length,
    hitRate: hits.length ? hits.filter((i) => i.hit).length / hits.length : null,
    avgRet,
    byTheme,
    best: ranked.slice(0, 3),
    worst: ranked.slice(-3).reverse(),
    rows: allIssues,
  };
}
