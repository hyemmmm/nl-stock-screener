"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NewsItem {
  title: string;
  link: string;
  good: boolean;
  bad: boolean;
}
interface AttentionStock {
  code: string;
  name: string;
  rank: number;
  changePct: number | null;
  closePos: number | null;
  vsMa5: number | null;
  vsMa20: number | null;
  volMult: number | null;
  foreign: number;
  organ: number;
  indiv: number;
  foreign3: number;
  organ3: number;
  news: NewsItem[];
  themeName: string | null;
  themeChg: number | null;
  buySignals: string[];
  sellSignals: string[];
  score: number;
  verdict: string;
}
interface AttentionResult {
  date: string;
  topThemes: { name: string; chg: number }[];
  stocks: AttentionStock[];
  error?: string;
}

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down");
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const qty = (n: number) => {
  const s = n >= 0 ? "+" : "-";
  const a = Math.abs(n);
  return a >= 10000 ? `${s}${(a / 10000).toFixed(1)}만` : `${s}${a.toLocaleString()}`;
};

export default function AttentionPage() {
  const [data, setData] = useState<AttentionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyBuy, setOnlyBuy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attention", { cache: "no-store" });
      const json = (await res.json()) as AttentionResult;
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const shown = (data?.stocks ?? []).filter((s) => !onlyBuy || s.score >= 1);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            🔍 관심 종목 판별
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            조회수 상위 = 관심이 몰린 <b className="text-zinc-300">후보 풀</b>. 그 관심이{" "}
            <span className="text-up">사려는 관심</span>인지{" "}
            <span className="text-down">팔려는 관심</span>인지 재료·차트·거래량·시황·수급으로 분해.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "분석 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {data?.topThemes?.length ? (
        <div className="mb-4 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2 text-xs">
          <span className="mr-2 text-zinc-500">오늘 강세 테마</span>
          {data.topThemes.map((t, i) => (
            <span key={t.name} className="mr-3">
              {i > 0 && <span className="mr-3 text-zinc-700">·</span>}
              <span className="text-zinc-300">{t.name}</span>{" "}
              <span className={cls(t.chg)}>{pct(t.chg)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          조회수 상위 종목의 수급·차트·뉴스 분석 중… (약 20~40초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              판정 점수순 · 조회수 순위는 <span className="text-zinc-400">#숫자</span>
            </p>
            <button
              onClick={() => setOnlyBuy(!onlyBuy)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                onlyBuy
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                  : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              매수 관심만 보기
            </button>
          </div>

          <div className="space-y-3">
            {shown.map((s) => (
              <div key={s.code} className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-600">#{s.rank}</span>
                      <a
                        href={naver(s.code)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-white hover:underline"
                      >
                        {s.name}
                      </a>
                      <span className={`text-sm font-medium ${cls(s.changePct)}`}>
                        {pct(s.changePct)}
                      </span>
                      {s.themeChg != null && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            s.themeChg >= 2 ? "bg-up/15 text-up" : "bg-zinc-500/15 text-zinc-400"
                          }`}
                        >
                          {s.themeName} {pct(s.themeChg)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      종가위치 {s.closePos?.toFixed(0)}% · 5일선 {pct(s.vsMa5)} · 20일선{" "}
                      {pct(s.vsMa20)} · 거래량{" "}
                      {s.volMult != null ? `${s.volMult.toFixed(1)}배` : "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold">{s.verdict}</div>
                    <div className="text-[10px] text-zinc-600">점수 {s.score.toFixed(1)}</div>
                  </div>
                </div>

                {/* 수급 */}
                <div className="mt-2 flex flex-wrap gap-3 rounded-lg bg-ink-900/50 px-3 py-2 text-xs">
                  <span className="text-zinc-500">전일 수급</span>
                  <span>
                    외국인 <b className={s.foreign >= 0 ? "text-up" : "text-down"}>{qty(s.foreign)}</b>
                  </span>
                  <span>
                    기관 <b className={s.organ >= 0 ? "text-up" : "text-down"}>{qty(s.organ)}</b>
                  </span>
                  <span>
                    개인 <b className={s.indiv >= 0 ? "text-up" : "text-down"}>{qty(s.indiv)}</b>
                  </span>
                  <span className="text-zinc-600">
                    3일누적 외 {qty(s.foreign3)} · 기 {qty(s.organ3)}
                  </span>
                </div>

                {/* 근거 */}
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div>
                    {s.buySignals.map((x, i) => (
                      <div key={i} className="text-xs text-up">
                        ▲ {x}
                      </div>
                    ))}
                  </div>
                  <div>
                    {s.sellSignals.map((x, i) => (
                      <div key={i} className="text-xs text-down">
                        ▼ {x}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 재료 */}
                {s.news.length > 0 && (
                  <div className="mt-2 border-t border-ink-700/50 pt-2">
                    {s.news.map((n, i) => (
                      <a
                        key={i}
                        href={n.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs leading-relaxed text-zinc-400 hover:text-zinc-200"
                      >
                        <span className={n.good ? "text-up" : n.bad ? "text-down" : "text-zinc-600"}>
                          ›
                        </span>{" "}
                        {n.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        조회수 순위는 실시간 스냅샷 · 수급·차트는 전일 확정치 · 판정은 규칙 기반 참고용 ·
        <b> 하나 고르는 건 본인</b>
      </footer>
    </main>
  );
}
