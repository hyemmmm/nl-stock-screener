// ────────────────────────────────────────────────────────────────────────
//  매일 핵심 이슈 2개 + 관련주 자동 선정.
//  뉴스(구글뉴스 RSS·무키) → Groq LLM이 이슈 선정+테마 매칭 → 네이버 테마 관련주.
//  실행: node scripts/daily-issues.mjs
// ────────────────────────────────────────────────────────────────────────
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";

const GROQ = readFileSync(".env.local", "utf8").match(/GROQ_API_KEY=(\S+)/)[1];
const dec = (buf) => new TextDecoder("euc-kr").decode(Buffer.from(buf));
const clean = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// 방금 지난 가장 최근의 15:30 KST(장마감) 시각(ms). 마감 전이면 전 거래일 마감 기준.
function lastMarketCloseMs() {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600e3);
  let cutoff = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6, 30, 0);
  if (now < cutoff) cutoff -= 86400e3;
  return cutoff;
}

// 장마감(15:30 KST) 이후 뉴스만 — 내일 장에 반영될 재료만.
async function fetchNews(cutoffMs) {
  const items = [];
  const seen = new Set();
  // 일반 뉴스 위주 — 증시 자체(BUSINESS)보다 현실 사건(정치·국제·기술·과학·산업)에서 재료를 찾는다.
  for (const t of ["NATION", "WORLD", "TECHNOLOGY", "SCIENCE", "HEALTH", "BUSINESS"]) {
    try {
      const txt = await (
        await fetch(`https://news.google.com/rss/headlines/section/topic/${t}?hl=ko&gl=KR&ceid=KR:ko`)
      ).text();
      for (const m of txt.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const block = m[1];
        const title = block.match(/<title>([^<]+)<\/title>/)?.[1];
        if (!title) continue;
        const pd = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
        const ts = pd ? Date.parse(pd) : NaN;
        if (!Number.isNaN(ts) && ts < cutoffMs) continue; // 마감 이전 뉴스 제외
        const c = clean(title);
        if (seen.has(c)) continue;
        seen.add(c);
        items.push({ title: c, ts: Number.isNaN(ts) ? 0 : ts });
      }
    } catch {}
  }
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, 60).map((i) => i.title);
}

async function fetchThemes() {
  const themes = [];
  for (let p = 1; p <= 7; p++) {
    try {
      const buf = await (
        await fetch(`https://finance.naver.com/sise/theme.naver?page=${p}`, {
          headers: { referer: "https://finance.naver.com/" },
        })
      ).arrayBuffer();
      const txt = dec(buf);
      const re =
        /type=theme&no=(\d+)">([^<]+)<\/a><\/td>\s*<td class="number col_type2">\s*<span[^>]*>\s*([+\-][\d.]+%)/g;
      let m;
      while ((m = re.exec(txt))) themes.push({ no: m[1], name: m[2].trim(), chg: parseFloat(m[3]) });
    } catch {}
  }
  return themes;
}

async function fetchStocks(no) {
  const buf = await (
    await fetch(`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`, {
      headers: { referer: "https://finance.naver.com/" },
    })
  ).arrayBuffer();
  const txt = dec(buf);
  const out = [];
  const seen = new Set();
  const re = /\/item\/main\.naver\?code=(\d{6})">([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(txt))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ code: m[1], name: m[2].trim() });
  }
  return out;
}

async function groqJSON(system, user) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${GROQ}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const j = await r.json();
  if (!j.choices) throw new Error("Groq: " + JSON.stringify(j).slice(0, 200));
  return JSON.parse(j.choices[0].message.content);
}

