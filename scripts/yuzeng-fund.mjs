// ────────────────────────────────────────────────────────────────────────
//  유증 매매 + 기업 선별(DART 재무) — 흑자/자본잠식/부채비율로 거른 뒤 비교.
//  이벤트·가격 캐시 재사용. 실행: node scripts/yuzeng-fund.mjs
// ────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";

const KEY = readFileSync(".env.local", "utf8").match(/DART_API_KEY=(\w+)/)[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (x) => (x * 100).toFixed(1) + "%";
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const summ = (rs) => ({
  n: rs.length,
  up: rs.filter((r) => r > 0).length / (rs.length || 1),
  mean: rs.reduce((a, b) => a + b, 0) / (rs.length || 1),
  med: median(rs),
});

const events = JSON.parse(readFileSync("scripts/.yz-events-cache.json", "utf8")); // {code,date,ic}
const priceCache = JSON.parse(readFileSync("scripts/.yz-price-cache.json", "utf8"));
const BGN = "20220101", END = "20251231", D = 0.25, R = 0.3;

function quarters(bgn, end) {
  const out = [];
  for (let y = +bgn.slice(0, 4); y <= +end.slice(0, 4); y++)
    for (const [a, b] of [["0101", "0331"], ["0401", "0630"], ["0701", "0930"], ["1001", "1231"]])
      out.push([`${y}${a}`, `${y}${b}`]);
  return out;
}

// stock_code → corp_code (corpCode.xml에서 미리 파싱해둔 .corpmap.json)
function buildMap() {
  const obj = JSON.parse(readFileSync("scripts/.corpmap.json", "utf8"));
  return new Map(Object.entries(obj));
}

const num = (s) => Number(String(s || "").replace(/,/g, "")) || 0;
async function getFund(corp, year) {
  try {
    const d = await (
      await fetch(`https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${KEY}&corp_code=${corp}&bsns_year=${year}&reprt_code=11011`)
    ).json();
    if (d.status !== "000" || !d.list) return null;
    const pick = (nm) => {
      const rows = d.list.filter((o) => o.account_nm === nm);
      const cfs = rows.find((o) => o.fs_div === "CFS") || rows[0];
      return cfs ? num(cfs.thstrm_amount) : null;
    };
    const op = pick("영업이익"), eq = pick("자본총계"), li = pick("부채총계");
    if (op === null || eq === null) return null;
    return { op, eq, li: li ?? 0 };
  } catch {
    return null;
  }
}
const isGood = (f) => f && f.op > 0 && f.eq > 0 && f.li / f.eq < 2.0; // 흑자+자본>0+부채비율<200%

function modelRet(code, date) {
  const c = priceCache[code];
  if (!c || !c.length) return null;
  const i = c.findIndex((x) => x.date >= date);
  if (i < 0 || i + 1 >= c.length) return null;
  const buy = i + 1;
  const at = (h) => (buy + h < c.length ? c[buy + h].close : null);
  const entry = c[buy].close, p20 = at(20), p40 = at(40);
  if (!p20 || !p40) return null;
  const issue = (1 - D) * p20, cost = entry + R * issue, value = (1 + R) * p40;
  return (value - cost) / cost;
}

async function main() {
  console.log(`유증 + 기업선별 백테스트 (신주모델 배정${R}/할인${D * 100}%)\n주주배정 ${events.length}건\n`);
  console.log("1) corp_code 매핑 (corpCode.xml)…");
  const map = buildMap();

  console.log("2) DART 재무 받아 선별…");
  const fundCache = new Map();
  let done = 0;
  const tagged = [];
  for (const e of events) {
    const corp = map.get(e.code);
    const ret = modelRet(e.code, e.date);
    if (!corp || ret === null) continue;
    const m = +e.date.slice(4, 6);
    const fy = m <= 4 ? +e.date.slice(0, 4) - 2 : +e.date.slice(0, 4) - 1;
    const ck = `${corp}_${fy}`;
    if (!fundCache.has(ck)) {
      let f = await getFund(corp, fy);
      if (!f) f = await getFund(corp, fy - 1);
      fundCache.set(ck, f);
      if (++done % 40 === 0) process.stdout.write(`  ${done}`);
      await sleep(70);
    }
    tagged.push({ ...e, ret, good: isGood(fundCache.get(ck)), hasFund: !!fundCache.get(ck) });
  }
  console.log("");

  const withFund = tagged.filter((t) => t.hasFund);
  const good = withFund.filter((t) => t.good);
  const bad = withFund.filter((t) => !t.good);
  console.log(`\n재무 확보 ${withFund.length}건 (좋음 ${good.length} / 나쁨 ${bad.length})\n`);
  console.log(`[신주 포함 모델 — 기업 선별 효과]  (★중앙값)`);
  const show = (lbl, arr) => {
    const s = summ(arr.map((t) => t.ret));
    console.log(`   ${lbl.padEnd(22)} 승률 ${pct(s.up)} · 평균 ${pct(s.mean)} · 중앙값 ${pct(s.med)} (n=${s.n})`);
  };
  show("전체(선별 전)", withFund);
  show("✅ 좋은 펀더만", good);
  show("❌ 나쁜 펀더(흑자X/부채과다)", bad);

  console.log(`\n[표본 외 — ✅좋은 펀더만]`);
  show("A(2022~23)", good.filter((t) => t.date < "20240101"));
  show("B(2024~25)", good.filter((t) => t.date >= "20240101"));
  console.log("");
}
main().catch((e) => console.error("실패:", e));
