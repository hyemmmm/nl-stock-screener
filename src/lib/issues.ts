// ──────────────────────────────────────────────────────────────────────────
// 오늘의 핵심 이슈 2개 + 관련주 자동 선정 (서버 전용).
// 뉴스(구글뉴스 RSS) → Groq LLM이 이슈 선정+테마 매칭 → 네이버 테마 관련주.
// 무료/무키(구글·네이버) + Groq 키만.
// ──────────────────────────────────────────────────────────────────────────

const dec = (buf: ArrayBuffer) => new TextDecoder("euc-kr").decode(Buffer.from(buf));
const clean = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// 장마감(15:30 KST) 이후 뉴스만 — 내일 장에 반영될 재료만 걸러내기 위함.
async function fetchNews(cutoffMs: number): Promise<string[]> {
  const items: { title: string; ts: number }[] = [];
  const seen = new Set<string>();
  // 일반 뉴스 위주 — 증시 자체(BUSINESS)보다 현실 사건(정치·국제·기술·과학·산업)에서 재료를 찾는다.
  for (const t of ["NATION", "WORLD", "TECHNOLOGY", "SCIENCE", "HEALTH", "BUSINESS"]) {
    try {
      const txt = await (
        await fetch(
          `https://news.google.com/rss/headlines/section/topic/${t}?hl=ko&gl=KR&ceid=KR:ko`,
          { cache: "no-store" },
        )
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
  items.sort((a, b) => b.ts - a.ts); // 최신순
  return items.slice(0, 60).map((i) => i.title);
}

// 방금 지난 가장 최근의 15:30 KST(장마감) 시각(ms). 마감 전이면 전 거래일 마감 기준.
function lastMarketCloseMs(): number {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600e3); // KST 벽시계를 UTC 필드로
  let cutoff = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6, 30, 0); // 15:30 KST = 06:30 UTC
  if (now < cutoff) cutoff -= 86400e3; // 아직 오늘 마감 전 → 전일 마감부터
  return cutoff;
}

interface Theme {
  no: string;
  name: string;
  chg: number;
}

async function fetchThemes(): Promise<Theme[]> {
  const themes: Theme[] = [];
  for (let p = 1; p <= 7; p++) {
    try {
      const buf = await (
        await fetch(`https://finance.naver.com/sise/theme.naver?page=${p}`, {
          headers: { referer: "https://finance.naver.com/" },
          cache: "no-store",
        })
      ).arrayBuffer();
      const txt = dec(buf);
      const re =
        /type=theme&no=(\d+)">([^<]+)<\/a><\/td>\s*<td class="number col_type2">\s*<span[^>]*>\s*([+\-][\d.]+%)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) themes.push({ no: m[1], name: m[2].trim(), chg: parseFloat(m[3]) });
    } catch {}
  }
  return themes;
}

async function fetchThemeStocks(no: string): Promise<{ code: string; name: string }[]> {
  const buf = await (
    await fetch(`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`, {
      headers: { referer: "https://finance.naver.com/" },
      cache: "no-store",
    })
  ).arrayBuffer();
  const txt = dec(buf);
  const out: { code: string; name: string }[] = [];
  const seen = new Set<string>();
  const re = /\/item\/main\.naver\?code=(\d{6})">([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ code: m[1], name: m[2].trim() });
  }
  return out;
}

async function groqJSON(system: string, user: string): Promise<{ issues?: RawIssue[] }> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    cache: "no-store",
  });
  const j = await res.json();
  if (!j.choices) throw new Error("Groq: " + JSON.stringify(j).slice(0, 200));
  return JSON.parse(j.choices[0].message.content);
}

interface RawIssue {
  title: string;
  why: string;
  theme_no: string;
  theme_name: string;
}

export interface DailyIssue {
  title: string;
  why: string;
  themeName: string;
  themeChg: number | null;
  stocks: { code: string; name: string }[];
}

export interface DailyIssuesResult {
  since: string; // "7/7 15:30" — 이 시각(장마감) 이후 뉴스만 반영
  date: string; // 예측 생성일(KST) YYYYMMDD — 하루 1건 기록 키
  baselineDate: string; // 수익률 기준일(직전 마감) YYYYMMDD
  issues: DailyIssue[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdKST = (ms: number) => {
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
};

export async function getDailyIssues(): Promise<DailyIssuesResult> {
  const cutoff = lastMarketCloseMs();
  const [news, themes] = await Promise.all([fetchNews(cutoff), fetchThemes()]);
  const themeList = themes.map((t) => `${t.no}:${t.name}`).join(", ");

  const c = new Date(cutoff + 9 * 3600e3);
  const since = `${c.getUTCMonth() + 1}/${c.getUTCDate()} 15:30`;
  const baselineDate = ymdKST(cutoff);
  const date = ymdKST(Date.now());

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

  const res = await groqJSON(system, user);
  const raw = (res.issues || []).slice(0, 2);

  const issues = await Promise.all(
    raw.map(async (iss) => {
      const th = themes.find((t) => t.no === String(iss.theme_no));
      const stocks = th ? (await fetchThemeStocks(th.no)).slice(0, 12) : [];
      return {
        title: iss.title,
        why: iss.why,
        themeName: iss.theme_name || th?.name || "",
        themeChg: th ? th.chg : null,
        stocks,
      };
    }),
  );
  return { since, date, baselineDate, issues };
}