async function main() {
  const cutoff = lastMarketCloseMs();
  const c = new Date(cutoff + 9 * 3600e3);
  const since = `${c.getUTCMonth() + 1}/${c.getUTCDate()} 15:30`;
  console.log(`\n📰 뉴스 수집(구글뉴스) — ${since} 장마감 이후만…`);
  const news = await fetchNews(cutoff);
  console.log("🏷  테마 수집(네이버)…");
  const themes = await fetchThemes();
  console.log(`   헤드라인 ${news.length} · 테마 ${themes.length}\n`);

  const themeList = themes.map((t) => `${t.no}:${t.name}`).join(", ");
  const system = `너는 한국 주식 애널리스트다. 아래는 직전 장마감(${since}) 이후 나온 "일반 뉴스 헤드라인"이다.
네가 할 일: 뉴스 속 "현실에서 벌어진 사건"을 보고, 내일 국내 증시에서 특정 업종·테마 주식을 움직일 핵심 이슈 2개를 고른다.

★ 이슈 = 현실 사건이어야 한다. 예) 정부 정책·규제·예산, 신기술/신제품 발표, 국제 분쟁·외교·제재, 유가·원자재·환율을 움직인 사건, 대형 수주·계약·M&A, 자연재해·기후·질병, 대형 행사. 이 사건이 "왜 어떤 업종에 수혜/타격인지"를 근거로 테마를 고른다.
★ 절대 이슈로 쓰지 마라(이건 사건이 아니라 증시 현상일 뿐): 코스피·코스닥 지수 등락/급등락, 사이드카·서킷브레이커, 외국인·기관 수급, "환율/유가가 몇 % 움직였다" 결과 자체, 증권사 목표주가·투자의견, "OO주 상승/하락" 같은 주가 결과 뉴스.
  → 만약 헤드라인이 이런 주가·증시 뉴스뿐이라면, 그 뒤에 있는 "실제 원인 사건"을 이슈로 삼아라.
★ 두 이슈는 서로 다른 사건 + 서로 다른 테마(no)여야 한다.

각 이슈에 대해 [테마목록]에서 가장 관련 깊은 테마를 no로 정확히 하나 매칭한다(목록에 없는 no는 만들지 마라).
반드시 아래 JSON만 출력:
{"issues":[{"title":"현실 사건 한 줄","why":"이 사건이 왜 그 업종에 재료인지 한 줄","theme_no":"매칭 테마 no","theme_name":"매칭 테마명"}]}  // issues는 정확히 2개`;
  const user = `[마감 이후 헤드라인]\n${news.join("\n")}\n\n[테마목록(no:이름)]\n${themeList}`;

  console.log("🤖 Groq가 핵심 이슈 2개 선정 + 테마 매칭…\n");
  const res = await groqJSON(system, user);

  const issues = [];
  for (const iss of (res.issues || []).slice(0, 2)) {
    const th = themes.find((t) => t.no === String(iss.theme_no));
    const stocks = th ? (await fetchStocks(th.no)).slice(0, 12) : [];
    console.log("━".repeat(60));
    console.log(`◎ 이슈: ${iss.title}`);
    console.log(`   → ${iss.why}`);
    console.log(`◎ 관련 테마: ${iss.theme_name}${th ? ` (오늘 ${th.chg > 0 ? "+" : ""}${th.chg}%)` : ""}`);
    console.log(
      th ? `◎ 관련주 ${stocks.length}개: ${stocks.map((s) => s.name).join(", ")}` : "   (테마 매칭 실패 — Groq가 목록 밖 no를 냄)",
    );
    console.log("");
    issues.push({
      title: iss.title,
      why: iss.why,
      themeName: iss.theme_name || th?.name || "",
      themeChg: th ? th.chg : null,
      stocks: stocks.map((s) => ({ code: s.code, name: s.name })),
    });
  }

  // 예측 기록 (하루 1건, 성적표 채점용) — data/predictions.jsonl
  const ymd = (ms) => {
    const d = new Date(ms + 9 * 3600e3);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  };
  const date = ymd(Date.now());
  const dir = "data", file = `${dir}/predictions.jsonl`;
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (existing.includes(`"date":"${date}"`)) {
    console.log(`ℹ️  오늘(${date}) 예측은 이미 기록됨 — skip`);
  } else {
    mkdirSync(dir, { recursive: true });
    const rec = { date, baselineDate: ymd(cutoff), predAt: new Date().toISOString(), issues };
    appendFileSync(file, JSON.stringify(rec) + "\n", "utf8");
    console.log(`✅ 예측 기록됨 → ${file} (성적표에서 며칠 뒤 채점)`);
  }
}

main().catch((e) => console.error("실패:", e));
