// ────────────────────────────────────────────────────────────────────────
//  한국 주식 "법칙" 백테스터 — 실데이터, API 키 불필요.
//
//  KRX 전종목 리스트 + 네이버 금융 일봉(둘 다 무료/무키)으로,
//  "법칙이 발생한 날"마다 다음날(+1)/+5일 수익률을 집계해
//  승률·평균수익·표본수(n)를 내고, 무작위 진입(baseline)과 비교한다.
//
//  실행:  node scripts/backtest.mjs
//  법칙/표본수/기간은 아래 CONFIG·RULES에서 바로 수정.
// ────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CONFIG = {
  startDate: "20220101",
  endDate: "20260625",
  holdDays: [1, 3, 5, 10], // 신호 +N일 수익률
  bounceWindow: 3, // "N일 내에 오른다" 검증 윈도우
  sampleStocks: 600, // 표본 종목 수 (↑ 클수록 표본↑). 캐시되면 재실험은 즉시.
  recentVolWindow: 10, // "최근 며칠 내 천만" — 스윕 결과 10거래일(약 2주)이 최적
  reqDelayMs: 120,
  cacheFile: "scripts/.bt-cache.json", // 종목별 일봉 캐시 (gitignore됨)
};

// 무조건 포함할 유동성 대형주 (저번호 우량주가 표본에서 빠지지 않게)
const CORE = [
  "005930", "000660", "005380", "000270", "035420", "035720", "051910",
  "006400", "005490", "105560", "055550", "086790", "015760", "066570",
  "012330", "028260", "010130", "009150", "011200", "259960", "068270",
  "207940", "373220", "323410", "024110", "316140", "096770", "247540",
  "086520", "091990", "196170", "277810", "112040", "293490", "041510",
];

// ── 법칙 정의 ──────────────────────────────────────────────────────────────
// c[i] = { date, open, high, low, close, volume }
const ma = (c, i, n) => {
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += c[k].close;
  return s / n;
};
const surge = (c, i) => (c[i - 2].volume > 0 ? (c[i - 1].volume / c[i - 2].volume) * 100 : 0);
const drop = (c, i) => (c[i - 1].volume > 0 ? (c[i].volume / c[i - 1].volume) * 100 : 0);
const gap5 = (c, i) => {
  const m = ma(c, i, 5);
  return m > 0 ? Math.abs((c[i].close - m) / m) * 100 : 999;
};
const bearish = (c, i) => c[i].close < c[i].open;
const maxVolPrev = (c, i, n) => {
  let m = 0;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) if (c[k].volume > m) m = c[k].volume;
  return m;
};
const has10M = (c, i) => maxVolPrev(c, i, CONFIG.recentVolWindow) >= 10_000_000;
const lowN = (c, i, n) => {
  let m = Infinity;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) if (c[k].low < m) m = c[k].low;
  return m;
};
const highN = (c, i, n) => {
  let m = 0;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) if (c[k].high > m) m = c[k].high;
  return m;
};
// 0=바닥, 1=천장 — 최근 n일 범위에서 현재 종가의 위치
const rangePos = (c, i, n) => {
  const lo = lowN(c, i, n), hi = highN(c, i, n);
  return hi > lo ? (c[i].close - lo) / (hi - lo) : 0.5;
};
const bottomZone = (c, i) => i >= 120 && rangePos(c, i, 120) <= 0.3; // 바닥권(6개월 하위30%)
const notShortHigh = (c, i) => c[i].close <= highN(c, i, 20) * 0.95; // 20일 고점 대비 5%+ 아래
const aboveMA20 = (c, i) => i >= 20 && c[i].close >= ma(c, i, 20) * 0.97; // 20일선 위/근처
const ma5TurnUp = (c, i) => i >= 9 && ma(c, i, 5) >= ma(c, i - 3, 5); // 5일선 상승전환

const baseRule = (c, i) =>
  i >= 5 && has10M(c, i) && surge(c, i) >= 500 && drop(c, i) <= 25 && bearish(c, i) && gap5(c, i) <= 3;

