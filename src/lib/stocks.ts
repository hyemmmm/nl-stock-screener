// ──────────────────────────────────────────────────────────────────────────
// 회사명 → 종목코드 해석 + 테마 기반 관련주 보강 (공용).
//   AI가 낸 회사명은 사명변경·비상장·표기차이로 매칭 실패가 잦다.
//   변형까지 시도하고, 부족하면 네이버 테마 구성종목(주도주 순)으로 채운다.
// ──────────────────────────────────────────────────────────────────────────
import { searchStock } from "./catalyst";
import { fetchThemeStocks, type Theme } from "./issues";

export interface RelStock {
  name: string;
  code: string;
  via: "AI" | "테마";
  chg?: number | null; // 오늘 등락률(테마 보강분)
  reason?: string; // 테마 편입 사유(테마 보강분)
}

// ETF/ETN·레버리지·인버스 등 '기업이 아닌 상품' 제외
const NOT_STOCK =
  /KODEX|TIGER|KBSTAR|ARIRANG|ACE |SOL |PLUS |RISE |HANARO|KOSEF|ETN|ETF|레버리지|인버스|선물|채권|국고|미래에셋\s|삼성\s?[A-Z]/i;

// 회사명 → 종목. 공백제거·지주/홀딩스 제거 등 변형까지 시도.
export async function resolveStock(name: string): Promise<{ name: string; code: string } | null> {
  const variants = [
    name,
    name.replace(/\s/g, ""),
    name.replace(/(지주|홀딩스|그룹)$/, ""),
    name.replace(/^주식회사\s*/, ""),
    name.length > 3 ? name.slice(0, name.length - 1) : name,
  ];
  const tried = new Set<string>();
  for (const v of variants) {
    if (!v || v.length < 2 || tried.has(v)) continue;
    tried.add(v);
    const hits = (await searchStock(v)).filter((h) => !NOT_STOCK.test(h.name));
    if (hits[0]) return { name: hits[0].name, code: hits[0].code };
  }
  return null;
}

// 재료 텍스트로 네이버 테마 찾기 (문자열 토큰 포함 매칭)
export function matchTheme(themes: Theme[], texts: string[]): Theme | null {
  const toks = texts
    .join(" ")
    .split(/[\s·/(),]+/)
    .map((x) => x.replace(/업$|주$|산업$/, ""))
    .filter((x) => x.length >= 2)
    .slice(0, 12);
  return themes.find((t) => toks.some((tok) => t.name.includes(tok))) ?? null;
}

// AI가 낸 회사명 목록 → 종목 확정, 부족하면 매칭 테마의 주도주로 보강.
export async function buildRelatedStocks(
  names: string[],
  themes: Theme[],
  texts: string[],
  opts: { min?: number; max?: number } = {},
): Promise<{ stocks: RelStock[]; theme: Theme | null }> {
  const min = opts.min ?? 6;
  const max = opts.max ?? 8;
  const stocks: RelStock[] = [];
  const seen = new Set<string>();
  for (const n of names.slice(0, max)) {
    const hit = await resolveStock(n);
    if (hit && !seen.has(hit.code)) {
      seen.add(hit.code);
      stocks.push({ ...hit, via: "AI" });
    }
  }
  const theme = matchTheme(themes, texts);
  if (theme && stocks.length < min) {
    const ts = await fetchThemeStocks(theme.no).catch(() => []);
    for (const s of ts) {
      // 네이버가 등락률 내림차순으로 주므로 앞쪽 = 오늘 주도주
      if (stocks.length >= max || seen.has(s.code)) continue;
      seen.add(s.code);
      stocks.push({ name: s.name, code: s.code, via: "테마", chg: s.chg, reason: s.reason });
    }
  }
  return { stocks, theme };
}
