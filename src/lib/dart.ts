// ──────────────────────────────────────────────────────────────────────────
// 오늘의 공시 재료 (서버 전용) — DART 전자공시.
//   오늘 올라온 공시 중 '재료성'(계약·수주·증자·임상·투자·특허 등)만 추려서
//   관련 종목과 함께. 공시엔 종목코드가 들어있어 뉴스보다 정확.
//   무료 키: DART_API_KEY (opendart.fss.or.kr). 데이터센터에서도 잘 됨.
// ──────────────────────────────────────────────────────────────────────────

const BASE = "https://opendart.fss.or.kr/api";

// 재료성 공시 유형 (report_nm 키워드)
const CATS: { t: string; re: RegExp }[] = [
  { t: "계약·수주", re: /공급계약|단일판매|수주|납품|양수도\s?계약|판매계약|공급\s?계약/ },
  { t: "임상·허가", re: /임상|품목허가|허가|승인|식약처|FDA/ },
  { t: "투자·M&A", re: /타법인.*(취득|출자)|주식\s?취득|영업양수|합병|시설투자|신규\s?투자|지분\s?인수/ },
  { t: "특허·기술", re: /특허권|기술이전|기술도입|기술\s?계약|라이선스|기술수출/ },
  { t: "증자·CB", re: /유상증자|무상증자|전환사채|신주인수권부사채|교환사채/ },
  { t: "자사주", re: /자기주식.*취득/ },
  { t: "정부·국책", re: /국책|정부과제|국가과제|정부\s?지원|과제\s?선정/ },
];
// 재료 아님(루틴/행정) — 위 키워드가 걸려도 제외
const EXCLUDE =
  /소유상황보고서|대량보유|소유주식\s?변동|특정증권등소유|임원ㆍ주요주주|기업설명회|IR개최|주주총회소집|실적공시\s?예고|투자설명서|사업보고서|분기보고서|반기보고서|감사보고서|증권신고서|일괄신고|합병.*종료|주식등의대량|의결권/;

function classify(nm: string): string | null {
  if (EXCLUDE.test(nm)) return null;
  for (const c of CATS) if (c.re.test(nm)) return c.t;
  return null;
}

export interface Disclosure {
  code: string;
  name: string;
  title: string;
  type: string;
  link: string;
}
export interface DartResult {
  date: string; // M/D
  count: number; // 전체 공시 수
  items: Disclosure[]; // 재료성만
}

interface DartRow {
  corp_name: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
}

export async function todayDisclosures(): Promise<DartResult> {
  const key = process.env.DART_API_KEY;
  if (!key) return { date: "", count: 0, items: [] };
  const k = new Date(Date.now() + 9 * 3600e3);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ymd = `${k.getUTCFullYear()}${p2(k.getUTCMonth() + 1)}${p2(k.getUTCDate())}`;

  const rows: DartRow[] = [];
  let total = 0;
  for (let page = 1; page <= 6; page++) {
    try {
      const r = await fetch(
        `${BASE}/list.json?crtfc_key=${key}&bgn_de=${ymd}&end_de=${ymd}&page_no=${page}&page_count=100`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { status: string; total_count?: number; total_page?: number; list?: DartRow[] };
      if (j.status !== "000") break;
      total = j.total_count ?? total;
      rows.push(...(j.list || []));
      if (page >= (j.total_page ?? 1)) break;
    } catch {
      break;
    }
  }

  const seen = new Set<string>();
  const items: Disclosure[] = [];
  for (const x of rows) {
    if (!/^\d{6}$/.test(x.stock_code || "")) continue; // 상장사만
    const nm = (x.report_nm || "").trim();
    const type = classify(nm);
    if (!type) continue;
    const dedup = x.stock_code + "|" + nm;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    items.push({
      code: x.stock_code,
      name: x.corp_name,
      title: nm,
      type,
      link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept_no}`,
    });
  }
  // 유형 우선순위(계약·임상·투자 먼저)
  const order = CATS.map((c) => c.t);
  items.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return { date: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`, count: total, items };
}
