// ────────────────────────────────────────────────────────────────────────
//  유상증자 매매 백테스터 — DART(공시 이벤트) + 네이버(가격).
//  DART 무료 키만 필요(.env.local의 DART_API_KEY). 네이버는 무키.
//
//  주주배정 유상증자 "발표" 후 매수 → +N일 수익률/상승확률을 무작위와 비교.
//  실행:  node scripts/yuzeng.mjs
// ────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, writeFileSync } from "node:fs";

const KEY = (() => {
  const m = readFileSync(".env.local", "utf8").match(/DART_API_KEY=(\w+)/);
  if (!m) throw new Error("DART_API_KEY가 .env.local에 없습니다");
  return m[1];
})();

const CONFIG = {
  bgn: "20220101",
  end: "20251231", // 4년 (표본외 검증용으로 2022~23 vs 24~25 분리)
  holdDays: [5, 10, 20],
  reqDelayMs: 70,
  priceCacheFile: "scripts/.yz-price-cache.json",
  eventsCacheFile: "scripts/.yz-events-cache.json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const pct = (x) => (x * 100).toFixed(1) + "%";

function quarters(bgn, end) {
  const out = [];
  for (let y = +bgn.slice(0, 4); y <= +end.slice(0, 4); y++)
    for (const [a, b] of [["0101", "0331"], ["0401", "0630"], ["0701", "0930"], ["1001", "1231"]]) {
      const s = `${y}${a}`, e = `${y}${b}`;
      if (e < bgn || s > end) continue;
      out.push([s < bgn ? bgn : s, e > end ? end : e]);
    }
  return out;
}

// 1) 유상증자결정 공시에서 (corp_code → stock_code) 매핑 + 대상 corp 수집
async function collectCorps() {
  const codeMap = new Map(); // corp_code -> stock_code
  for (const [bgn, end] of quarters(CONFIG.bgn, CONFIG.end)) {
    let page = 1, total = 1;
    do {
      const r = await fetch(
        `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&bgn_de=${bgn}&end_de=${end}&pblntf_ty=B&page_count=100&page_no=${page}`,
      );
      const d = await r.json();
      if (d.status !== "000") break;
      total = d.total_page;
      for (const x of d.list || []) {
        if (!/유상증자결정/.test(x.report_nm)) continue;
        const code = (x.stock_code || "").trim();
        if (/^\d{6}$/.test(code)) codeMap.set(x.corp_code, code);
      }
      page++;
      await sleep(CONFIG.reqDelayMs);
    } while (page <= total);
    process.stdout.write(`  ${bgn.slice(0, 6)}(${codeMap.size})`);
  }
  console.log("");
  return codeMap;
}

// 2) 각 corp의 유상증자 결정을 piicDecsn에서 직접 → 주주배정만, 날짜=rcept_no 앞8자리
async function jujuEvents(codeMap) {
  const out = [];
  const corps = [...codeMap.keys()];
  let done = 0;
  const cnt = {};
  for (const corp of corps) {
    try {
      const r = await fetch(
        `https://opendart.fss.or.kr/api/piicDecsn.json?crtfc_key=${KEY}&corp_code=${corp}&bgn_de=20200101&end_de=${CONFIG.end}`,
      );
      const d = await r.json();
      if (d.status === "000")
        for (const o of d.list || []) {
          cnt[o.ic_mthn] = (cnt[o.ic_mthn] || 0) + 1;
          const date = String(o.rcept_no).slice(0, 8);
          if (/주주배정/.test(o.ic_mthn) && date >= CONFIG.bgn && date <= CONFIG.end)
            out.push({ code: codeMap.get(corp), date, ic: o.ic_mthn });
        }
    } catch {}
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${corps.length}`);
    await sleep(CONFIG.reqDelayMs);
  }
  console.log("\n   piicDecsn 방식별:", Object.entries(cnt).map(([k, v]) => `${k}=${v}`).join(" "));
  return out;
}

// 3) 네이버 가격 (YYYYMMDD)
const priceCache = existsSync(CONFIG.priceCacheFile)
  ? JSON.parse(readFileSync(CONFIG.priceCacheFile, "utf8"))
  : {};
async function getPrice(code) {
  if (priceCache[code]) return priceCache[code];
  const end = new Date(), start = new Date();
  start.setDate(start.getDate() - 1200);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`,
      { headers: { referer: "https://finance.naver.com/" } },
    );
    const rows = JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"));
    priceCache[code] = rows.slice(1).map((x) => ({ date: String(x[0]), close: +x[4] })).filter((x) => x.close > 0);
  } catch {
    priceCache[code] = [];
  }
  return priceCache[code];
}