// 바닥확인 패턴용
const newLowN = (c, i, n) => i >= n && c[i].low <= lowN(c, i - 1, n); // 직전 n일 최저가 하향돌파(신저가)
const drop5 = (c, i) => i >= 1 && c[i - 1].close > 0 && (c[i].close - c[i - 1].close) / c[i - 1].close <= -0.05;
const volUp = (c, i) => i >= 1 && c[i].volume > c[i - 1].volume; // 거래량 증가
// 최근 win거래일 내 하루 thr% 이상 급등이 있었나
const surgeDayRecent = (c, i, win, thr) => {
  for (let k = Math.max(1, i - win); k <= i; k++)
    if (c[k - 1].close > 0 && (c[k].close - c[k - 1].close) / c[k - 1].close >= thr) return true;
  return false;
};
// 어제는 45일선 위 → 오늘 처음 45일선에 닿음(저가가 닿고 종가는 근처)
const firstTouch45 = (c, i) => {
  const m = ma(c, i, 45);
  return c[i - 1].close > ma(c, i - 1, 45) && c[i].low <= m && c[i].close >= m * 0.97;
};
// fast일선이 slow일선을 오늘 상향돌파(골든크로스)
const gc = (c, i, fast, slow) =>
  i >= slow && ma(c, i, fast) > ma(c, i, slow) && ma(c, i - 1, fast) <= ma(c, i - 1, slow);

// 변형: 최근 1~4일 전 폭증일(s) 이후 오늘까지 거래량이 연속(≥2일) 감소했나
const surgeThenDecline = (c, i) => {
  for (let s = i - 1; s >= i - 4 && s >= 2; s--) {
    if (surge(c, s) < 500) continue; // s일이 전일대비 500%+ 폭증
    if (i - s < 2) continue; // 폭증 후 최소 2일 감소
    let dec = true;
    for (let k = s + 1; k <= i; k++) if (c[k].volume >= c[k - 1].volume) { dec = false; break; }
    if (dec) return true;
  }
  return false;
};

const RULES = {
  "R0 기본 (폭증→급감+음봉+5일선)": (c, i) => baseRule(c, i),
  "R1 +바닥권": (c, i) => baseRule(c, i) && bottomZone(c, i),
  "R2 +바닥권+단기고점아님": (c, i) => baseRule(c, i) && bottomZone(c, i) && notShortHigh(c, i),
  "R3a +위+역추세아님(20일선위)": (c, i) =>
    baseRule(c, i) && bottomZone(c, i) && notShortHigh(c, i) && aboveMA20(c, i),
  "R3b +위+5일선 상승전환": (c, i) =>
    baseRule(c, i) && bottomZone(c, i) && notShortHigh(c, i) && ma5TurnUp(c, i),
  "R4 연속감소 + 5일선이격(3~15%)": (c, i) =>
    i >= 8 && has10M(c, i) && surgeThenDecline(c, i) && gap5(c, i) >= 3 && gap5(c, i) <= 15,
  "R4b 연속감소 + 5일선닿음(≤3%)": (c, i) =>
    i >= 8 && has10M(c, i) && surgeThenDecline(c, i) && gap5(c, i) <= 3,
  "R4c 연속감소 (5일선 무관)": (c, i) =>
    i >= 8 && has10M(c, i) && surgeThenDecline(c, i),
  "N1 바닥확인(20일신저가+거래량증가+-5%)": (c, i) =>
    i >= 20 && has10M(c, i) && newLowN(c, i, 20) && volUp(c, i) && drop5(c, i),
  "N1b 바닥확인(60일신저가)": (c, i) =>
    i >= 60 && has10M(c, i) && newLowN(c, i, 60) && volUp(c, i) && drop5(c, i),
  "N1c -5%급락+거래량증가(신저가무관)": (c, i) =>
    i >= 5 && has10M(c, i) && volUp(c, i) && drop5(c, i),
  "N2 역사적저점+거래량급감+60%폭락(10일)": (c, i) =>
    i >= 250 && has10M(c, i) &&
    c[i].close <= lowN(c, i, 250) * 1.1 && // 250일 최저가 10% 이내(역사적 저점권)
    drop(c, i) <= 50 && // 거래량 급감(전일 50% 이하)
    c[i].close <= highN(c, i, 10) * 0.4, // 10거래일 고점 대비 60%+ 하락
  "N2b 완화(40%폭락+20일저점)": (c, i) =>
    i >= 60 && has10M(c, i) &&
    c[i].close <= lowN(c, i, 60) * 1.05 &&
    drop(c, i) <= 50 &&
    c[i].close <= highN(c, i, 20) * 0.6, // 20일 고점 대비 40%+ 하락
  "N3 급등주 3·5일선이탈→8일선지지": (c, i) =>
    i >= 20 && has10M(c, i) &&
    c[i].close >= c[i - 20].close * 1.3 && // 급등주(20일 +30%)
    c[i].close < ma(c, i, 3) && c[i].close < ma(c, i, 5) && // 3·5일선 지지 실패
    c[i].low <= ma(c, i, 8) && c[i].close >= ma(c, i, 8) * 0.98, // 8일선 밟음
  "N4 급등후 첫45일선지지(거래량↓·음봉·120선위)": (c, i) =>
    i >= 120 && has10M(c, i) &&
    surgeDayRecent(c, i, 30, 0.2) && // 최근 30일내 하루 +20%
    firstTouch45(c, i) && // 45일선 첫 터치
    c[i].volume < c[i - 1].volume && // 거래량 감소
    bearish(c, i) && // 음봉
    c[i].close >= ma(c, i, 120), // 120일선 위(장기 역배열 제외)
  "N4위험 거래량↑·음봉에 45일선(조심 케이스)": (c, i) =>
    i >= 120 && has10M(c, i) && surgeDayRecent(c, i, 30, 0.2) && firstTouch45(c, i) &&
    c[i].volume >= c[i - 1].volume && bearish(c, i),
  "G1 60GC + 장기정배열(60>120)": (c, i) =>
    i >= 120 && has10M(c, i) && gc(c, i, 20, 60) && ma(c, i, 60) > ma(c, i, 120),
  "G2 60일선 골든크로스만(20×60)": (c, i) =>
    i >= 60 && has10M(c, i) && gc(c, i, 20, 60),
  "N5 5일선 밑→위 돌파(매수)": (c, i) =>
    i >= 6 && has10M(c, i) &&
    c[i].close > ma(c, i, 5) && // 오늘 5일선 위
    c[i - 1].close <= ma(c, i - 1, 5) && // 어제까진 아래 (오늘 돌파)
    c[i - 2].close < ma(c, i - 2, 5), // 그 전날도 아래 (밑에서 놀다가)
  "그냥 음봉 (대조군)": (c, i) => i >= 1 && bearish(c, i),
};
const PRIMARY = "R0 기본 (폭증→급감+음봉+5일선)";

