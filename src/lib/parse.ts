import Anthropic from "@anthropic-ai/sdk";
import { makeLabel } from "@/lib/fields";
import type { Condition, NumericField, Op, ScreenFilter } from "@/lib/types";

export interface ParseOutcome {
  filter: ScreenFilter;
  source: "claude" | "rules";
}

const VALID_FIELDS: NumericField[] = [
  "per",
  "pbr",
  "dividendYield",
  "marketCap",
  "roe",
  "price",
  "changePct",
  "volume",
  "volSurgeRatio",
  "volDropRatio",
  "gap5MAAbs",
  "tradingValue",
  "recentMaxVol",
];
const VALID_OPS: Op[] = ["<", "<=", ">", ">=", "=="];

/** Coerce arbitrary AI/string output into a safe Condition, or drop it. */
function coerceCondition(raw: unknown): Condition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const field = r.field as NumericField;
  const op = r.op as Op;
  const value = Number(r.value);
  if (!VALID_FIELDS.includes(field)) return null;
  if (!VALID_OPS.includes(op)) return null;
  if (!Number.isFinite(value)) return null;
  return { field, op, value, label: makeLabel(field, op, value) };
}

// ── Rule-based Korean fallback ─────────────────────────────────────────────
// Used when no ANTHROPIC_API_KEY is set, or if the Claude call fails.

interface Rule {
  test: RegExp;
  apply: (f: ScreenFilter) => void;
}

function addCond(f: ScreenFilter, field: NumericField, op: Op, value: number) {
  // de-dup: a later, more specific rule overrides the same field+op
  f.conditions = f.conditions.filter((c) => !(c.field === field && c.op === op));
  f.conditions.push({ field, op, value, label: makeLabel(field, op, value) });
}

const RULES: Rule[] = [
  // markets
  { test: /코스닥|kosdaq/i, apply: (f) => (f.market = "KOSDAQ") },
  { test: /코스피|kospi|유가증권/i, apply: (f) => (f.market = "KOSPI") },

  // valuation
  { test: /저평가|싼|저per|저 per|언더밸류/i, apply: (f) => addCond(f, "per", "<", 10) },
  { test: /고평가|비싼/i, apply: (f) => addCond(f, "per", ">", 30) },
  { test: /저pbr|자산가치|청산가치|pbr\s*1\s*미만/i, apply: (f) => addCond(f, "pbr", "<", 1) },

  // dividend — generic rule first so the more specific 고배당 rule wins the de-dup
  { test: /배당/i, apply: (f) => addCond(f, "dividendYield", ">", 2) },
  { test: /고배당|배당주|배당\s*높/i, apply: (f) => addCond(f, "dividendYield", ">", 4) },

  // size
  { test: /대형주|대형/i, apply: (f) => addCond(f, "marketCap", ">", 100000) },
  { test: /중소형주|중소형|소형주/i, apply: (f) => addCond(f, "marketCap", "<", 50000) },
  { test: /중형주/i, apply: (f) => addCond(f, "marketCap", "<", 100000) },

  // quality / momentum
  { test: /우량|고roe|roe\s*높|수익성/i, apply: (f) => addCond(f, "roe", ">", 10) },
  { test: /급등|상승|오른|강세/i, apply: (f) => addCond(f, "changePct", ">", 3) },
  { test: /급락|하락|내린|약세/i, apply: (f) => addCond(f, "changePct", "<", -2) },
  { test: /거래량\s*많|대량거래|활발/i, apply: (f) => addCond(f, "volume", ">", 1000000) },

  // ── technical / candle patterns ──
  // 전일 거래량 폭증 (전전일 대비 ≥500%)
  { test: /거래량\s*폭증|거래량\s*급증|폭증|거래량\s*터/i, apply: (f) => addCond(f, "volSurgeRatio", ">", 500) },
  // 다음날 거래량 급감 (전일 대비 ≤25%) — sort ascending so the lowest(best) float up
  {
    test: /거래량\s*급감|거래량\s*감소|거래량\s*죽|급감/i,
    apply: (f) => {
      addCond(f, "volDropRatio", "<", 25);
      f.sortBy = { field: "volDropRatio", dir: "asc" };
    },
  },
  // 음봉 / 양봉
  { test: /음봉|음전|빨간\s*거\s*아니/i, apply: (f) => (f.bearish = true) },
  { test: /양봉/i, apply: (f) => (f.bearish = false) },
  // 5일선 근접 / 이격 작음
  {
    test: /5일선|오일선|이격\s*(작|적|좁|크지\s*않)|5일\s*이동평균|맞닿|단기\s*이평\s*근접/i,
    apply: (f) => addCond(f, "gap5MAAbs", "<", 3),
  },
  // 최근 거래량 1000만/천만 이상 나온 적 (호재성 대량거래의 프록시)
  {
    test: /(거래량\s*)?(1[,]?000\s*만|천만)\s*(주)?\s*(이상|이상\s*나온|찍|돌파|터)/i,
    apply: (f) => addCond(f, "recentMaxVol", ">=", 10_000_000),
  },
];