// 발표 다음날 종가 매수 → +h거래일 종가 수익률
function fwdReturn(candles, eventYmd, h) {
  let i = candles.findIndex((c) => c.date >= eventYmd);
  if (i < 0) return null;
  const buy = i + 1; // 발표 다음날
  const exit = buy + h;
  if (exit >= candles.length) return null;
  return (candles[exit].close - candles[buy].close) / candles[buy].close;
}

async function main() {
  console.log(`\n유상증자 매매 백테스트 — DART공시 + 네이버가격`);
  console.log(`기간 ${CONFIG.bgn}~${CONFIG.end}\n`);

  let target;
  if (existsSync(CONFIG.eventsCacheFile)) {
    target = JSON.parse(readFileSync(CONFIG.eventsCacheFile, "utf8"));
    console.log(`주주배정 ${target.length}건 (이벤트 캐시 사용)`);
  } else {
    console.log("1) 유상증자 공시한 상장사 수집…");
    const codeMap = await collectCorps();
    console.log(`   대상 상장사 ${codeMap.size}곳`);
    console.log("2) 증자방식 분류 → 주주배정 추출 (piicDecsn 직접)…");
    target = await jujuEvents(codeMap);
    writeFileSync(CONFIG.eventsCacheFile, JSON.stringify(target));
  }
  console.log(`\n3) 주주배정 ${target.length}건 가격 결합 + 모델…`);

  const recs = []; // {date, entry, c5, c10, c20, c40}
  let priced = 0, done = 0;
  for (const e of target) {
    const c = await getPrice(e.code);
    if (++done % 40 === 0) process.stdout.write(`  ${done}/${target.length}`);
    if (!c.length) continue;
    let i = c.findIndex((x) => x.date >= e.date);
    if (i < 0 || i + 1 >= c.length) continue;
    priced++;
    const buy = i + 1;
    const at = (h) => (buy + h < c.length ? c[buy + h].close : null);
    recs.push({ date: e.date, entry: c[buy].close, c5: at(5), c10: at(10), c20: at(20), c40: at(40) });
    await sleep(CONFIG.reqDelayMs);
  }
  writeFileSync(CONFIG.priceCacheFile, JSON.stringify(priceCache));

  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const summ = (rs) => ({
    n: rs.length,
    up: rs.filter((r) => r > 0).length / (rs.length || 1),
    mean: rs.reduce((a, b) => a + b, 0) / (rs.length || 1),
    med: median(rs),
  });

  console.log(`\n\n가격 결합 완료: ${priced}종목\n`);

  // ① 주가 레그만
  console.log("[① 주가 레그만 — 발표 다음날 매수 → +N일 매도]");
  for (const [lbl, key] of [["+5일", "c5"], ["+10일", "c10"], ["+20일", "c20"], ["+40일", "c40"]]) {
    const s = summ(recs.filter((r) => r[key]).map((r) => (r[key] - r.entry) / r.entry));
    console.log(`   ${lbl.padEnd(5)}: 상승 ${pct(s.up)} · 평균 ${pct(s.mean)} · 중앙값 ${pct(s.med)} (n=${s.n})`);
  }

  // ② 신주 레그 포함 모델 (할인 25%, +20일=청약시점, +40일=상장매도)
  const D = 0.25;
  console.log(`\n[② 신주 포함 모델 — 청약(할인 ${D * 100}%) + 상장(~+40일) 전량매도 · 총자본 대비]`);
  const usable = recs.filter((r) => r.c20 && r.c40);
  for (const r of [0.2, 0.3, 0.5]) {
    const rets = usable.map((e) => {
      const issue = (1 - D) * e.c20; // 발행가 ≈ 청약시점가 × 0.75
      const cost = e.entry + r * issue; // 주식1 + 신주r 청약대금
      const value = (1 + r) * e.c40; // 상장시 전량 (1+r)주 매도
      return (value - cost) / cost;
    });
    const s = summ(rets);
    console.log(`   배정비율 ${r}: 승률 ${pct(s.up)} · 평균 ${pct(s.mean)} · 중앙값 ${pct(s.med)} (n=${s.n})`);
  }

  // 표본외 (신주 모델, 배정비율 0.3)
  console.log("\n[표본 외 — 신주모델(배정0.3) · A:2022~23 vs B:2024~25]");
  const model = (e, r) => {
    const issue = (1 - D) * e.c20, cost = e.entry + r * issue, value = (1 + r) * e.c40;
    return (value - cost) / cost;
  };
  for (const [lbl, f] of [["A(2022~23)", (e) => e.date < "20240101"], ["B(2024~25)", (e) => e.date >= "20240101"]]) {
    const s = summ(usable.filter(f).map((e) => model(e, 0.3)));
    console.log(`   ${lbl}: 승률 ${pct(s.up)} · 평균 ${pct(s.mean)} · 중앙값 ${pct(s.med)} (n=${s.n})`);
  }
  console.log("");
}

main().catch((e) => console.error("실패:", e));
