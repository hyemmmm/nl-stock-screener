"use client";

import { useState } from "react";
import ResultCard from "@/components/ResultCard";
import ChartPanel from "@/components/ChartPanel";
import type { ScreenResponse, Stock } from "@/lib/types";

const EXAMPLES = [
  "저평가 고배당 코스피 종목",
  "PER 10 이하 우량주",
  "코스닥 반도체 급등주",
  "배당수익률 5% 이상 은행주",
  "시가총액 큰 2차전지",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Stock | null>(null);

  async function run(q: string) {
    const text = q.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const json = (await res.json()) as ScreenResponse & { error?: string };
      if (json.error) {
        setError(json.error);
        setData(null);
      } else {
        setData(json);
        if (json.results[0]) setSelected(json.results[0].stock);
      }
    } catch {
      setError("검색 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          자연어 종목 스크리너
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          원하는 조건을 한국어로 입력하면 종목을 찾아줍니다.{" "}
          <span className="text-zinc-500">
            예: &ldquo;저평가 고배당 코스닥 중소형주&rdquo;
          </span>
        </p>
      </header>

      {/* search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="조건을 자연어로 입력하세요…"
          className="flex-1 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </form>

      {/* example chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQuery(ex);
              run(ex);
            }}
            className="rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-ink-500 hover:text-zinc-200"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* interpreted filter banner */}
      {data && (
        <div className="mt-6 rounded-xl border border-ink-600 bg-ink-800/60 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                data.source === "claude"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {data.source === "claude" ? "Claude 해석" : "규칙 기반 해석"}
            </span>
            <span className="text-zinc-300">{data.filter.rationale}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.filter.market && data.filter.market !== "ALL" && (
              <Chip>{data.filter.market}</Chip>
            )}
            {data.filter.sector && <Chip>{data.filter.sector}</Chip>}
            {data.filter.conditions.map((c, i) => (
              <Chip key={i}>{c.label}</Chip>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-up/30 bg-up/10 p-4 text-sm text-up">
          {error}
        </p>
      )}

      {/* results + chart */}
      {data && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-3 text-sm text-zinc-400">
              <span className="font-semibold text-white">{data.count}</span>개 종목
            </div>
            {data.count === 0 ? (
              <p className="rounded-xl border border-ink-600 bg-ink-800 p-6 text-sm text-zinc-500">
                조건에 맞는 종목이 없습니다. 조건을 완화해 보세요.
              </p>
            ) : (
              <div className="flex max-h-[640px] flex-col gap-3 overflow-y-auto scroll-thin pr-1">
                {data.results.map((r) => (
                  <ResultCard
                    key={r.stock.code}
                    result={r}
                    selected={selected?.code === r.stock.code}
                    onSelect={() => setSelected(r.stock)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <ChartPanel stock={selected} />
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="mt-16 text-center text-sm text-zinc-600">
          위 예시를 눌러보거나 직접 조건을 입력해 검색을 시작하세요.
        </div>
      )}

      <footer className="mt-16 border-t border-ink-700 pt-6 text-center text-xs text-zinc-600">
        Next.js · Claude API · KIS Open API · TradingView Lightweight Charts ·
        포트폴리오 데모 (투자 자문 아님)
      </footer>
    </main>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-ink-600 px-2 py-0.5 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}
