import Anthropic from "@anthropic-ai/sdk";
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
];
const VALID_OPS: Op[] = ["<", "<=", ">", ">=", "=="];

const FIELD_LABEL: Record<NumericField, string> = {
  per: "PER",
  pbr: "PBR",
  dividendYield: "배당수익률",
  marketCap: "시가총액",
  roe: "ROE",
  price: "주가",
  changePct: "등락률",
  volume: "거래량",
};

function unitFor(field: NumericField): string {
  if (field === "marketCap") return "억";
  if (field === "dividendYield" || field === "roe" || field === "changePct") return "%";
  if (field === "volume") return "주";
  if (field === "price") return "원";
  return "";
}

function makeLabel(field: NumericField, op: Op, value: number): string {
  return `${FIELD_LABEL[field]} ${op} ${value.toLocaleString()}${unitFor(field)}`;
}

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
  { test: /중소형주|중소형|소형주|작은/i, apply: (f) => addCond(f, "marketCap", "<", 50000) },
  { test: /중형주/i, apply: (f) => addCond(f, "marketCap", "<", 100000) },

  // quality / momentum
  { test: /우량|고roe|roe\s*높|수익성/i, apply: (f) => addCond(f, "roe", ">", 10) },
  { test: /급등|상승|오른|강세/i, apply: (f) => addCond(f, "changePct", ">", 3) },
  { test: /급락|하락|내린|약세/i, apply: (f) => addCond(f, "changePct", "<", -2) },
  { test: /거래량\s*많|대량거래|활발/i, apply: (f) => addCond(f, "volume", ">", 1000000) },
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

  filter.rationale = `규칙 기반 해석: ${
    filter.conditions.map((c) => c.label).join(", ") || "조건 없음"
  }${filter.market !== "ALL" ? ` · ${filter.market}` : ""}${
    filter.sector ? ` · ${filter.sector}` : ""
  }`;
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
                "marketCap is in 억원 (e.g. 5000억 = 5000). dividendYield/roe/changePct are percents.",
            },
            op: { type: "string", enum: VALID_OPS },
            value: { type: "number" },
          },
          required: ["field", "op", "value"],
        },
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
- 저평가 → PER<10 또는 PBR<1
- 고배당 → 배당수익률>4
- 우량/수익성 좋은 → ROE>10
- 대형주 → 시가총액>100000(억), 중소형주 → <50000(억)
- 급등 → 등락률>3, 급락 → 등락률<-2
명확한 숫자가 있으면 그대로 사용한다. 반드시 build_filter 도구를 호출한다.`;

async function claudeParse(query: string): Promise<ScreenFilter> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
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