const SECTORS = [
  "반도체", "2차전지", "바이오", "자동차", "은행", "보험", "통신", "게임",
  "인터넷", "화학", "철강", "엔터", "로봇", "정유", "건설", "전력", "해운",
];

function ruleBasedParse(query: string): ScreenFilter {
  const filter: ScreenFilter = { market: "ALL", sector: null, conditions: [] };
  for (const rule of RULES) {
    if (rule.test.test(query)) rule.apply(filter);
  }
  for (const s of SECTORS) {
    if (query.includes(s)) {
      filter.sector = s;
      break;
    }
  }
  // explicit numeric like "per 8 이하", "배당 5% 이상"
  const perMatch = query.match(/per\s*(\d+(?:\.\d+)?)\s*(이하|미만|이상|초과)?/i);
  if (perMatch) {
    const v = Number(perMatch[1]);
    const op: Op = /이상|초과/.test(perMatch[2] ?? "") ? ">" : "<";
    addCond(filter, "per", op, v);
  }
  const divMatch = query.match(/배당\D*(\d+(?:\.\d+)?)\s*%?\s*(이상|초과|이하|미만)?/);
  if (divMatch) {
    const v = Number(divMatch[1]);
    const op: Op = /이하|미만/.test(divMatch[2] ?? "") ? "<" : ">";
    addCond(filter, "dividendYield", op, v);
  }
  // 이격 N% (숫자 바로 뒤에 %가 있어야 함 — 멀리 있는 "1000만" 등을 잘못 잡지 않도록)
  const gapMatch = query.match(/이격[^0-9%]{0,3}(\d+(?:\.\d+)?)\s*%/);
  if (gapMatch) addCond(filter, "gap5MAAbs", "<", Number(gapMatch[1]));
  // 거래량 N% (이상 → 폭증, 이하 → 급감)
  const volPctMatch = query.match(/거래량\D*(\d{2,4})\s*%\s*(이상|초과|이하|미만)?/);
  if (volPctMatch) {
    const v = Number(volPctMatch[1]);
    if (/이하|미만/.test(volPctMatch[2] ?? "")) addCond(filter, "volDropRatio", "<", v);
    else addCond(filter, "volSurgeRatio", ">", v);
  }
  // 최근 거래량 N만(주) 이상 나온 적 — recentMaxVol (주)
  const recentVolMatch = query.match(
    /([\d,]+)\s*만\s*주?\s*(이상)?\s*(나온|찍|기록|돌파|터)/,
  );
  if (recentVolMatch) {
    const man = Number(recentVolMatch[1].replace(/,/g, ""));
    if (Number.isFinite(man)) addCond(filter, "recentMaxVol", ">=", man * 10_000);
  }

  const parts = filter.conditions.map((c) => c.label);
  if (filter.bearish === true) parts.push("음봉");
  if (filter.bearish === false) parts.push("양봉");
  filter.rationale = `규칙 기반 해석: ${parts.join(", ") || "조건 없음"}${
    filter.market !== "ALL" ? ` · ${filter.market}` : ""
  }${filter.sector ? ` · ${filter.sector}` : ""}`;
  return filter;
}

// ── Claude parser ──────────────────────────────────────────────────────────

