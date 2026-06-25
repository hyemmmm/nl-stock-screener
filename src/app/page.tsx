"use client";

import { useRef, useState } from "react";
import ResultCard from "@/components/ResultCard";
import ChartPanel from "@/components/ChartPanel";
import type { EnrichedStock, ScreenResponse } from "@/lib/types";

const EXAMPLES = [
  "전일 거래량 폭증 후 급감한 음봉 + 5일선 근접",
  "저평가 고배당 코스피 종목",
  "코스닥 반도체 급등주",
  "거래량 폭증 양봉 급등주",
  "배당수익률 5% 이상 은행주",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnrichedStock | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function setQueryAndGrow(value: string) {
    setQuery(value);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) autoGrow(el);
    });
  }

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
          원하는 조건을 한국어로 자유롭게 적어주세요. 여러 줄로 길게 써도 됩니다.
        </p>
      </header>

      {/* prompt-style composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-3 transition-colors focus-within:border-indigo-500">
          <textarea
            ref={taRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              // Enter 전송, Shift+Enter 줄바꿈
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                run(query);
              }
            }}
            rows={2}
            placeholder={
              "예) 전일 거래량이 전 거래일 대비 500% 이상 폭증한 뒤\n다음날 거래량이 25% 이하로 급감한 음봉 + 5일선과 이격이 작은 종목"
            }
            className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-white placeholder:text-zinc-600 outline-none"
          />
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[11px] text-zinc-600">
              <kbd className="rounded bg-ink-600 px-1 text-zinc-400">Enter</kbd> 전송 ·{" "}
              <kbd className="rounded bg-ink-600 px-1 text-zinc-400">Shift+Enter</kbd> 줄바꿈
            </span>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {loading ? "검색 중…" : "검색"}
            </button>
          </div>
        </div>
      </form>

      {/* example chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQueryAndGrow(ex);
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
            {data.filter.bearish === true && <Chip>음봉</Chip>}
            {data.filter.bearish === false && <Chip>양봉</Chip>}
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
