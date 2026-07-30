// ──────────────────────────────────────────────────────────────────────────
// 레이더 픽 기록 + 누적 채점 (자기검증 데이터 계층).
//   매일 감지된 재료·관련주를 저장 → 다음 거래일 실제 등락으로 채점.
//   "이 감지기가 진짜 먹히나"를 시간에 걸쳐 데이터로 축적. 로컬 파일.
// ──────────────────────────────────────────────────────────────────────────
import { promises as fs } from "fs";
import path from "path";
// 기록 입력 (내일 후보 파이프라인이 넘겨주는 최소 형태)
export interface PickInput {
  since: string;
  catalysts: { title: string; type: string; stocks: { name: string; code: string }[] }[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const PICKS_FILE = path.join(DATA_DIR, "radar-picks.jsonl");
const SCORE_FILE = path.join(DATA_DIR, "radar-scored.json");

const pad = (n: number) => String(n).padStart(2, "0");
const kstYmd = (ms: number) => {
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export interface PickStock {
  name: string;
  code: string;
}
export interface PickCatalyst {
  title: string;
  type: string;
  stocks: PickStock[];
}
export interface PickRecord {
  date: string; // 감지일(KST) YYYY-MM-DD
  predAt: string;
  catalysts: PickCatalyst[];
}

async function readPicks(): Promise<PickRecord[]> {
  try {
    const t = await fs.readFile(PICKS_FILE, "utf8");
    return t
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as PickRecord);
  } catch {
    return [];
  }
}

// 하루 1건 기록. 새로 기록하면 true.
export async function recordPicks(res: PickInput): Promise<boolean> {
  const date = kstYmd(Date.now());
  const picks = await readPicks();
  if (picks.some((p) => p.date === date)) return false;
  const catalysts = res.catalysts
    .map((c) => ({ title: c.title, type: c.type, stocks: c.stocks.map((s) => ({ name: s.name, code: s.code })) }))
    .filter((c) => c.stocks.length);
  if (!catalysts.length) return false;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(PICKS_FILE, JSON.stringify({ date, predAt: new Date().toISOString(), catalysts }) + "\n", "utf8");
  return true;
}

// ── 채점 ──────────────────────────────────────────────────────────────────
async function fetchDaily(code: string): Promise<{ date: string; open: number; close: number }[]> {
  const end = new Date(),
    start = new Date();
  start.setDate(start.getDate() - 30);
  const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" },
    );
    return JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), open: +(x[1] as number), close: +(x[4] as number) }))
      .filter((c: { close: number }) => c.close > 0)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export interface ScoredStock {
  name: string;
  code: string;
  type: string;
  changePct: number | null; // 전일 대비
  openBuyPct: number | null; // 시가매수→종가
}
interface ScoreCache {
  [date: string]: { scoredAt: string; sessionDate: string; stocks: ScoredStock[] };
}

async function readCache(): Promise<ScoreCache> {
  try {
    return JSON.parse(await fs.readFile(SCORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export interface RadarBoard {
  totalDays: number;
  scoredDays: number;
  pendingDays: number;
  upRateOpen: number | null; // 시가매수 기준 오른 비율
  avgOpen: number | null; // 시가매수→종가 평균
  avgChange: number | null; // 전일 대비 평균
  byType: { type: string; n: number; upRate: number; avgOpen: number }[];
  rows: {
    date: string;
    sessionDate: string;
    type: string;
    title: string;
    name: string;
    code: string;
    changePct: number | null;
    openBuyPct: number | null;
  }[];
}

export async function getRadarBoard(): Promise<RadarBoard> {
  const picks = await readPicks();
  const cache = await readCache();
  let pending = 0;

  for (const p of picks) {
    if (cache[p.date]) continue;
    const pymd = p.date.replace(/-/g, "");
    const codes = [...new Set(p.catalysts.flatMap((c) => c.stocks.map((s) => s.code)))];
    const px: Record<string, { date: string; open: number; close: number }[]> = {};
    await Promise.all(codes.map(async (c) => (px[c] = await fetchDaily(c))));

    const move = (code: string) => {
      const rows = px[code];
      if (!rows) return null;
      let idx = -1;
      for (let i = 0; i < rows.length; i++)
        if (rows[i].date > pymd) {
          idx = i;
          break;
        }
      if (idx < 1) return null;
      return {
        sessionDate: rows[idx].date,
        changePct: (rows[idx].close / rows[idx - 1].close - 1) * 100,
        openBuyPct: (rows[idx].close / rows[idx].open - 1) * 100,
      };
    };

    const stocks: ScoredStock[] = [];
    let sessionDate = "";
    for (const c of p.catalysts)
      for (const s of c.stocks) {
        const m = move(s.code);
        if (m) sessionDate = m.sessionDate;
        stocks.push({
          name: s.name,
          code: s.code,
          type: c.type,
          changePct: m?.changePct ?? null,
          openBuyPct: m?.openBuyPct ?? null,
        });
      }
    if (stocks.some((s) => s.openBuyPct != null))
      cache[p.date] = { scoredAt: new Date().toISOString(), sessionDate, stocks };
    else pending++;
  }
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(SCORE_FILE, JSON.stringify(cache, null, 2), "utf8").catch(() => {});

  // 집계 (제목은 픽 기록에서 매칭)
  const titleOf = new Map<string, string>();
  for (const p of picks) for (const c of p.catalysts) for (const s of c.stocks) titleOf.set(`${p.date}|${s.code}`, c.title);

  const dates = Object.keys(cache).sort().reverse();
  const rows: RadarBoard["rows"] = [];
  for (const d of dates) {
    const c = cache[d];
    for (const s of c.stocks)
      rows.push({
        date: d,
        sessionDate: c.sessionDate,
        type: s.type,
        title: titleOf.get(`${d}|${s.code}`) ?? "",
        name: s.name,
        code: s.code,
        changePct: s.changePct,
        openBuyPct: s.openBuyPct,
      });
  }

  const scored = rows.filter((r) => r.openBuyPct != null);
  const opens = scored.map((r) => r.openBuyPct as number);
  const changes = scored.map((r) => r.changePct).filter((x): x is number => x != null);

  const typeMap = new Map<string, number[]>();
  for (const r of scored) {
    if (!typeMap.has(r.type)) typeMap.set(r.type, []);
    typeMap.get(r.type)!.push(r.openBuyPct as number);
  }
  const byType = [...typeMap.entries()]
    .map(([type, xs]) => ({
      type,
      n: xs.length,
      upRate: (xs.filter((x) => x > 0).length / xs.length) * 100,
      avgOpen: mean(xs) ?? 0,
    }))
    .sort((a, b) => b.avgOpen - a.avgOpen);

  return {
    totalDays: picks.length,
    scoredDays: Object.keys(cache).length,
    pendingDays: pending,
    upRateOpen: opens.length ? (opens.filter((x) => x > 0).length / opens.length) * 100 : null,
    avgOpen: mean(opens),
    avgChange: mean(changes),
    byType,
    rows,
  };
}