const FILTER_TOOL: Anthropic.Tool = {
  name: "build_filter",
  description:
    "Convert a Korean natural-language stock screening request into a structured filter.",
  input_schema: {
    type: "object",
    properties: {
      market: { type: "string", enum: ["KOSPI", "KOSDAQ", "ALL"] },
      sector: {
        type: ["string", "null"],
        description:
          "A single Korean sector keyword if the user named one (예: 반도체, 2차전지, 은행, 바이오), else null.",
      },
      conditions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              enum: VALID_FIELDS,
              description:
                "marketCap/tradingValue are in 억원 (5000억 = 5000). dividendYield/roe/changePct/" +
                "volSurgeRatio/volDropRatio/gap5MAAbs are percents. " +
                "volSurgeRatio=전일거래량/전전일거래량×100, volDropRatio=당일거래량/전일거래량×100, " +
                "gap5MAAbs=|5일이동평균 이격도|.",
            },
            op: { type: "string", enum: VALID_OPS },
            value: { type: "number" },
          },
          required: ["field", "op", "value"],
        },
      },
      bearish: {
        type: ["boolean", "null"],
        description: "음봉만 보려면 true, 양봉만 false, 무관하면 null.",
      },
      sortBy: {
        type: ["object", "null"],
        properties: {
          field: { type: "string", enum: VALID_FIELDS },
          dir: { type: "string", enum: ["asc", "desc"] },
        },
      },
      limit: { type: "number" },
      rationale: {
        type: "string",
        description: "One short Korean sentence explaining how you interpreted the request.",
      },
    },
    required: ["market", "conditions", "rationale"],
  },
};

const SYSTEM = `너는 한국 주식 스크리너의 자연어 파서다.
사용자의 한국어 요청을 build_filter 도구의 인자로 변환한다.

[펀더멘털]
- 저평가 → PER<10 또는 PBR<1
- 고배당 → 배당수익률>4
- 우량/수익성 좋은 → ROE>10
- 대형주 → 시가총액>100000(억), 중소형주 → <50000(억)
- 급등 → 등락률>3, 급락 → 등락률<-2

[기술적/캔들 패턴]
- (전일) 거래량 폭증 → volSurgeRatio>500 (사용자가 500~1000% 등 명시하면 그 값 사용)
- (이후) 거래량 급감 → volDropRatio<25 (12% 미만이 더 좋다고 하면 그래도 25 이하로 잡되 sortBy를 volDropRatio asc로)
- 음봉 → bearish=true, 양봉 → bearish=false
- 5일선 이격이 작다/맞닿는다/근접 → gap5MAAbs<3
- "거래량 폭증 후 급감" 같이 두 단계면 volSurgeRatio와 volDropRatio 조건을 모두 넣는다.
- "최근 (N개월/두달) 안에 거래량 1000만(주) 이상 나온 적 있음" → recentMaxVol>=10000000 (단위: 주, 1000만=10000000). 윈도우는 서버에서 약 2개월(40거래일)로 고정.

참고: volSurgeRatio/volDropRatio/bearish/gap5MAAbs는 서버가 최근 약 20거래일을 스캔해 '신호일'을 찾아 그 시점 기준으로 평가한다(며칠 전 발생도 잡힘). 너는 조건만 만들면 된다.
명확한 숫자가 있으면 그대로 사용한다. 반드시 build_filter 도구를 호출한다.`;

async function claudeParse(query: string): Promise<ScreenFilter> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    // Sonnet handles compound technical conditions (폭증→급감+음봉+이격) more
    // reliably than Haiku; parsing is short so the cost difference is small.
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM,
    tools: [FILTER_TOOL],
    tool_choice: { type: "tool", name: "build_filter" },
    messages: [{ role: "user", content: query }],
  });

  const toolUse = resp.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool call");
  }
  const input = toolUse.input as Record<string, unknown>;

  const conditions = Array.isArray(input.conditions)
    ? input.conditions.map(coerceCondition).filter((c): c is Condition => c !== null)
    : [];

  const market = (["KOSPI", "KOSDAQ", "ALL"].includes(input.market as string)
    ? input.market
    : "ALL") as ScreenFilter["market"];

  const sortByRaw = input.sortBy as Record<string, unknown> | null;
  const sortBy =
    sortByRaw &&
    VALID_FIELDS.includes(sortByRaw.field as NumericField) &&
    (sortByRaw.dir === "asc" || sortByRaw.dir === "desc")
      ? { field: sortByRaw.field as NumericField, dir: sortByRaw.dir as "asc" | "desc" }
      : null;

  return {
    market,
    sector: typeof input.sector === "string" ? input.sector : null,
    conditions,
    bearish: typeof input.bearish === "boolean" ? input.bearish : null,
    sortBy,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    rationale: typeof input.rationale === "string" ? input.rationale : undefined,
  };
}

export async function parseQuery(query: string): Promise<ParseOutcome> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const filter = await claudeParse(query);
      return { filter, source: "claude" };
    } catch (err) {
      console.error("[parse] Claude failed, falling back to rules:", err);
    }
  }
  return { filter: ruleBasedParse(query), source: "rules" };
}
