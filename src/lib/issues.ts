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
  for (const t of ["BUSINESS", "NATION", "WORLD"]) {
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
  issues: DailyIssue[];
}

export async function getDailyIssues(): Promise<DailyIssuesResult> {
  const cutoff = lastMarketCloseMs();
  const [news, themes] = await Promise.all([fetchNews(cutoff), fetchThemes()]);
  const themeList = themes.map((t) => `${t.no}:${t.name}`).join(", ");

  const c = new Date(cutoff + 9 * 3600e3);
  const since = `${c.getUTCMonth() + 1}/${c.getUTCDate()} 15:30`;

  const system = `너는 한국 주식 애널리스트다. 아래 헤드라인들은 모두 "직전 장마감(${since}) 이후"에 나온 뉴스로, 내일 장에 새로 반영될 재료다.
이 중에서 "내일 국내 증시에 재료(테마)로 작용할 핵심 이슈 2개"를 고른다.
각 이슈에 대해, 제공된 [테마목록]에서 가장 관련 깊은 테마를 no로 정확히 하나 매칭한다(목록에 없는 테마는 만들지 마라).
★ 두 이슈는 반드시 서로 다른 주제 + 서로 다른 테마(no)여야 한다. 같은 섹터로 2개를 채우지 마라.
반드시 아래 JSON만 출력:
{"issues":[{"title":"이슈 한 줄","why":"왜 국내 증시 재료인지 한 줄","theme_no":"매칭 테마 no","theme_name":"매칭 테마명"}]}  // issues는 정확히 2개`;
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
  return { since, issues };
}