// ── 데이터 (무료/무키) ─────────────────────────────────────────────────────
async function fetchKrxCodes() {
  const res = await fetch(
    "http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",
  );
  const txt = Buffer.from(await res.arrayBuffer()).toString("latin1");
  const all = [...new Set([...txt.matchAll(/\b(\d{6})\b/g)].map((m) => m[1]))];
  for (let k = all.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [all[k], all[j]] = [all[j], all[k]];
  }
  return all;
}

async function fetchDaily(code) {
  const url =
    `https://api.finance.naver.com/siseJson.naver?symbol=${code}` +
    `&requestType=1&startTime=${CONFIG.startDate}&endTime=${CONFIG.endDate}&timeframe=day`;
  const res = await fetch(url, { headers: { referer: "https://finance.naver.com/" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rows = JSON.parse(text.replace(/'/g, '"').replace(/,\s*\]/g, "]"));
  return rows
    .slice(1)
    .map((r) => ({ date: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }))
    .filter((d) => d.close > 0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (x) => (x * 100).toFixed(1) + "%";

async function main() {
  // 캐시 로드 → 부족하면 KRX에서 채움 (한 번 받으면 이후 재실험은 즉시)
  const cache = existsSync(CONFIG.cacheFile)
    ? JSON.parse(readFileSync(CONFIG.cacheFile, "utf8"))
    : {};
  let codes = [...new Set([...CORE, ...Object.keys(cache)])];
  if (codes.length < CONFIG.sampleStocks) {
    console.log("\n전종목 리스트(KRX) 불러오는 중…");
    const krx = await fetchKrxCodes();
    for (const c of krx) {
      if (codes.length >= CONFIG.sampleStocks) break;
      if (!codes.includes(c)) codes.push(c);
    }
  }
  console.log(`표본 ${codes.length}종목 · ${CONFIG.startDate}~${CONFIG.endDate} · 캐시 ${Object.keys(cache).length}종목 · 데이터: KRX+네이버(무료)\n`);

  const series = [];
  let done = 0;
  let fetched = 0;
  for (const code of codes) {
    let c = cache[code];
    if (!c) {
      try {
        c = await fetchDaily(code);
        cache[code] = c;
        fetched++;
      } catch {
        c = null;
      }
      await sleep(CONFIG.reqDelayMs);
    }
    if (c && c.length > 60) series.push({ code, c });
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${codes.length}…`);
  }
  if (fetched) writeFileSync(CONFIG.cacheFile, JSON.stringify(cache));
  console.log(`\n수집 완료: ${series.length}종목 (신규 ${fetched}종목 받음)\n`);

  // baseline (다음날 종가상승 + 장중 터치 + 장중 최대상승)
  const base = { n: 0, win: 0, sum: 0, touch: 0, mfe: 0 };
  for (const { c } of series)
    for (let i = 0; i < c.length - 1; i++) {
      const r = (c[i + 1].close - c[i].close) / c[i].close;
      base.n++; base.sum += r; if (r > 0) base.win++;
      if (c[i + 1].high > c[i].close) base.touch++;
      base.mfe += (c[i + 1].high - c[i].close) / c[i].close;
    }
  console.log(`[기준선] 무작위 진입 다음날: 종가상승 ${pct(base.win / base.n)} · 평균 ${pct(base.sum / base.n)} · 장중터치 ${pct(base.touch / base.n)} · 장중평균최대 ${pct(base.mfe / base.n)} (n=${base.n.toLocaleString()})\n`);

  // 각 법칙
  const results = [];
  const examples = [];
  for (const [name, rule] of Object.entries(RULES)) {
    const agg = { n: 0 };
    for (const h of CONFIG.holdDays) agg[h] = { win: 0, sum: 0, n: 0 };
    for (const { code, c } of series)
      for (let i = 5; i < c.length - 1; i++) {
        if (!rule(c, i)) continue;
        agg.n++;
        if (name === PRIMARY && examples.length < 12)
          examples.push({ code, date: c[i].date, ret1: (c[i + 1].close - c[i].close) / c[i].close });
        for (const h of CONFIG.holdDays) {
          if (i + h >= c.length) continue;
          const r = (c[i + h].close - c[i].close) / c[i].close;
          agg[h].n++; agg[h].sum += r; if (r > 0) agg[h].win++;
        }
      }
    results.push({ name, agg });
  }

  const h1 = CONFIG.holdDays[0];
  for (const { name, agg } of results) {
    const parts = CONFIG.holdDays.map((h) => {
      const a = agg[h];
      return a.n ? `+${h}일 승률 ${pct(a.win / a.n)}(평균 ${pct(a.sum / a.n)})` : `+${h}일 -`;
    });
    const flag = agg.n < 30 ? "  ⚠️표본부족" : "";
    console.log(`■ ${name}\n   신호 ${agg.n}회 · ${parts.join(" · ")}${flag}\n`);
  }

  // ── 책의 주장 검증: "다음날이 아니라 1~N일 내에 오른다" ──
  // 진입가(신호일 종가) 대비, 향후 W일 안에 한 번이라도 올랐나를 기준선과 비교.
  const W = CONFIG.bounceWindow;
  function windowStats(pred) {
    let n = 0, up = 0, b3 = 0, b5 = 0, mfe = 0, mae = 0;
    for (const { c } of series)
      for (let i = 5; i < c.length - W; i++) {
        if (!pred(c, i)) continue;
        n++;
        let maxC = -Infinity, maxH = -Infinity, minL = Infinity;
        for (let k = i + 1; k <= i + W; k++) {
          if (c[k].close > maxC) maxC = c[k].close;
          if (c[k].high > maxH) maxH = c[k].high;
          if (c[k].low < minL) minL = c[k].low;
        }
        if (maxC > c[i].close) up++; // W일 내 종가 한번이라도 위
        if (maxH >= c[i].close * 1.03) b3++; // W일 내 +3% 터치
        if (maxH >= c[i].close * 1.05) b5++; // W일 내 +5% 터치
        mfe += (maxH - c[i].close) / c[i].close; // 평균 최대상승(좋은쪽)
        mae += (minL - c[i].close) / c[i].close; // 평균 최대하락(나쁜쪽)
      }
    return { n, up: up / n, b3: b3 / n, b5: b5 / n, mfe: mfe / n, mae: mae / n };
  }
  const bs = windowStats(() => true);
  console.log(`["${W}일 내 올랐나" — 책 주장 검증 · 진입가 대비 향후 ${W}거래일]`);
  console.log(`   [기준선/랜덤] 종가상승 ${pct(bs.up)} · +3%터치 ${pct(bs.b3)} · +5%터치 ${pct(bs.b5)} · 평균최대상승 ${pct(bs.mfe)} / 최대하락 ${pct(bs.mae)}`);
  for (const key of Object.keys(RULES)) {
    if (key.startsWith("그냥")) continue;
    const s = windowStats(RULES[key]);
    const mark = s.b3 > bs.b3 + 0.05 ? " ⬆엣지?" : "";
    console.log(
      `   [${key}] n=${s.n} · 종가상승 ${pct(s.up)} · +3%터치 ${pct(s.b3)} · +5%터치 ${pct(s.b5)} · 최대상승 ${pct(s.mfe)} / 최대하락 ${pct(s.mae)}${mark}`,
    );
  }
  console.log("");

  // ── "천만 거래량" 윈도우 스윕: 며칠 내 1000만이 적당한가? ──
  {
    const core = (c, i) =>
      i >= 5 && surge(c, i) >= 500 && drop(c, i) <= 25 && bearish(c, i) && gap5(c, i) <= 3;
    console.log(`[천만 거래량 윈도우 스윕 — R0 패턴 · 향후 ${W}일내 반등 · 기준선 +3%터치 ${pct(bs.b3)}]`);
    for (const vw of [0, 5, 10, 20, 40, 60, 90]) {
      const pred = vw === 0 ? core : (c, i) => core(c, i) && maxVolPrev(c, i, vw) >= 10_000_000;
      const s = windowStats(pred);
      const lbl = vw === 0 ? "천만조건 없음" : `최근 ${vw}일내 1000만+`;
      console.log(`   ${lbl.padEnd(16)}: n=${String(s.n).padStart(4)} · +3%터치 ${pct(s.b3)} · +5%터치 ${pct(s.b5)} · 최대상승 ${pct(s.mfe)}`);
    }
    console.log("");
  }

  // ── 종목선정 법칙 비교: 다음날 "올랐나" + 리스크 ──
  {
    function nextDayStats(pred) {
      let n = 0, up = 0, sumR = 0, sumMAE = 0;
      for (const { c } of series)
        for (let i = 250; i < c.length - 1; i++) {
          if (!pred(c, i)) continue;
          n++;
          const r = (c[i + 1].close - c[i].close) / c[i].close;
          if (r > 0) up++;
          sumR += r;
          sumMAE += (c[i + 1].low - c[i].close) / c[i].close; // 다음날 최저(리스크)
        }
      return { n, up: n ? up / n : 0, avg: n ? sumR / n : 0, mae: n ? sumMAE / n : 0 };
    }
    const bsd = nextDayStats(() => true);
    console.log(`[법칙 비교 — 다음날 올랐나 + 리스크]  기준선: 상승 ${pct(bsd.up)} · 평균 ${pct(bsd.avg)} · 최저 ${pct(bsd.mae)}`);
    const cmp = [
      "R0 기본 (폭증→급감+음봉+5일선)",
      "N1 바닥확인(20일신저가+거래량증가+-5%)",
      "N3 급등주 3·5일선이탈→8일선지지",
      "N4 급등후 첫45일선지지(거래량↓·음봉·120선위)",
      "G1 60GC + 장기정배열(60>120)",
      "G2 60일선 골든크로스만(20×60)",
      "N5 5일선 밑→위 돌파(매수)",
    ];
    for (const key of cmp) {
      const s = nextDayStats(RULES[key]);
      const flag = s.n < 30 ? " ⚠️표본부족" : s.up > bsd.up + 0.05 ? " ⬆" : "";
      console.log(
        `   ${key.slice(0, 30).padEnd(31)} n=${String(s.n).padStart(4)} · 상승 ${pct(s.up)} · 평균 ${pct(s.avg)} · 최저 ${pct(s.mae)}${flag}`,
      );
    }
    console.log("");
  }

  // ── 표본 외 검증: 앞2년 vs 뒤2.4년 둘 다 살아남나 ──
  {
    function rangeStats(pred, fromD, toD) {
      let n = 0, up = 0, sumR = 0;
      for (const { c } of series)
        for (let i = 250; i < c.length - 1; i++) {
          if (c[i].date < fromD || c[i].date > toD) continue;
          if (!pred(c, i)) continue;
          n++;
          const r = (c[i + 1].close - c[i].close) / c[i].close;
          if (r > 0) up++;
          sumR += r;
        }
      return { n, up: n ? up / n : 0, avg: n ? sumR / n : 0 };
    }
    const A = ["20220101", "20231231"], B = ["20240101", "20261231"];
    const baseA = rangeStats(() => true, ...A), baseB = rangeStats(() => true, ...B);
    console.log(`[표본 외 검증 — A:2022~2023  vs  B:2024~2026]  (상승%/평균%)`);
    console.log(`   기준선                : A ${pct(baseA.up)}/${pct(baseA.avg)} | B ${pct(baseB.up)}/${pct(baseB.avg)}`);
    const check = [
      "N1 바닥확인(20일신저가+거래량증가+-5%)",
      "G1 60GC + 장기정배열(60>120)",
      "G2 60일선 골든크로스만(20×60)",
      "N5 5일선 밑→위 돌파(매수)",
      "N4 급등후 첫45일선지지(거래량↓·음봉·120선위)",
    ];
    for (const key of check) {
      const a = rangeStats(RULES[key], ...A), b = rangeStats(RULES[key], ...B);
      const okA = a.n >= 20 && a.up > baseA.up, okB = b.n >= 20 && b.up > baseB.up;
      const mark = okA && okB ? "🟢 둘다↑(robust)" : okA || okB ? "🟡 한쪽만" : "🔴 둘다 실패";
      console.log(
        `   ${key.slice(0, 20).padEnd(21)}: A ${pct(a.up)}/${pct(a.avg)}(n${a.n}) | B ${pct(b.up)}/${pct(b.avg)}(n${b.n})  ${mark}`,
      );
    }
    console.log("");
  }

  // ── 지지/저항 범위매매 시뮬: 지지 매수 → 저항 익절 / 지지이탈 손절 / N일 청산 ──
  {
    const P = { rangeN: 20, supBand: 0.03, stop: 0.05, maxHold: 10, cost: 0.005 };
    function srSim(fromD, toD) {
      let n = 0, win = 0, sumR = 0;
      for (const { c } of series) {
        let i = P.rangeN;
        while (i < c.length - 1) {
          if (c[i].date < fromD || c[i].date > toD) { i++; continue; }
          const sup = lowN(c, i, P.rangeN), res = highN(c, i, P.rangeN);
          const nearSup = c[i].close <= sup * (1 + P.supBand) && c[i].close >= sup;
          if (!(nearSup && res > sup * 1.08 && has10M(c, i))) { i++; continue; }
          const entry = c[i].close, target = res, stopP = sup * (1 - P.stop);
          let exit = null, k = i + 1;
          for (; k <= Math.min(i + P.maxHold, c.length - 1); k++) {
            if (c[k].low <= stopP) { exit = stopP; break; } // 손절(보수적: 닿으면 그 가격)
            if (c[k].high >= target) { exit = target; break; } // 저항 익절
          }
          if (exit === null) { k = Math.min(i + P.maxHold, c.length - 1); exit = c[k].close; }
          const ret = (exit - entry) / entry - P.cost; // 비용 차감
          n++; if (ret > 0) win++; sumR += ret;
          i = k + 1; // 청산 후 다음 봉부터 (한 번에 한 포지션)
        }
      }
      return { n, win: n ? win / n : 0, avg: n ? sumR / n : 0 };
    }
    const all = srSim("00000000", "99999999");
    const a = srSim("20220101", "20231231"), b = srSim("20240101", "20261231");
    console.log(`[지지/저항 범위매매 시뮬]  지지 ${P.supBand * 100}%이내 매수 → 저항 익절 / 지지 -${P.stop * 100}% 손절 / 최대 ${P.maxHold}일 / 비용 ${P.cost * 100}%왕복`);
    console.log(`   전체: 거래 ${all.n}회 · 승률 ${pct(all.win)} · 평균손익(기대값) ${pct(all.avg)}`);
    console.log(`   표본외: A(2022~23) 승률 ${pct(a.win)}/기대값 ${pct(a.avg)}(n${a.n}) | B(2024~26) 승률 ${pct(b.win)}/기대값 ${pct(b.avg)}(n${b.n})`);
    console.log("");
  }

  if (examples.length) {
    console.log(`[${PRIMARY}] 실제 신호 예시 (날짜=2일 급감음봉일):`);
    for (const e of examples) console.log(`   ${e.code} ${e.date}  →3일 ${pct(e.ret1)}`);
    console.log("");
  }
  console.log("※ 기준선보다 유의미하게 높아야 의미. n<수십이면 신뢰 불가. ablation(└)으로 어느 조건이 기여하는지 비교.\n");
}

main().catch((e) => console.error("실패:", e));
